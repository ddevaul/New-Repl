import { WebSocket } from "ws";
import { generateImage, PLACEHOLDER_IMAGE } from "./services/imageGeneration.js";

// Pre-defined list of words for the game
export const WORDS = [
  "elephant", "basketball", "sunshine", "guitar", "rainbow",
  "butterfly", "spaceship", "waterfall", "dragon", "pizza",
  "lighthouse", "unicorn", "volcano", "mermaid", "castle",
  "robot", "astronaut", "wizard", "dinosaur", "pirate"
];

export type Player = {
  id: number;
  name: string;
  isDrawer: boolean;
  score: number;
};

export type Room = {
  id: number;
  code: string;
  status: 'waiting' | 'playing' | 'ended';
  currentRound: number;
  players: Player[];
  word?: string;
  drawerPrompts: string[];
  guesses: Array<{ text: string; player: string; timestamp: string }>;
  currentImage: string | null;
  attemptsLeft: number;
};

// Keep track of WebSocket connections for each room
const roomConnections = new Map<string, Map<number, WebSocket>>();

// Store active game rooms
export const rooms = new Map<string, Room>();

export function setupGameHandlers(ws: WebSocket, roomCode: string, url: string) {
  const room = rooms.get(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ error: 'Room not found' }));
    return;
  }

  // Extract playerId from URL query parameters
  const playerIdMatch = url.match(/playerId=(\d+)/);
  const playerId = playerIdMatch ? parseInt(playerIdMatch[1]) : null;

  if (!playerId) {
    ws.send(JSON.stringify({ error: 'Player ID not found' }));
    return;
  }

  // Initialize connections set for the room if it doesn't exist
  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Map());
  }
  const connections = roomConnections.get(roomCode)!;
  connections.set(playerId, ws);

  // Broadcast game state to all connected clients in the room
  function broadcastGameState() {
    if (!room) return;
    const state = {
      ...room,
      attemptsLeft: 3 - room.drawerPrompts.length
    };
    connections.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(state));
      }
    });
  }

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message, 'from room:', roomCode);

      switch (message.type) {
        case 'prompt':
          if (!message.prompt) break;
          
          // Only drawer can send prompts
          const drawer = room.players.find(p => p.isDrawer);
          if (!drawer) break;

          // Check attempts limit
          if (room.drawerPrompts.length >= 3) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'No more attempts left. Round is over!'
            }));
            
            // Start new round without points
            room.players = room.players.map(player => ({
              ...player,
              isDrawer: !player.isDrawer // Swap roles
            }));

            // Reset for next round
            room.currentRound += 1;
            room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
            room.drawerPrompts = [];
            room.guesses = [];
            room.currentImage = null;
            room.attemptsLeft = 3;

            // Notify all clients about round end
            connections.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Out of attempts! The word was "${room.word}". No points awarded. Swapping roles...`
                }));
              }
            });
            
            broadcastGameState();
            break;
          }

          console.log('Processing prompt:', message.prompt);
          
          // Send loading state
          room.currentImage = null;
          broadcastGameState();

          // Generate image
          const imageUrl = await generateImage(message.prompt);
          room.currentImage = imageUrl;
          room.drawerPrompts.push(message.prompt);
          console.log('Generated image for prompt:', imageUrl === PLACEHOLDER_IMAGE ? 'placeholder' : 'success');
          broadcastGameState();
          break;

        case 'guess':
          if (!message.guess) break;
          
          // Only non-drawer can make guesses
          const guesser = room.players.find(p => !p.isDrawer);
          if (!guesser) break;

          console.log('Processing guess:', message.guess);

          // Record the guess
          room.guesses.push({
            text: message.guess,
            player: guesser.name,
            timestamp: new Date().toISOString()
          });

          // Check if guess is correct
          if (message.guess.toLowerCase() === room.word?.toLowerCase()) {
            console.log('Correct guess! Starting new round');
            
            // Update scores and swap roles
            room.players = room.players.map(player => ({
              ...player,
              score: player.score + (player.isDrawer ? 5 : 10), // Drawer gets 5 points, guesser gets 10
              isDrawer: !player.isDrawer // Swap roles
            }));

            // Reset for next round
            room.currentRound += 1;
            room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
            room.drawerPrompts = [];
            room.guesses = [];
            room.currentImage = null;
            room.attemptsLeft = 3;

            // Notify all clients
            connections.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Correct! The word was "${message.guess}". Swapping roles...`
                }));
              }
            });
          }

          broadcastGameState();
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });

  // Initialize game state and send it to the client
  if (!room.word) {
    room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  broadcastGameState();

  // Cleanup on disconnect
  ws.on("close", () => {
    console.log(`Client disconnected from room ${roomCode}`);
    
    // Find and remove the connection associated with this player
    const entries = Array.from(connections.entries());
    for (const [pid, conn] of entries) {
      if (conn === ws) {
        connections.delete(pid);
        break;
      }
    }
    
    // If no more connections in the room, clean up
    if (connections.size === 0) {
      roomConnections.delete(roomCode);
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} cleaned up`);
    } else {
      // Notify remaining players
      broadcastGameState();
    }
  });
}
