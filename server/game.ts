import { generateImage, PLACEHOLDER_IMAGE } from "./services/imageGeneration.js";
import { WebSocket } from "ws";
import { db } from "../db/index.js";
import { preGeneratedImages } from "../db/schema.js";
import { eq } from "drizzle-orm";
// Game state is managed in memory

// Default word list for auto-generation
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
};

// Keep track of WebSocket connections for each room
export const roomConnections = new Map<string, Map<number, WebSocket>>();

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
    // In single player mode, if there's only one player and the room was just created,
    // allow the connection even if the IDs don't match exactly
    if (room.gameMode === 'single' && room.players.length === 1) {
      // In single player mode, we're more lenient with player ID matching
      const singlePlayer = room.players[0];
      console.log('Single player connection attempt:', {
        attemptingPlayerId: playerId,
        existingPlayerId: singlePlayer.id,
        roomCode
      });
      
      // Ensure player is always a guesser in single player mode
      singlePlayer.isDrawer = false;
      room.status = 'playing';
      
      // Allow connection if it's within a reasonable window of the original ID
      // This handles cases where the client might reconnect with a slightly different ID
      if (Math.abs(singlePlayer.id - playerId) <= 2) {
        console.log(`Single player mode: Allowing connection for player ${playerId} in room ${roomCode}`);
        return setupSinglePlayerHandlers(ws, room, singlePlayer);
      } else {
        console.log('Player ID mismatch too large:', {
          difference: Math.abs(singlePlayer.id - playerId)
        });
      }
    }
    console.error(`Player ${playerId} attempted to connect but is not in room ${roomCode}`);
    ws.send(JSON.stringify({ error: 'You are not a member of this room' }));
    ws.close();
    return;
  }

  // Initialize connections set for the room if it doesn't exist
  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Map());
  }
  const connections = roomConnections.get(roomCode)!;
  connections.set(playerId, ws);

  // Log successful connection
  console.log(`Player ${connectingPlayer.name} (${playerId}) connected as ${connectingPlayer.isDrawer ? 'drawer' : 'guesser'} in room ${roomCode}`);

  // Broadcast game state to all connected clients in the room
  function broadcastGameState() {
    if (!room) return;
    
    connections.forEach((client, pid) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const currentPlayer = room.players.find(p => p.id === pid);
        if (!currentPlayer) return;

        // Create a state object specific to this player's role
        const state = {
          ...room,
          attemptsLeft: 3 - room.drawerPrompts.length,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            isDrawer: p.isDrawer,
            score: p.score
          })),
          waitingForGuess: false,
          waitingForPrompt: false
        };

        // Only the drawer should see the word
        if (!currentPlayer.isDrawer) {
          delete state.word;
        }

        console.log(`Sending game state to ${currentPlayer.name} (${currentPlayer.isDrawer ? 'drawer' : 'guesser'})`);
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
        case 'setWord':
          if (!message.word || !validateWord(message.word)) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid word format'
            }));
            break;
          }
          
          const wordSetter = room.players.find(p => p.isDrawer);
          if (!wordSetter || wordSetter.id !== playerId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Only the drawer can set the word'
            }));
            break;
          }

          room.word = message.word;
          broadcastGameState();
          break;

        case 'generateWord':
          const wordGenerator = room.players.find(p => p.isDrawer);
          if (!wordGenerator || wordGenerator.id !== playerId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Only the drawer can generate a word'
            }));
            break;
          }

          room.word = getRandomWord();
          broadcastGameState();
          break;
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
            if (room.currentRound >= 6) { // Game ends after 6 rounds (3 rounds per player as drawer)
              // End game
              room.status = 'ended';
              
              // Notify all clients about game end
              connections.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(JSON.stringify({
                    type: 'gameComplete',
                    message: `Game Over! Final scores: ${room.players.map(p => `${p.name}: ${p.score}`).join(', ')}`
                  }));
                }
              });
            } else {
              room.players = room.players.map(player => ({
                ...player,
                isDrawer: !player.isDrawer // Swap roles
              }));

              // Reset for next round
              room.currentRound += 1;
              room.word = getRandomWord();
              room.drawerPrompts = [];
              room.guesses = [];
              room.currentImage = null;
              room.attemptsLeft = 3;
              room.waitingForGuess = false;
              room.waitingForPrompt = false;
            }

            // Notify all clients about round end
            connections.forEach(client => {
              if (client.readyState === 1) { // WebSocket.OPEN
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
          room.waitingForGuess = true; // Set waiting for guess
          room.waitingForPrompt = true; // Set waiting for prompt
          broadcastGameState(); // Broadcast loading state to clients

          // Generate image
          try {
            console.log('Attempting to generate image for prompt:', message.prompt);
            room.currentImage = null; // Set to null to show loading state
            room.waitingForPrompt = true;
            broadcastGameState(); // Broadcast loading state to clients

            const imageUrl = await generateImage(message.prompt);
            room.currentImage = imageUrl;
            room.drawerPrompts.push(message.prompt);
            room.waitingForPrompt = false;
            room.waitingForGuess = true;
            
            if (imageUrl === PLACEHOLDER_IMAGE) {
              console.warn('Using placeholder image due to generation failure');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Image generation failed. Please try a different prompt.'
              }));
            } else {
              console.log('Successfully generated image');
            }
            
            broadcastGameState();
          } catch (error) {
            console.error('Image generation error:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to generate image. Please try again.'
            }));
            room.currentImage = PLACEHOLDER_IMAGE;
            broadcastGameState();
          }
          break;

        case 'guess':
          if (!message.guess) break;
          
          // Only non-drawer can make guesses
          const guesser = room.players.find(p => !p.isDrawer);
          if (!guesser) break;

          console.log('Processing guess:', message.guess);

          // Only accept guess if we're waiting for one
          if (!room.waitingForGuess) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Please wait for a new image before guessing'
            }));
            break;
          }

          // Record the guess
          room.guesses.push({
            text: message.guess,
            player: guesser.name,
            timestamp: new Date().toISOString()
          });
          
          // Reset waiting states
          room.waitingForGuess = false;
          room.waitingForPrompt = false;

          // Check if guess is correct
          if (message.guess.toLowerCase() === room.word?.toLowerCase()) {
            console.log('Correct guess! Starting new round');
            
            // Update scores
            room.players = room.players.map(player => ({
              ...player,
              score: player.score + (player.isDrawer ? 5 : 10), // Drawer gets 5 points, guesser gets 10
            }));

            if (room.currentRound >= 6) { // Game ends after 6 rounds (3 rounds per player as drawer)
              // End game
              room.status = 'ended';
              
              // Notify all clients about game end
              connections.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(JSON.stringify({
                    type: 'gameComplete',
                    message: `Game Over! Final scores: ${room.players.map(p => `${p.name}: ${p.score}`).join(', ')}`
                  }));
                }
              });
            } else {
              // Swap roles and continue to next round
              room.players = room.players.map(player => ({
                ...player,
                isDrawer: !player.isDrawer // Swap roles
              }));

              // Reset for next round
              room.currentRound += 1;
              room.word = getRandomWord();
              room.drawerPrompts = [];
              room.guesses = [];
              room.currentImage = null;
              room.attemptsLeft = 3;
              room.waitingForGuess = false;
              room.waitingForPrompt = false;
            }

            // Notify all clients
            connections.forEach(client => {
              if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify({
                  type: 'roundComplete',
                  message: `Correct! The word was "${message.guess}". Swapping roles...`
                }));
              }
            });
          }
          room.waitingForPrompt = false; // Reset waiting for prompt after guess
          room.waitingForGuess = false; // Reset waiting for guess after guess
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
    room.word = getRandomWord();
  }

  // Log the current state of the room
  console.log('Room state on WebSocket connection:', {
    roomCode,
    playerId,
    playerName: connectingPlayer.name,
    totalPlayers: room.players.length,
    allPlayerIds: room.players.map(p => p.id),
    status: room.status
  });

  // Send initial game state to all clients
  broadcastGameState();

  // If this is the second player joining, start the game
  if (room.players.length === 2 && room.status === 'waiting') {
    room.status = 'playing';
    console.log(`Game starting in room ${roomCode} with word "${room.word}"`);
    broadcastGameState();
  }

  // Cleanup on disconnect
  ws.on("close", () => {
    console.log(`Player ${connectingPlayer.name} (${playerId}) disconnected from room ${roomCode}`);
    
    // Remove the connection
    connections.delete(playerId);
    
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
// Single player specific game handlers
function setupSinglePlayerHandlers(ws: WebSocket, room: Room, player: Player) {
    console.log(`Setting up single player handlers for player ${player.name} in room ${room.code}`);
    
    // Initialize connections for the room if they don't exist
    if (!roomConnections.has(room.code)) {
      roomConnections.set(room.code, new Map());
    }
    const connections = roomConnections.get(room.code)!;
    connections.set(player.id, ws);

    // Function to start a new round
    async function startNewRound() {
      console.log('Starting new round:', {
        roomCode: room.code,
        currentRound: room.currentRound,
        previousWord: room.word
      });

      room.word = getRandomWord();
      room.guesses = [];
      room.currentRound += 1;
      room.waitingForGuess = true;
      room.waitingForPrompt = false;

      console.log('Generated new word:', room.word);
      
      try {
        // First try to find pre-generated images
        const preGenerated = await db.query.preGeneratedImages.findMany({
          where: eq(preGeneratedImages.word, room.word.toLowerCase())
        });

        if (preGenerated && preGenerated.length > 0) {
          // Randomly select one of the pre-generated images
          const randomImage = preGenerated[Math.floor(Math.random() * preGenerated.length)];
          console.log(`Found ${preGenerated.length} pre-generated images for word:`, room.word);
          room.currentImage = randomImage.imageUrl;
        } else {
          console.log('No pre-generated images found for word:', room.word);
          room.currentImage = PLACEHOLDER_IMAGE;
        }
      } catch (error) {
        console.error('Failed to get pre-generated image for new round:', error);
        room.currentImage = PLACEHOLDER_IMAGE;
      }
      
      sendGameState();
    }

    // Function to send game state to the player
    function sendGameState() {
      if (!room) return;
      
      const attemptsLeft = Math.max(0, 3 - (room.guesses?.length || 0));
      const state = {
        ...room,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          isDrawer: p.isDrawer,
          score: p.score
        })),
        word: undefined, // Never send the word to the player in single player mode
        waitingForPrompt: false,
        waitingForGuess: true,
        attemptsLeft,
        currentRound: room.currentRound,
        currentImage: room.currentImage
      };

      console.log(`Sending single player game state to ${player.name}:`, {
        attemptsLeft,
        currentRound: room.currentRound,
        guessCount: room.guesses?.length,
        hasImage: !!room.currentImage
      });
      ws.send(JSON.stringify(state));
    }

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received single player message:', message, {
          roomCode: room.code,
          playerName: player.name,
          currentRound: room.currentRound,
          guessCount: room.guesses.length
        });

        if (message.type === 'guess') {
          if (!message.guess || !room.word) {
            console.error('Invalid guess message:', { message, word: room.word });
            ws.send(JSON.stringify({ 
              type: 'error',
              message: 'Invalid guess'
            }));
            return;
          }

          // Record the guess
          room.guesses.push({
            text: message.guess,
            player: player.name,
            timestamp: new Date().toISOString()
          });

          // Check if guess is correct
          const isCorrect = message.guess.toLowerCase() === room.word.toLowerCase();
          const attemptsUsed = room.guesses.length;
          const hasAttemptsLeft = attemptsUsed < 3;

          console.log('Processing single player guess:', {
            guess: message.guess,
            word: room.word,
            isCorrect,
            attemptsUsed,
            hasAttemptsLeft,
            currentRound: room.currentRound
          });

          if (isCorrect) {
            // Update score based on attempts used
            const scoreForThisRound = Math.max(10 - (attemptsUsed - 1) * 3, 1); // 10, 7, 4 points based on attempts
            player.score += scoreForThisRound;

            // Send success message
            ws.send(JSON.stringify({
              type: 'roundComplete',
              message: `Correct! You got "${room.word}" in ${attemptsUsed} ${attemptsUsed === 1 ? 'try' : 'tries'}! +${scoreForThisRound} points`
            }));

            if (room.currentRound >= 6) {
              // Game is complete
              ws.send(JSON.stringify({
                type: 'gameComplete',
                message: `Game Over! Final score: ${player.score} points`
              }));
              room.status = 'ended';
              sendGameState();
            } else {
              // Start new round with delay to ensure messages are received in order
              setTimeout(async () => {
                await startNewRound();
              }, 1000);
            }
          } else if (!hasAttemptsLeft) {
            // No more attempts left
            ws.send(JSON.stringify({
              type: 'roundComplete',
              message: `Out of attempts! The word was "${room.word}". Starting new round...`
            }));

            if (room.currentRound >= 6) {
              // Game is complete
              ws.send(JSON.stringify({
                type: 'gameComplete',
                message: `Game Over! Final score: ${player.score} points`
              }));
              room.status = 'ended';
              sendGameState();
            } else {
              // Start new round with delay to ensure messages are received in order
              setTimeout(async () => {
                await startNewRound();
              }, 1000);
            }
          } else {
            // Wrong guess but has attempts left
            ws.send(JSON.stringify({
              type: 'wrongGuess',
              message: `Wrong guess! You have ${3 - attemptsUsed} ${3 - attemptsUsed === 1 ? 'try' : 'tries'} left.`
            }));
          }

          // Send updated game state
          sendGameState();
        }
      } catch (error) {
        console.error('Error processing single player message:', error);
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
        console.log(`Single player room ${room.code} cleaned up`);
      }
    });

    return true;
  }