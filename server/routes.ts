import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { signup, login, authMiddleware, checkGameLimit } from "./auth.js";
import { isAdmin, getAllUsers, updateUserGamesLimit, addWord, uploadImage, generateImages, getStatus } from "./admin.js";
import { 
  rooms, 
  type Room, 
  setupGameHandlers, 
  getRandomWord,
  roomConnections
} from "./game.js";
import { getAllActivities } from "./services/activityLogger.js";
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
  app.get("/api/admin/activity-logs", authMiddleware, isAdmin, async (req, res) => {
    try {
      const logs = await getAllActivities();
      res.json(logs);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).send("Error fetching activity logs");
    }
  });
  
  // Word and image management routes (admin only)
  app.post("/api/admin/words", authMiddleware, isAdmin, addWord);
  app.post("/api/admin/words/:word/images", authMiddleware, isAdmin, uploadImage);
  app.post("/api/admin/words/:word/generate", authMiddleware, isAdmin, generateImages);
  app.get("/api/admin/words/status", authMiddleware, isAdmin, getStatus);

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
        isDrawer: false, // In single player, player is always the guesser
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
        // In single player, player is always the guesser
        room.players[0].isDrawer = false; // Force player to be guesser
        room.status = 'playing';
        room.currentImage = PLACEHOLDER_IMAGE; // Set placeholder initially
        
        // Set initial game state
        room.waitingForPrompt = false; // AI handles image selection
        room.waitingForGuess = true;   // Waiting for player's guess
        room.drawerPrompts = [];       // No prompts needed in single player
        room.attemptsLeft = 3;         // Player gets 3 attempts to guess

        // Get or generate an image for the word
        try {
          if (!room.word) {
            console.error('No word provided for single player game');
            throw new Error('Word not set for single player game');
          }
          
          console.log('Starting single player game for word:', room.word);
          
          // Try to get pre-generated image first
          const preGenerated = await db.query.preGeneratedImages.findMany({
            where: eq(preGeneratedImages.word, room.word.toLowerCase())
          });

          if (preGenerated && preGenerated.length > 0) {
            // Use a pre-generated image if available
            const randomImage = preGenerated[Math.floor(Math.random() * preGenerated.length)];
            console.log(`Using pre-generated image ${randomImage.id} for word:`, room.word);
            room.currentImage = randomImage.imageUrl;
          } else {
            // Generate a new image if none exists
            console.log('No pre-generated images found, generating new one for:', room.word);
            const prompt = `A simple, clear illustration of ${room.word}. Digital art style, minimalist design.`;
            const imageUrl = await generateImage(prompt);
            room.currentImage = imageUrl;
          }
          
          console.log('Successfully initialized single player game with image');
        } catch (error) {
          console.error('Single player initialization error:', error);
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

// Image generation is now handled by imageGeneration.ts