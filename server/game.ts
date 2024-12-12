import type { WebSocket } from "ws";
import { rooms, players, rounds } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateImage } from "./services/imageGeneration";
import { type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from "../db/schema";

const WORDS = [
  "elephant", "basketball", "sunshine", "guitar", "rainbow",
  "butterfly", "spaceship", "waterfall", "dragon", "pizza"
];

type DrizzleClient = NeonDatabase<typeof schema>;

export function setupGameHandlers(ws: WebSocket, roomCode: string, db: DrizzleClient) {
  let gameState: any = null;

  const updateGameState = async () => {
    try {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.code, roomCode),
        with: {
          players: true,
          rounds: {
            where: eq(rounds.isCompleted, false),
            limit: 1
          }
        }
      });

      if (!room) {
        console.error(`Room not found: ${roomCode}`);
        return;
      }

      // Create initial round if none exists
      if (!room.rounds || room.rounds.length === 0) {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        await db.insert(rounds).values({
          roomId: room.id,
          word,
          drawerPrompts: [],
          guesses: []
        });
        return updateGameState();
      }

      gameState = {
        roomId: room.id,
        currentRound: room.currentRound,
        players: room.players,
        word: room.rounds[0]?.word,
        attemptsLeft: 3 - (room.rounds[0]?.drawerPrompts?.length || 0),
        currentImage: room.rounds[0]?.drawerPrompts?.length 
          ? await generateImage(room.rounds[0].drawerPrompts[room.rounds[0].drawerPrompts.length - 1])
          : null
      };

      ws.send(JSON.stringify(gameState));
    } catch (error) {
      console.error('Failed to update game state:', error);
      ws.send(JSON.stringify({ error: 'Failed to update game state' }));
    }
  };

  const handlePrompt = async (prompt: string) => {
    try {
      if (!gameState || gameState.attemptsLeft === 0) {
        ws.send(JSON.stringify({ error: 'Invalid game state or no attempts left' }));
        return;
      }

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.roomId, gameState.roomId)
      });

      if (!round) {
        ws.send(JSON.stringify({ error: 'Round not found' }));
        return;
      }

      // Generate image using Stability AI
      const imageUrl = await generateImage(prompt);
      console.log('Generated image URL:', imageUrl?.substring(0, 50) + '...');

      // Update the round with the new prompt
      await db.update(rounds)
        .set({
          drawerPrompts: [...(round.drawerPrompts || []), prompt]
        })
        .where(eq(rounds.id, round.id));

      // First send a loading state
      ws.send(JSON.stringify({
        ...gameState,
        currentImage: null,
        attemptsLeft: gameState.attemptsLeft - 1,
        error: null
      }));

      // Then send the actual image once generated
      gameState = {
        ...gameState,
        currentImage: imageUrl,
        attemptsLeft: gameState.attemptsLeft - 1,
        error: imageUrl === PLACEHOLDER_IMAGE ? "Image generation failed. Please try again once API key is configured." : null
      };

      // Send final state with image to client
      ws.send(JSON.stringify(gameState));
      
      // Log success
      console.log('Successfully handled prompt:', {
        roomId: gameState.roomId,
        attemptsLeft: gameState.attemptsLeft,
        hasImage: !!gameState.currentImage
      });
    } catch (error) {
      console.error('Failed to handle prompt:', error);
      ws.send(JSON.stringify({ 
        error: 'Failed to handle prompt',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  };

  const handleGuess = async (guess: string) => {
    try {
      if (!gameState || gameState.attemptsLeft === 0) return;

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.roomId, gameState.roomId)
      });

      if (!round) return;

      await db.update(rounds)
        .set({
          guesses: [...(round.guesses || []), guess],
          isCompleted: guess.toLowerCase() === round.word.toLowerCase()
        })
        .where(eq(rounds.id, round.id));

      if (guess.toLowerCase() === round.word.toLowerCase()) {
        // Update score for the guesser
        const guessingPlayer = gameState.players.find((p: any) => !p.isDrawer);
        if (guessingPlayer) {
          const pointsEarned = 10;
          await db.update(players)
            .set({ 
              score: guessingPlayer.score + pointsEarned,
              isDrawer: !guessingPlayer.isDrawer // Swap roles
            })
            .where(eq(players.id, guessingPlayer.id));

          // Also give points to the drawer
          const drawingPlayer = gameState.players.find((p: any) => p.isDrawer);
          if (drawingPlayer) {
            await db.update(players)
              .set({ 
                score: drawingPlayer.score + 5,
                isDrawer: !drawingPlayer.isDrawer // Swap roles
              })
              .where(eq(players.id, drawingPlayer.id));
          }
        }

        // Start new round
        const newWord = WORDS[Math.floor(Math.random() * WORDS.length)];
        await db.insert(rounds).values({
          roomId: gameState.roomId,
          word: newWord
        });

        await db.update(rooms)
          .set({ currentRound: gameState.currentRound + 1 })
          .where(eq(rooms.id, gameState.roomId));

        // Send a success message to the client
        ws.send(JSON.stringify({
          type: 'roundComplete',
          message: 'Correct guess! Starting new round...',
          pointsEarned: { guesser: 10, drawer: 5 }
        }));
      }

      await updateGameState();
    } catch (error) {
      console.error('Failed to handle guess:', error);
      ws.send(JSON.stringify({ error: 'Failed to handle guess' }));
    }
  };

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case "prompt":
          await handlePrompt(message.prompt);
          break;
        case "guess":
          await handleGuess(message.guess);
          break;
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    // Cleanup
  });

  // Initialize game state
  updateGameState().catch(error => {
    console.error('Failed to initialize game state:', error);
  });
}
