import { generateImage } from "./services/imageGeneration.js";
import { WebSocket } from "ws";
import { db } from "../db/index.js";
import { preGeneratedImages } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Game state is managed in memory
const DEFAULT_WORDS = [
  "elephant", "penguin", "guitar", "rainbow", "wizard",
  "spaceship", "mountain", "butterfly", "robot", "pizza",
  "dragon", "unicorn", "beach", "ninja", "astronaut",
  "lighthouse", "volcano", "mermaid", "submarine", "forest",
  "dinosaur", "rocket", "pirate", "tornado", "explorer"
];

// Function to get a random word
export function getRandomWord(): string {
  return DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)];
}

// Validate word input
function validateWord(word: string): boolean {
  return word.length >= 2 && word.length <= 30 && /^[a-zA-Z0-9\s-]+$/.test(word);
}

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
  waitingForGuess: boolean;
  waitingForPrompt: boolean;
  gameMode: 'single' | 'multi';
  availableImages?: string[];
  error?: string;
};

// Keep track of WebSocket connections for each room
export const roomConnections = new Map<string, Map<number, WebSocket>>();

// Store active game rooms
export const rooms = new Map<string, Room>();

// Function to get or generate images for a word
async function getOrGenerateImages(word: string): Promise<string[]> {
  // Try to get pre-generated images
  const existingImages = await db.query.preGeneratedImages.findMany({
    where: eq(preGeneratedImages.word, word.toLowerCase())
  });

  if (existingImages && existingImages.length > 0) {
    return existingImages.map(img => img.imageUrl);
  }

  // Generate new images
  const prompts = [
    `A simple, clear illustration of ${word}. Digital art style, minimalist design.`,
    `A cartoon-style drawing of ${word} with bold outlines.`,
    `A basic, easy-to-recognize ${word} in digital art style.`
  ];

  const generatedImages: string[] = [];
  for (const prompt of prompts) {
    try {
      const imageUrl = await generateImage(prompt);
      await db.insert(preGeneratedImages).values({
        word: word.toLowerCase(),
        imageUrl: imageUrl
      });
      generatedImages.push(imageUrl);
    } catch (error) {
      console.error(`Failed to generate image for prompt: ${prompt}`, error);
    }
  }

  if (generatedImages.length === 0) {
    throw new Error('Failed to generate any images for the word');
  }

  return generatedImages;
}

