import { generateImage } from "./services/imageGeneration.js";
import { WebSocket } from "ws";
import { db } from "../db/index.js";
import { preGeneratedImages } from "../db/schema.js";
import { eq } from "drizzle-orm";

const DEFAULT_WORDS = [
  "elephant", "penguin", "guitar", "rainbow", "wizard",
  "spaceship", "mountain", "butterfly", "robot", "pizza",
  "dragon", "unicorn", "beach", "ninja", "astronaut",
  "lighthouse", "volcano", "mermaid", "submarine", "forest",
  "dinosaur", "rocket", "pirate", "tornado", "explorer"
];

export function getRandomWord(): string {
  return DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)];
}

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

export const roomConnections = new Map<string, Map<number, WebSocket>>();
export const rooms = new Map<string, Room>();

async function getOrGenerateImages(word: string): Promise<string[]> {
  console.log('Getting or generating images for word:', word);
  
  try {
    const existingImages = await db.query.preGeneratedImages.findMany({
      where: eq(preGeneratedImages.word, word.toLowerCase())
    });

    console.log(`Found ${existingImages.length} existing images for word:`, word);

    if (existingImages && existingImages.length > 0) {
      return existingImages.map(img => img.imageUrl);
    }

    console.log('No existing images found, generating new ones for word:', word);
    // For multiplayer mode, use the provided prompt. For singleplayer, use predefined prompts
    const prompts = room?.gameMode === 'single' ? [
      `Create a simple, minimalistic illustration of ${word} using clean lines and basic shapes. Make it clear and easy to recognize.`,
      `Draw ${word} in a straightforward way that a child could understand. Use clear outlines and simple details.`,
      `Show me ${word} in its most basic, recognizable form. Focus on the essential features that make it identifiable.`
    ] : [message.prompt];

    const generatedImages: string[] = [];
    for (const prompt of prompts) {
      try {
        console.log('Generating image with prompt:', prompt);
        const imageUrl = await generateImage(prompt);
        
        await db.insert(preGeneratedImages).values({
          word: word.toLowerCase(),
          imageUrl: imageUrl
        });
        
        generatedImages.push(imageUrl);
        console.log('Successfully generated and stored image for word:', word);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to generate image for prompt: ${prompt}`, error);
      }
    }

    if (generatedImages.length === 0) {
      throw new Error(`Failed to generate any images for word: ${word}`);
    }

    return generatedImages;
  } catch (error) {
    console.error('Error in getOrGenerateImages:', error);
    throw error;
  }
}

export function setupGameHandlers(ws: WebSocket, roomCode: string, url: string) {
  console.log('Setting up game handlers for room:', roomCode);
  
  const room = rooms.get(roomCode);
  if (!room) {
    console.error('Room not found:', roomCode);
    ws.send(JSON.stringify({ error: 'Room not found' }));
    return;
  }

  const playerIdMatch = url.match(/playerId=(\d+)/);
  const playerId = playerIdMatch ? parseInt(playerIdMatch[1], 10) : null;

  if (!playerId) {
    console.error('No player ID provided in WebSocket connection');
    ws.send(JSON.stringify({ error: 'Player ID not found' }));
    ws.close();
    return;
  }

  const connectingPlayer = room.players.find(p => p.id === playerId);
  console.log('Player connection attempt:', {
    playerId,
    foundPlayer: !!connectingPlayer,
    gameMode: room.gameMode,
    players: room.players.map(p => ({ id: p.id, isDrawer: p.isDrawer }))
  });

  if (!connectingPlayer) {
    if (room.gameMode === 'single' && room.players.length === 1) {
      const singlePlayer = room.players[0];
      console.log('Single player mode setup:', {
        attemptingPlayerId: playerId,
        existingPlayerId: singlePlayer.id
      });
      
      if (Math.abs(singlePlayer.id - playerId) <= 2) {
        return setupSinglePlayerHandlers(ws, room, singlePlayer);
      }
    }
    
    console.error('Player not found in room:', playerId);
    ws.send(JSON.stringify({ error: 'You are not a member of this room' }));
    ws.close();
    return;
  }

  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Map());
  }
  const connections = roomConnections.get(roomCode)!;
  connections.set(playerId, ws);

  console.log(`Player ${connectingPlayer.name} (ID: ${playerId}) connected to room ${roomCode}`);

  function broadcastGameState() {
    if (!room) return;
    
    console.log('Broadcasting game state:', {
      roomCode,
      connectedPlayers: Array.from(connections.keys()),
      currentImage: !!room.currentImage,
      word: room.word
    });
    
    connections.forEach((client, pid) => {
      if (client.readyState === WebSocket.OPEN) {
        const currentPlayer = room.players.find(p => p.id === pid);
        if (!currentPlayer) return;

        const state = {
          ...room,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            isDrawer: p.isDrawer,
            score: p.score
          })),
          word: currentPlayer.isDrawer ? room.word : undefined,
          waitingForPrompt: currentPlayer.isDrawer && !room.currentImage && !room.availableImages,
          waitingForGuess: !currentPlayer.isDrawer && !!room.currentImage
        };

        client.send(JSON.stringify(state));
      }
    });
  }

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', { type: message.type, roomCode, playerId });

      switch (message.type) {
        case 'prompt':
          console.log('Processing prompt message:', {
            roomCode,
            playerId,
            isDrawer: connectingPlayer.isDrawer,
            gameMode: room.gameMode,
            currentWord: room.word
          });

          if (!room.word) {
            console.error('No word set for room:', roomCode);
            ws.send(JSON.stringify({ error: 'No word set for room' }));
            break;
          }

          // In multiplayer mode, verify drawer permissions
          if (room.gameMode !== 'single') {
            if (!connectingPlayer.isDrawer) {
              console.error('Non-drawer attempted to generate image:', playerId);
              ws.send(JSON.stringify({ error: 'Only the drawer can generate images' }));
              break;
            }

            // For multiplayer, prevent multiple prompts
            if (room.currentImage) {
              console.error('Images already generated for current round');
              ws.send(JSON.stringify({ error: 'Images already generated for this round' }));
              break;
            }

            if (!message.prompt) {
              console.error('No prompt provided for image generation');
              ws.send(JSON.stringify({ error: 'Please provide a prompt for image generation' }));
              break;
            }
          }

          try {
            console.log('Starting image generation for word:', room.word);
            const images = await getOrGenerateImages(room.word);
            
            if (!images || images.length === 0) {
              throw new Error('No images generated');
            }
            
            console.log(`Successfully generated ${images.length} images for word:`, room.word);
            
            room.drawerPrompts.push(message.prompt || '');
            room.availableImages = images;
            room.currentImage = images[0];
            room.waitingForGuess = true;
            room.waitingForPrompt = false;
            room.error = undefined;
            
            broadcastGameState();
            
            ws.send(JSON.stringify({
              type: 'imageGenerated',
              message: 'Image generated successfully'
            }));
          } catch (error) {
            console.error('Error generating images:', error);
            ws.send(JSON.stringify({ 
              error: 'Failed to generate images. Please try again.' 
            }));
          }
          break;

        case 'guess':
          if (!message.guess || !room.word) break;
          
          const guesser = room.players.find(p => !p.isDrawer);
          if (!guesser) break;

          console.log('Processing guess:', {
            roomCode,
            playerId,
            guess: message.guess,
            currentGuessCount: room.guesses.length
          });

          room.guesses.push({
            text: message.guess,
            player: guesser.name,
            timestamp: new Date().toISOString()
          });

          if (message.guess.toLowerCase() !== room.word.toLowerCase()) {
            const nextImageIndex = room.guesses.length;
            if (room.availableImages && nextImageIndex < room.availableImages.length) {
              room.currentImage = room.availableImages[nextImageIndex];
              console.log(`Wrong guess. Showing image ${nextImageIndex + 1}/${room.availableImages.length}`);
            }
            room.attemptsLeft = Math.max(0, 3 - room.guesses.length);
            
            if (room.attemptsLeft > 0) {
              ws.send(JSON.stringify({
                type: 'wrongGuess',
                message: `Wrong guess! You have ${room.attemptsLeft} ${room.attemptsLeft === 1 ? 'try' : 'tries'} left.`
              }));
            }
          } else {
            // Correct guess
            room.players = room.players.map(player => ({
              ...player,
              score: player.score + (player.isDrawer ? 5 : 10)
            }));

            connections.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Correct! The word was "${room.word}". Moving to next round...`
                }));
              }
            });

            if (room.currentRound >= 6) {
              room.status = 'ended';
              connections.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'gameComplete',
                    message: `Game Over! Final scores: ${room.players.map(p => `${p.name}: ${p.score}`).join(', ')}`
                  }));
                }
              });
            } else {
              room.currentRound += 1;
              room.word = getRandomWord();
              room.players = room.players.map(p => ({ ...p, isDrawer: !p.isDrawer }));
              room.drawerPrompts = [];
              room.guesses = [];
              room.currentImage = null;
              room.attemptsLeft = 3;
              room.waitingForGuess = false;
              room.waitingForPrompt = true;
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

  broadcastGameState();

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

async function setupSinglePlayerHandlers(ws: WebSocket, room: Room, player: Player) {
  console.log(`Setting up single player handlers for player ${player.name} in room ${room.code}`);
  
  player.isDrawer = false;
  room.gameMode = 'single';
  room.status = 'playing';
  room.attemptsLeft = 3;
  
  if (!roomConnections.has(room.code)) {
    roomConnections.set(room.code, new Map());
  }
  const connections = roomConnections.get(room.code)!;
  connections.set(player.id, ws);

  function sendGameState() {
    console.log('Sending single player game state:', {
      roomCode: room.code,
      currentRound: room.currentRound,
      attemptsLeft: room.attemptsLeft,
      hasImage: !!room.currentImage
    });

    const state = {
      ...room,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        isDrawer: p.isDrawer,
        score: p.score
      })),
      word: undefined,
      attemptsLeft: room.attemptsLeft
    };

    ws.send(JSON.stringify(state));
  }

  async function startNewRound() {
    try {
      room.word = getRandomWord();
      console.log('Starting new round with word:', room.word);
      
      try {
        room.guesses = [];
        room.currentImage = null;
        room.error = undefined;
        room.attemptsLeft = 3;
        
        console.log('Fetching images for word:', room.word);
        const images = await getOrGenerateImages(room.word);
        console.log(`Retrieved ${images.length} images for word:`, room.word);
        
        if (!images || images.length === 0) {
          throw new Error('No images available for the word');
        }
        
        room.availableImages = images;
        room.currentImage = images[0];
        room.currentRound += 1;
        room.waitingForGuess = true;
        room.waitingForPrompt = false;
        
        ws.send(JSON.stringify({
          type: 'roundStart',
          message: `Round ${room.currentRound} - Make your guess!`
        }));
      
        console.log('New round started successfully:', {
          word: room.word,
          imageCount: images.length,
          currentRound: room.currentRound
        });
        
        sendGameState();
      } catch (error) {
        console.error('Error in inner try block:', error);
        room.error = 'Failed to start new round. Please try again.';
        ws.send(JSON.stringify({ error: 'Failed to start new round' }));
      }
    } catch (error) {
      console.error('Error in outer try block:', error);
      ws.send(JSON.stringify({ error: 'Failed to start new round' }));
    }
  }

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received single player message:', { 
        type: message.type, 
        roomCode: room.code,
        currentRound: room.currentRound,
        attemptsLeft: room.attemptsLeft
      });
      
      if (message.type === 'guess') {
        room.guesses.push({
          text: message.guess,
          player: player.name,
          timestamp: new Date().toISOString()
        });

        const isCorrect = message.guess.toLowerCase() === room.word?.toLowerCase();
        const attemptsUsed = room.guesses.length;

        if (isCorrect) {
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
        } else {
          const remainingAttempts = 3 - attemptsUsed;
          
          if (remainingAttempts > 0) {
            if (room.availableImages && attemptsUsed < room.availableImages.length) {
              room.currentImage = room.availableImages[attemptsUsed];
              console.log(`Wrong guess. Showing image ${attemptsUsed + 1}/${room.availableImages.length}`);
            }
            
            room.attemptsLeft = remainingAttempts;
            
            ws.send(JSON.stringify({
              type: 'wrongGuess',
              message: `Wrong guess! You have ${remainingAttempts} ${remainingAttempts === 1 ? 'try' : 'tries'} left.`
            }));
            
            sendGameState();
          } else {
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
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Failed to process message' }));
    }
  });

  await startNewRound();

  ws.on("close", () => {
    console.log(`Single player ${player.name} disconnected from room ${room.code}`);
    connections.delete(player.id);
    if (connections.size === 0) {
      roomConnections.delete(room.code);
      rooms.delete(room.code);
    }
  });
}