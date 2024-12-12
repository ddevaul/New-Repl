import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import Prompt from "./Prompt";
import Guess from "./Guess";

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

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle error messages
        if (data.error) {
          console.error('Game error:', data.error, data.details);
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
              className="w-[512px] h-[512px] rounded-lg object-cover"
            />
          ) : (
            <div className="w-[512px] h-[512px] rounded-lg bg-muted flex items-center justify-center">
              <p className="text-muted-foreground">
                Generating image...
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
