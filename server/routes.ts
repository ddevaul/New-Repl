import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { 
  rooms, 
  type Room, 
  setupGameHandlers, 
  getRandomWord,
  getCategories,
  addCategory,
  addWordToCategory
} from "./game.js";
import { db } from "../db/index.js";
import { highScores } from "../db/schema.js";
import { desc } from "drizzle-orm";

let nextRoomId = 1;
let nextPlayerId = 1;

export function registerRoutes(app: Express): Server {
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

  // Get word categories
  app.get("/api/categories", (req, res) => {
    try {
      const categories = getCategories();
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Add new category
  app.post("/api/categories", (req, res) => {
    const { categoryId, name, description } = req.body;
    
    if (!categoryId || !name) {
      return res.status(400).json({ message: "Category ID and name are required" });
    }

    if (addCategory(categoryId, name, description)) {
      res.json({ message: "Category added successfully" });
    } else {
      res.status(400).json({ message: "Failed to add category" });
    }
  });

  // Add word to category
  app.post("/api/categories/:categoryId/words", (req, res) => {
    const { categoryId } = req.params;
    const { word } = req.body;

    if (!word) {
      return res.status(400).json({ message: "Word is required" });
    }

    if (addWordToCategory(categoryId, word)) {
      res.json({ message: "Word added successfully" });
    } else {
      res.status(400).json({ message: "Failed to add word" });
    }
  });

  // Create room
  app.post("/api/rooms", (req, res) => {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ message: "Player name is required" });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      id: nextRoomId++,
      code,
      status: 'waiting',
      currentRound: 1,
      players: [{
        id: nextPlayerId++,
        name: playerName,
        isDrawer: true,
        score: 0
      }],
      word: getRandomWord(),
      drawerPrompts: [],
      guesses: [],
      currentImage: null,
      attemptsLeft: 3
    };
    
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
