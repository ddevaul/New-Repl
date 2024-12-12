import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import GameBoard from "@/components/game/GameBoard";
import { useWebSocket } from "@/lib/websocket";

export default function Room() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const params = useParams<{ code?: string }>();
  const code = params?.code || '';

  useEffect(() => {
    if (!code) {
      toast({
        title: "Error",
        description: "Invalid room code",
        variant: "destructive",
        duration: 3000
      });
      setLocation("/");
      return;
    }
    setIsLoading(false);
  }, [code, setLocation, toast]);

  const roomCode = code.toUpperCase();

  const { data: room, error } = useQuery({
    queryKey: ["/api/rooms", roomCode],
    queryFn: async () => {
      if (!roomCode) throw new Error("Room code is required");
      const response = await fetch(`/api/rooms/${roomCode}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to fetch room");
      }
      return response.json();
    },
    enabled: !!roomCode && !isLoading,
    retry: false,
    refetchInterval: 5000 // Refresh room data every 5 seconds
  });

  const socket = useWebSocket(roomCode);

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Room not found",
        variant: "destructive"
      });
      setLocation("/");
    }
  }, [error, setLocation, toast]);

  if (isLoading || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent shadow-lg"></div>
          <p className="text-lg text-muted-foreground">Loading room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Room Code: {roomCode}</h1>
          <div className="flex gap-4">
            {room.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2"
              >
                <div className={`w-3 h-3 rounded-full ${
                  player.isDrawer ? "bg-primary" : "bg-muted"
                }`} />
                <span>{player.name}</span>
                <span className="text-muted-foreground">
                  ({player.score} points)
                </span>
              </div>
            ))}
          </div>
        </div>
        <GameBoard socket={socket} room={room} />
      </div>
    </div>
  );
}
