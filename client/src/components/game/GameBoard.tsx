import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import Prompt from "./Prompt";
import Guess from "./Guess";
import { useToast } from "@/hooks/use-toast";

interface GameBoardProps {
  socket: WebSocket | null;
  room: {
    id: number;
    code: string;
    status: string;
    currentRound: number;
    players: Array<{
      id: number;
      name: string;
      isDrawer: boolean;
      score: number;
    }>;
  };
}

export default function GameBoard({ socket, room }: GameBoardProps) {
  const [gameState, setGameState] = useState<{
    word?: string;
    attemptsLeft: number;
    currentImage: string | null;
    guesses: Array<{ text: string; player: string; timestamp: string }>;
    error?: string;
    players: Array<{
      id: number;
      name: string;
      isDrawer: boolean;
      score: number;
    }>;
    currentRound: number;
  } | null>(null);
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
            variant: "destructive"
          });
          return;
        }

        // Handle round completion
        if (data.type === 'roundComplete') {
          toast({
            title: "Round Complete!",
            description: data.message,
            variant: "default"
          });
          return;
        }

        // Update game state
        setGameState(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        toast({
          title: "Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive"
        });
      }
    };

    socket.addEventListener("message", handleMessage);
    
    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket]);

  if (!gameState) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Loading game...
        </div>
      </Card>
    );
  }

  const currentPlayer = room.players.find(player => 
    gameState?.players?.some((p: any) => p.id === player.id && p.isDrawer === player.isDrawer)
  );
  const isDrawer = currentPlayer?.isDrawer ?? false;

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

        <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr] gap-6">
          <div className="flex justify-center w-full">
            {gameState.currentImage ? (
            <img
              src={gameState.currentImage}
              alt="AI Generated"
              className="w-full max-w-[1024px] aspect-square rounded-lg object-cover"
            />
          ) : (
            <div className="w-full max-w-[1024px] aspect-square rounded-lg bg-muted/50 backdrop-blur-sm border border-muted flex flex-col items-center justify-center p-8 space-y-4">
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
          
          {/* Guesses Panel */}
          <div className="space-y-4">
            <div className="p-6 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg space-y-4">
              <h3 className="font-semibold text-lg">Guesses</h3>
              <div className="space-y-2">
                {gameState.guesses?.length > 0 ? (
                  gameState.guesses.map((guess: any, index: number) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      <span className="font-medium text-primary">{guess.player}:</span>
                      <span className="text-muted-foreground">{guess.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No guesses yet</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {isDrawer ? (
          <Prompt
            socket={socket!}
            word={gameState.word}
            attemptsLeft={gameState.attemptsLeft}
          />
        ) : (
          <Guess
            socket={socket!}
            attemptsLeft={gameState.attemptsLeft}
          />
        )}
      </div>
    </Card>
  );
}
