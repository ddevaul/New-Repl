import type { WebSocket } from "ws";
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { rooms, players, rounds } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateImage } from "./services/imageGeneration";

const WORDS = [
  "elephant", "basketball", "sunshine", "guitar", "rainbow",
  "butterfly", "spaceship", "waterfall", "dragon", "pizza"
];

type DrizzleClient = NeonDatabase;

export function setupGameHandlers(ws: WebSocket, roomCode: string, db: DrizzleClient) {
  let gameState: any = null;

  const updateGameState = async () => {
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

    if (!room) return;

    gameState = {
      roomId: room.id,
      currentRound: room.currentRound,
      players: room.players,
      word: room.rounds[0]?.word,
      attemptsLeft: 3 - (room.rounds[0]?.drawerPrompts?.length || 0),
      currentImage: null // In a real implementation, this would be the AI-generated image URL
    };

    ws.send(JSON.stringify(gameState));
  };

  const handlePrompt = async (prompt: string) => {
    if (!gameState || gameState.attemptsLeft === 0) return;

    const round = await db.query.rounds.findFirst({
      where: eq(rounds.roomId, gameState.roomId)
    });

    if (!round) return;

    // Generate image using Stability AI
    const imageUrl = await generateImage(prompt);

    await db.update(rounds)
      .set({
        drawerPrompts: [...(round.drawerPrompts || []), prompt]
      })
      .where(eq(rounds.id, round.id));

    gameState.currentImage = imageUrl;
    gameState.attemptsLeft--;

    ws.send(JSON.stringify(gameState));
  };

  const handleGuess = async (guess: string) => {
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
      // Start new round
      const newWord = WORDS[Math.floor(Math.random() * WORDS.length)];
      await db.insert(rounds).values({
        roomId: gameState.roomId,
        word: newWord
      });

      await db.update(rooms)
        .set({ currentRound: gameState.currentRound + 1 })
        .where(eq(rooms.id, gameState.roomId));

      // Swap roles
      await Promise.all(gameState.players.map((player: any) =>
        db.update(players)
          .set({ isDrawer: !player.isDrawer })
          .where(eq(players.id, player.id))
      ));
    }

    await updateGameState();
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
  updateGameState();
}
