import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import GameBoard from "@/components/game/GameBoard";
import { useWebSocket } from "@/lib/websocket";

export default function Room() {
  const [, params] = useRoute<{ code: string }>("/room/:code");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const code = params?.code?.toUpperCase();

  const [playerId] = useState<number>(() => {
    const stored = sessionStorage.getItem('playerId');
    return stored ? parseInt(stored) : 0;
  });

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

  const socket = useWebSocket(code, playerId);

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
          <div className="flex gap-2">
            {room.players.map((player: { id: number; name: string; isDrawer: boolean }) => (
              <div
                key={player.id}
                className="px-4 py-2 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg flex items-center gap-2"
              >
                <span className="font-medium">{player.name}</span>
                {player.isDrawer && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    Drawing
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <GameBoard socket={socket} room={room} />
      </div>
    </div>
  );
}
