import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { signup, login, authMiddleware, checkGameLimit } from "./auth.js";
import { isAdmin, getAllUsers, updateUserGamesLimit } from "./admin.js";
import { 
  rooms, 
  type Room, 
  setupGameHandlers, 
  getRandomWord
} from "./game.js";
import { db } from "../db/index.js";
import { highScores, preGeneratedImages } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { generateImage } from "./services/imageGeneration.js";
import { PLACEHOLDER_IMAGE } from "./services/imageGeneration.js";

let nextRoomId = 1;
let nextPlayerId = 1;

export function registerRoutes(app: Express): Server {
  // Auth routes
  app.post("/api/auth/signup", signup);
  app.post("/api/auth/login", login);

  // Admin routes
  app.get("/api/admin/users", authMiddleware, isAdmin, getAllUsers);
  app.put("/api/admin/users/:userId/games-limit", authMiddleware, isAdmin, updateUserGamesLimit);

  // Get leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const scores = await db.query.highScores.findMany({
        orderBy: [desc(highScores.score)],
        limit: 10
      });
      res.json(scores);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  

  // Create room (protected route)
  app.post("/api/rooms", authMiddleware, checkGameLimit, async (req, res) => {
    const { playerName, gameMode = "multi" } = req.body;
    if (!playerName) {
      return res.status(400).json({ message: "Player name is required" });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      id: nextRoomId++,
      code,
      status: gameMode === "single" ? 'playing' : 'waiting',
      currentRound: 1,
      players: [{
        id: nextPlayerId++,
        name: playerName,
        isDrawer: gameMode === "multi",
        score: 0
      }],
      word: getRandomWord(),
      drawerPrompts: [],
      guesses: [],
      currentImage: null,
      attemptsLeft: 3,
      waitingForGuess: false,
      waitingForPrompt: false,
      gameMode
    };

    if (gameMode === "single") {
        room.players[0].isDrawer = false; // In single player, you're the guesser
        room.status = 'playing';
        // Generate an AI image for the word
        try {
          console.log('Generating AI image for word:', room.word);
          const imageData = await generateImage(`A simple illustration of ${room.word}`);
          if (imageData.startsWith('data:image')) {
            console.log('Successfully generated base64 image');
            room.currentImage = imageData;
            room.waitingForPrompt = false;
            room.waitingForGuess = true;
          } else {
            console.error('Invalid image data received');
            room.currentImage = PLACEHOLDER_IMAGE;
          }
        } catch (error) {
          console.error('Failed to generate image for single player:', error);
          room.currentImage = PLACEHOLDER_IMAGE;
        }
      }
    
    rooms.set(code, room);
    console.log(`Created room ${code} with word "${room.word}"`);
    res.json({ 
      code: room.code,
      playerId: room.players[0].id
    });
  });

  // Join room
  app.post("/api/rooms/:code/join", (req, res) => {
    const { code } = req.params;
    const { playerName } = req.body;

    const room = rooms.get(code.toUpperCase());

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.players.length >= 2) {
      return res.status(400).json({ message: "Room is full" });
    }

    const newPlayer = {
      id: nextPlayerId++,
      name: playerName,
      isDrawer: false,
      score: 0
    };

    room.players.push(newPlayer);

    if (room.players.length === 2) {
      room.status = 'playing';
      console.log(`Game starting in room ${code} with word "${room.word}"`);
    }

    console.log(`Player ${playerName} (ID: ${newPlayer.id}) joined room ${code} as guesser`);

    res.json({ 
      code: room.code,
      playerId: newPlayer.id
    });
  });

  // Get room
  app.get("/api/rooms/:code", (req, res) => {
    const { code } = req.params;
    const room = rooms.get(code.toUpperCase());

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.json(room);
  });

  // Create HTTP server
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket handling
  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url;
    if (!url) return socket.destroy();

    // Skip WebSocket validation for Vite HMR connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    const match = url.match(/^\/ws\/room\/([A-Z0-9]{6})\?playerId=(\d+)$/i);
    if (!match) {
      console.log('Invalid WebSocket URL format:', url);
      return socket.destroy();
    }

    const [, roomCode, playerId] = match;
    const upperRoomCode = roomCode.toUpperCase();
    if (!rooms.has(upperRoomCode)) {
      console.log('Room not found:', upperRoomCode);
      return socket.destroy();
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`WebSocket connection established for player ${playerId} in room ${upperRoomCode}`);
      setupGameHandlers(ws, upperRoomCode, url);
    });
  });

  return httpServer;
}

// Placeholder for the actual image generation function.  Replace this with your implementation.
async function generateImage(prompt: string): Promise<string> {
  // Replace with your actual image generation logic using an API or library.
  // This example simulates a successful image generation.
  return `/generated_images/${prompt.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
}