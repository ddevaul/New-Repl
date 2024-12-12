import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import Prompt from "@/components/game/Prompt";
import Guess from "@/components/game/Guess";
import GuessHistory from "@/components/game/GuessHistory";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: number;
  name: string;
  isDrawer: boolean;
  score: number;
}

interface Room {
  id: number;
  code: string;
  status: string;
  currentRound: number;
  players: Player[];
}

interface GameState {
  word?: string;
  attemptsLeft: number;
  currentImage: string | null;
  guessData: Array<{
    playerId: number;
    playerName: string;
    guess: string;
    isCorrect?: boolean;
  }>;
  error?: string;
}

interface GameBoardProps {
  socket: WebSocket | null;
  room: Room;
}

export default function GameBoard({ socket, room }: GameBoardProps) {
  const [gameState, setGameState] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle error messages
        if (data.error) {
          toast({
            title: "Error",
            description: data.error,
            variant: "destructive",
            duration: 4000
          });
          return;
        }

        // Handle round completion
        if (data.type === 'roundComplete') {
          toast({
            title: "Round Complete!",
            description: `${data.message} ${data.pointsEarned ? 
              `Drawer earned ${data.pointsEarned.drawer} points, Guesser earned ${data.pointsEarned.guesser} points!` : 
              ''}`,
            variant: "default",
            duration: 5000
          });
          return;
        }

        // Handle player join/leave
        if (data.type === 'playerUpdate') {
          toast({
            title: data.joined ? "Player Joined" : "Player Left",
            description: `${data.playerName} has ${data.joined ? 'joined' : 'left'} the game`,
            variant: data.joined ? "default" : "destructive",
            duration: 4000
          });
          return;
        }

        // Update game state
        setGameState((prevState: GameState | null) => ({
          ...prevState,
          ...data,
          guessData: data.guessData || prevState?.guessData || []
        }));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        toast({
          title: "Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
          duration: 4000
        });
      }
    };

    socket.addEventListener("message", handleMessage);
    
    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, toast]);

  if (!gameState) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Loading game...
        </div>
      </Card>
    );
  }

  // Find the current player based on their role
  const currentPlayer = room.players.find(player => player.isDrawer);
  const isDrawer = !!currentPlayer?.isDrawer;

  return (
    <Card className="p-8">
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Round {gameState?.currentRound ?? 1}
          </h2>
          <p className="text-lg text-muted-foreground">
            {isDrawer ? "You are the drawer" : "You are guessing"}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {gameState.currentImage ? (
              <img
                src={gameState.currentImage}
                alt="AI Generated"
                className="w-full aspect-square rounded-lg object-cover"
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-muted/50 backdrop-blur-sm border border-muted flex flex-col items-center justify-center p-8 space-y-4">
                {!gameState.error && (
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent shadow-lg"></div>
                )}
                <p className="text-lg text-center max-w-md">
                  {gameState.error ? (
                    <span className="inline-flex items-center gap-2 text-destructive">
                      <span className="font-semibold">Error:</span>
                      {gameState.error}
                    </span>
                  ) : (
                    <span className="animate-pulse">Generating your masterpiece...</span>
                  )}
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-8">
            <div className="p-6 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg space-y-4">
              <h3 className="text-lg font-semibold">Players</h3>
              <div className="space-y-3">
                {room.players.map((player) => (
                  <div key={player.id} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${player.isDrawer ? "bg-primary" : "bg-muted-foreground"}`} />
                    <span>{player.name}</span>
                    <span className="text-muted-foreground ml-auto">
                      {player.isDrawer ? "Drawing" : "Guessing"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <GuessHistory 
              guesses={gameState.guessData || []}
              currentPlayerId={room.players.find(p => !p.isDrawer)?.id}
            />
          </div>
        </div>

        <div className="mt-8">
          {isDrawer ? (
            <Prompt
              socket={socket}
              word={gameState.word}
              attemptsLeft={gameState.attemptsLeft}
            />
          ) : (
            <Guess
              socket={socket}
              attemptsLeft={gameState.attemptsLeft}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
