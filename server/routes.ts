import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "../db";
import { rooms, players, rounds } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { setupGameHandlers } from "./game";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Create room
  app.post("/api/rooms", async (req, res) => {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ message: "Player name is required" });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [room] = await db.insert(rooms).values({ code }).returning();
    await db.insert(players).values({
      roomId: room.id,
      name: playerName,
      isDrawer: true
    });

    res.json({ code: room.code });
  });

  // Join room
  app.post("/api/rooms/:code/join", async (req, res) => {
    const { code } = req.params;
    const { playerName } = req.body;

    const room = await db.query.rooms.findFirst({
      where: eq(rooms.code, code.toUpperCase()),
      with: {
        players: true
      }
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.players.length >= 2) {
      return res.status(400).json({ message: "Room is full" });
    }

    await db.insert(players).values({
      roomId: room.id,
      name: playerName,
      isDrawer: false
    });

    res.json({ code: room.code });
  });

  // Get room
  app.get("/api/rooms/:code", async (req, res) => {
    const { code } = req.params;
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.code, code.toUpperCase()),
      with: {
        players: true,
        rounds: true
      }
    });

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
      setupGameHandlers(ws, roomCode, db);
    });
  });

  return httpServer;
}
