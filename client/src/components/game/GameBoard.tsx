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

  if (!gameState) return null;

  const isDrawer = gameState.currentPlayer?.isDrawer;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold">
            Round {gameState.currentRound}
          </h2>
          <p className="text-muted-foreground">
            {isDrawer ? "You are the drawer" : "You are guessing"}
          </p>
        </div>

        {gameState.currentImage && (
          <div className="flex justify-center">
            <img
              src={gameState.currentImage}
              alt="AI Generated"
              className="max-w-full h-auto rounded-lg"
            />
          </div>
        )}

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
