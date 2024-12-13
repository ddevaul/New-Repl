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
        console.log('Starting single player game image generation for word:', room.word);
        try {
          if (!room.word) {
            console.error('No word provided for image generation');
            room.currentImage = PLACEHOLDER_IMAGE;
          } else {
            console.log('Calling image generation service for word:', room.word);
            const imageData = await generateImage(room.word);
            
            if (imageData === PLACEHOLDER_IMAGE) {
              console.log('Received placeholder image from generation service');
              room.currentImage = PLACEHOLDER_IMAGE;
            } else if (imageData.startsWith('data:image/png;base64,')) {
              console.log('Successfully received base64 image data');
              room.currentImage = imageData;
            } else {
              console.error('Unexpected image data format:', imageData.substring(0, 100));
              room.currentImage = PLACEHOLDER_IMAGE;
            }
          }
        } catch (error: any) {
          console.error('Single player image generation error:', error);
          room.currentImage = PLACEHOLDER_IMAGE;
        }
        
        // Always set these states regardless of image generation outcome
        room.waitingForPrompt = false;
        room.waitingForGuess = true;
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

// Image generation is now handled by imageGeneration.ts