import type { WebSocket } from "ws";
import { generateImage, PLACEHOLDER_IMAGE } from "./services/imageGeneration";

const WORDS = [
  "elephant", "basketball", "sunshine", "guitar", "rainbow",
  "butterfly", "spaceship", "waterfall", "dragon", "pizza"
];

type Player = {
  id: number;
  name: string;
  isDrawer: boolean;
  score: number;
};

type Room = {
  id: number;
  code: string;
  status: 'waiting' | 'playing' | 'ended';
  currentRound: number;
  players: Player[];
  word?: string;
  drawerPrompts: string[];
  guesses: Array<{ text: string; player: string; timestamp: string }>;
  currentImage?: string | null;
  attemptsLeft?: number;
};

const rooms = new Map<string, Room>();
let nextRoomId = 1;
let nextPlayerId = 1;

export function setupGameHandlers(ws: WebSocket, roomCode: string) {
  let gameState: Room | null = null;

  const updateGameState = async () => {
    try {
      const room = rooms.get(roomCode);

      if (!room) {
        console.error(`Room not found: ${roomCode}`);
        return;
      }

      // Initialize word if not set
      if (!room.word) {
        room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
      }

      gameState = {
        ...room,
        attemptsLeft: 3 - (room.drawerPrompts?.length || 0),
        currentImage: room.drawerPrompts?.length 
          ? await generateImage(room.drawerPrompts[room.drawerPrompts.length - 1])
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
      if (!gameState) return;

      const room = rooms.get(roomCode);
      if (!room) return;

      // First send a loading state
      ws.send(JSON.stringify({
        ...gameState,
        currentImage: null
      }));

      // Generate image using Stability AI
      const imageUrl = await generateImage(prompt);
      room.drawerPrompts.push(prompt);
      room.currentImage = imageUrl;

      // Update state with generated image
      gameState = {
        ...room,
        currentImage: imageUrl,
        attemptsLeft: Math.max(0, (gameState.attemptsLeft || 3) - 1)
      };

      // Send final state with image
      ws.send(JSON.stringify(gameState));

    } catch (error) {
      console.error('Failed to handle prompt:', error);
      ws.send(JSON.stringify({ error: 'Failed to handle prompt' }));
    }
  };

  const handleGuess = async (guess: string) => {
    try {
      if (!gameState) return;

      const room = rooms.get(roomCode);
      if (!room) return;

      const guessingPlayer = room.players.find(p => !p.isDrawer);
      if (!guessingPlayer) return;

      // Add the guess to the room's guesses
      room.guesses.push({
        text: guess,
        player: guessingPlayer.name,
        timestamp: new Date().toISOString()
      });

      // Check if the guess is correct
      if (guess.toLowerCase() === room.word?.toLowerCase()) {
        // Update scores
        const pointsEarned = { guesser: 10, drawer: 5 };
        
        room.players = room.players.map(player => ({
          ...player,
          score: player.score + (player.isDrawer ? pointsEarned.drawer : pointsEarned.guesser),
          isDrawer: !player.isDrawer // Swap roles
        }));

        // Reset for new round
        room.currentRound += 1;
        room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
        room.drawerPrompts = [];
        room.guesses = [];
        room.currentImage = null;

        // Send success message
        ws.send(JSON.stringify({
          type: 'roundComplete',
          message: 'Correct guess! Starting new round...',
          pointsEarned
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
    // Handle cleanup if needed
  });

  // Initialize game state
  updateGameState().catch(error => {
    console.error('Failed to initialize game state:', error);
  });
}

export { rooms, type Room };