export function setupGameHandlers(ws: WebSocket, roomCode: string, url: string) {
  const room = rooms.get(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ error: 'Room not found' }));
    return;
  }

  // Extract playerId from URL query parameters
  const playerIdMatch = url.match(/playerId=(\d+)/);
  const playerId = playerIdMatch ? parseInt(playerIdMatch[1], 10) : null;

  if (!playerId) {
    console.error('No player ID provided in WebSocket connection');
    ws.send(JSON.stringify({ error: 'Player ID not found' }));
    ws.close();
    return;
  }

  // Find the connecting player in the room
  const connectingPlayer = room.players.find(p => p.id === playerId);
  if (!connectingPlayer) {
    if (room.gameMode === 'single' && room.players.length === 1) {
      const singlePlayer = room.players[0];
      console.log('Single player connection attempt:', {
        attemptingPlayerId: playerId,
        existingPlayerId: singlePlayer.id,
        roomCode
      });
      
      singlePlayer.isDrawer = false;
      room.status = 'playing';
      
      if (Math.abs(singlePlayer.id - playerId) <= 2) {
        console.log(`Single player mode: Allowing connection for player ${playerId} in room ${roomCode}`);
        return setupSinglePlayerHandlers(ws, room, singlePlayer);
      }
    }
    
    console.error(`Player ${playerId} attempted to connect but is not in room ${roomCode}`);
    ws.send(JSON.stringify({ error: 'You are not a member of this room' }));
    ws.close();
    return;
  }

  // Initialize connections for the room
  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Map());
  }
  const connections = roomConnections.get(roomCode)!;
  connections.set(playerId, ws);

  console.log(`Player ${connectingPlayer.name} (${playerId}) connected to room ${roomCode}`);

  // Function to broadcast game state
  function broadcastGameState() {
    if (!room) return;
    
    connections.forEach((client, pid) => {
      if (client.readyState === 1) {
        const currentPlayer = room.players.find(p => p.id === pid);
        if (!currentPlayer) return;

        const state = {
          ...room,
          attemptsLeft: room.attemptsLeft,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            isDrawer: p.isDrawer,
            score: p.score
          })),
          word: currentPlayer.isDrawer ? room.word : undefined
        };

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
        case 'guess':
          if (!message.guess || !room.word) break;
          
          const guesser = room.players.find(p => !p.isDrawer);
          if (!guesser) break;

          room.guesses.push({
            text: message.guess,
            player: guesser.name,
            timestamp: new Date().toISOString()
          });

          if (message.guess.toLowerCase() === room.word.toLowerCase()) {
            // Correct guess
            room.players = room.players.map(player => ({
              ...player,
              score: player.score + (player.isDrawer ? 5 : 10)
            }));

            // Notify all clients
            connections.forEach(client => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Correct! The word was "${message.guess}". Moving to next round...`
                }));
              }
            });

            if (room.currentRound >= 6) {
              // End game
              room.status = 'ended';
              connections.forEach(client => {
                if (client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'gameComplete',
                    message: `Game Over! Final scores: ${room.players.map(p => `${p.name}: ${p.score}`).join(', ')}`
                  }));
                }
              });
            } else {
              // Next round
              room.currentRound += 1;
              room.word = getRandomWord();
              room.players = room.players.map(p => ({ ...p, isDrawer: !p.isDrawer }));
              room.drawerPrompts = [];
              room.guesses = [];
              room.currentImage = null;
              room.attemptsLeft = 3;
              room.waitingForGuess = false;
              room.waitingForPrompt = false;
            }
          } else if (room.guesses.length >= 3) {
            // Out of attempts
            connections.forEach(client => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Out of attempts! The word was "${room.word}". Moving to next round...`
                }));
              }
            });

            if (room.currentRound >= 6) {
              room.status = 'ended';
            } else {
              room.currentRound += 1;
              room.word = getRandomWord();
              room.players = room.players.map(p => ({ ...p, isDrawer: !p.isDrawer }));
              room.drawerPrompts = [];
              room.guesses = [];
              room.currentImage = null;
              room.attemptsLeft = 3;
              room.waitingForGuess = false;
              room.waitingForPrompt = false;
            }
          }
          
          broadcastGameState();
          break;

        default:
          console.warn('Unhandled message type:', message.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });

  // Send initial game state
  broadcastGameState();

  // Cleanup on disconnect
  ws.on("close", () => {
    console.log(`Player ${connectingPlayer.name} disconnected from room ${roomCode}`);
    connections.delete(playerId);
    if (connections.size === 0) {
      roomConnections.delete(roomCode);
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} cleaned up`);
    }
  });
}

// Single player specific game handlers
async function setupSinglePlayerHandlers(ws: WebSocket, room: Room, player: Player) {
  console.log(`Setting up single player handlers for player ${player.name} in room ${room.code}`);
  
  player.isDrawer = false;
  room.gameMode = 'single';
  room.status = 'playing';
  
  if (!roomConnections.has(room.code)) {
    roomConnections.set(room.code, new Map());
  }
  const connections = roomConnections.get(room.code)!;
  connections.set(player.id, ws);

  // Function to start a new round
  async function startNewRound() {
    try {
      room.word = getRandomWord();
      console.log('Starting new round with word:', room.word);
      
      // Get or generate images for the word
      const images = await getOrGenerateImages(room.word);
      
      room.availableImages = images;
      room.currentImage = images[0]; // Use first image
      room.guesses = [];
      room.currentRound += 1;
      room.attemptsLeft = 3;
      room.waitingForGuess = true;
      room.waitingForPrompt = false;
      
      sendGameState();
    } catch (error) {
      console.error('Error starting new round:', error);
      room.error = 'Failed to start new round. Please try again.';
      ws.send(JSON.stringify({ error: 'Failed to start new round' }));
    }
  }

  // Function to send game state
  function sendGameState() {
    const state = {
      ...room,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        isDrawer: p.isDrawer,
        score: p.score
      })),
      word: undefined, // Never send word to player
      attemptsLeft: Math.max(0, 3 - (room.guesses?.length || 0))
    };

    ws.send(JSON.stringify(state));
  }

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'guess') {
        if (!message.guess || !room.word) {
          ws.send(JSON.stringify({ error: 'Invalid guess' }));
          return;
        }

        room.guesses.push({
          text: message.guess,
          player: player.name,
          timestamp: new Date().toISOString()
        });

        const isCorrect = message.guess.toLowerCase() === room.word.toLowerCase();
        const attemptsUsed = room.guesses.length;

        if (isCorrect) {
          // Calculate score based on attempts
          const scoreForRound = Math.max(10 - (attemptsUsed - 1) * 3, 1);
          player.score += scoreForRound;

          ws.send(JSON.stringify({
            type: 'roundComplete',
            message: `Correct! You got "${room.word}" in ${attemptsUsed} ${attemptsUsed === 1 ? 'try' : 'tries'}! +${scoreForRound} points`
          }));

          if (room.currentRound >= 6) {
            room.status = 'ended';
            ws.send(JSON.stringify({
              type: 'gameComplete',
              message: `Game Over! Final score: ${player.score} points`
            }));
          } else {
            setTimeout(() => startNewRound(), 1000);
          }
        } else if (attemptsUsed >= 3) {
          ws.send(JSON.stringify({
            type: 'roundComplete',
            message: `Out of attempts! The word was "${room.word}"`
          }));

          if (room.currentRound >= 6) {
            room.status = 'ended';
            ws.send(JSON.stringify({
              type: 'gameComplete',
              message: `Game Over! Final score: ${player.score} points`
            }));
          } else {
            setTimeout(() => startNewRound(), 1000);
          }
        } else {
          // Show next image if available
          if (room.availableImages && room.availableImages.length > attemptsUsed) {
            room.currentImage = room.availableImages[attemptsUsed];
          }
          
          ws.send(JSON.stringify({
            type: 'wrongGuess',
            message: `Wrong guess! You have ${3 - attemptsUsed} ${3 - attemptsUsed === 1 ? 'try' : 'tries'} left.`
          }));
        }

        sendGameState();
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });

  // Send initial game state
  sendGameState();

  // Cleanup on disconnect
  ws.on("close", () => {
    console.log(`Single player ${player.name} disconnected from room ${room.code}`);
    connections.delete(player.id);
    if (connections.size === 0) {
      roomConnections.delete(room.code);
      rooms.delete(room.code);
    }
  });

  return true;
}