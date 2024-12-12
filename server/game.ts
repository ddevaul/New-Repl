import type { WebSocket } from "ws";
import { rooms, players, rounds } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateImage, PLACEHOLDER_IMAGE } from "./services/imageGeneration";
import { type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from "../db/schema";

const WORDS = [
  "elephant", "basketball", "sunshine", "guitar", "rainbow",
  "butterfly", "spaceship", "waterfall", "dragon", "pizza"
];

type DrizzleClient = NeonDatabase<typeof schema>;

// Track WebSocket connections for each room
const roomConnections = new Map<string, Set<WebSocket>>();

export function setupGameHandlers(ws: WebSocket, roomCode: string, db: DrizzleClient) {
  let gameState: any = null;

  // Add this connection to the room
  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Set());
  }
  roomConnections.get(roomCode)?.add(ws);

  // Broadcast to all clients in the room except sender
  const broadcast = (data: any, excludeWs?: WebSocket) => {
    const connections = roomConnections.get(roomCode);
    if (!connections) return;

    const message = JSON.stringify(data);
    for (const client of connections) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  const updateGameState = async () => {
    try {
      const room = await db.query.rooms.findFirst({
        where: eq(rooms.code, roomCode),
        with: {
          players: true,
          rounds: {
            where: eq(rounds.isCompleted, false),
            limit: 1,
            orderBy: [{ id: "desc" }]
          }
        }
      });

      if (!room) {
        console.error(`Room not found: ${roomCode}`);
        ws.close();
        return;
      }

      // Notify all players about new joins
      if (!gameState) {
        broadcast({
          type: 'playerUpdate',
          joined: true,
          playerName: room.players[room.players.length - 1]?.name
        }, ws);
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
          : null,
        guessData: room.rounds[0]?.guessData ? JSON.parse(room.rounds[0].guessData) : []
      };

      // Send game state to all connected clients
      broadcast(gameState);
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

      // Broadcast loading state to all players
      broadcast({
        ...gameState,
        currentImage: null,
        attemptsLeft: gameState.attemptsLeft - 1,
        error: null
      });

      // Update game state with the generated image
      gameState = {
        ...gameState,
        currentImage: imageUrl,
        attemptsLeft: gameState.attemptsLeft - 1,
        error: imageUrl === PLACEHOLDER_IMAGE ? "Image generation failed. Please try again once API key is configured." : null
      };

      // Broadcast final state with image to all players
      broadcast(gameState);
      
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

      const guessingPlayer = gameState.players.find((p: any) => !p.isDrawer);
      const formattedGuess = {
        playerId: guessingPlayer.id,
        playerName: guessingPlayer.name,
        guess,
        isCorrect: guess.toLowerCase() === round.word.toLowerCase()
      };

      const currentGuessData = round.guessData ? JSON.parse(round.guessData) : [];
      const updatedGuessData = [...currentGuessData, formattedGuess];

      await db.update(rounds)
        .set({
          guesses: [...(round.guesses || []), guess],
          guessData: JSON.stringify(updatedGuessData),
          isCompleted: formattedGuess.isCorrect
        })
        .where(eq(rounds.id, round.id));

      // Broadcast updated game state to all players
      await updateGameState();

      if (formattedGuess.isCorrect) {
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

        // Broadcast round completion to all players
        broadcast({
          type: 'roundComplete',
          message: 'Correct guess! Starting new round...',
          pointsEarned: { guesser: 10, drawer: 5 }
        });
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

  ws.on("close", async () => {
    try {
      // Remove this connection from the room
      roomConnections.get(roomCode)?.delete(ws);
      if (roomConnections.get(roomCode)?.size === 0) {
        roomConnections.delete(roomCode);
      }

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.code, roomCode),
        with: {
          players: true
        }
      });

      if (room) {
        // Notify remaining players about disconnection
        broadcast({
          type: 'playerUpdate',
          joined: false,
          playerName: room.players[room.players.length - 1]?.name
        }, ws);
      }
    } catch (error) {
      console.error('Error handling WebSocket close:', error);
    }
  });

  // Initialize game state
  updateGameState().catch(error => {
    console.error('Failed to initialize game state:', error);
  });
}
