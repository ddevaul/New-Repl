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
    if (!stored) {
      console.error('No player ID found in session storage');
      return 0;
    }
    const id = parseInt(stored);
    console.log('Retrieved player ID from session storage:', id);
    return id;
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Room Code: {code}</h1>
            <p className="text-sm text-muted-foreground">
              {playerId ? `Your ID: ${playerId}` : 'Connecting...'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {room.players.map((player) => (
              <div
                key={player.id}
                className={`px-4 py-2 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg flex items-center gap-2 ${
                  player.id === playerId ? 'ring-2 ring-primary' : ''
                }`}
              >
                <span className="font-medium">{player.name}</span>
                <span className={`text-xs ${player.isDrawer ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'} px-2 py-1 rounded-full`}>
                  {player.isDrawer ? 'Drawing' : 'Guessing'}
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
