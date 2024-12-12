import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import GameBoard from "@/components/game/GameBoard";
import { useWebSocket } from "@/lib/websocket";

export default function Room() {
  const [match] = useRoute<{ code: string }>("/room/:code");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const code = match?.params.code?.toUpperCase();

  const { data: room, error } = useQuery({
    queryKey: ["/api/rooms", code],
    queryFn: async () => {
      if (!code) throw new Error("Room code is required");
      const response = await fetch(`/api/rooms/${code}`);
      if (!response.ok) throw new Error("Failed to fetch room");
      return response.json();
    },
    enabled: !!code
  });

  const socket = useWebSocket(code);

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

  if (!room) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Room Code: {code}</h1>
          <div className="flex gap-4">
            {room.players.map((player: any) => (
              <div
                key={player.id}
                className="flex items-center gap-2"
              >
                <div className="w-3 h-3 rounded-full bg-primary" />
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
