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

  const currentPlayer = gameState?.players ? room.players.find(player => 
    gameState.players.find((p: any) => p.id === player.id)?.isDrawer === player.isDrawer
  ) : null;
  const isDrawer = currentPlayer?.isDrawer ?? false;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold">
            Round {gameState?.currentRound ?? 1}
          </h2>
          <p className="text-muted-foreground">
            {isDrawer ? "You are the drawer" : "You are guessing"}
          </p>
        </div>

        <div className="flex justify-center">
          {gameState.currentImage ? (
            <img
              src={gameState.currentImage}
              alt="AI Generated"
              className="w-full max-w-[1024px] aspect-square rounded-lg object-cover"
            />
          ) : (
            <div className="w-full max-w-[1024px] aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-4 space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              <p className="text-muted-foreground text-center">
                {gameState.error ? (
                  <>
                    <span className="text-destructive font-medium">Error: </span>
                    {gameState.error}
                  </>
                ) : (
                  "Generating image..."
                )}
              </p>
            </div>
          )}
        </div>

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
    </Card>
  );
}
