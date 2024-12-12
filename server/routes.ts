import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { rooms, type Room, setupGameHandlers, WORDS } from "./game";

let nextRoomId = 1;
let nextPlayerId = 1;

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

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
      word: WORDS[Math.floor(Math.random() * WORDS.length)],
      drawerPrompts: [],
      guesses: [],
      currentImage: null,
      attemptsLeft: 3
    };
    
    rooms.set(code, room);
    console.log(`Created room ${code} with word "${room.word}"`);
    res.json({ code: room.code });
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

    room.players.push({
      id: nextPlayerId++,
      name: playerName,
      isDrawer: false,
      score: 0
    });

    res.json({ code: room.code });
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

  // WebSocket handling
  httpServer.on("upgrade", (request, socket, head) => {
    if (!request.url) return socket.destroy();

    const match = request.url.match(/^\/ws\/room\/([A-Z0-9]{6})$/);
    if (!match) return socket.destroy();

    const roomCode = match[1];

    wss.handleUpgrade(request, socket, head, (ws) => {
      setupGameHandlers(ws, roomCode);
    });
  });

  return httpServer;
}
