import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState("");
  const { toast } = useToast();

  const createRoom = useMutation({
    mutationFn: async () => {
      if (!playerName.trim()) {
        throw new Error("Please enter your name");
      }
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim() })
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to create room");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.playerId) {
        console.log('Saving player ID:', data.playerId);
        sessionStorage.setItem('playerId', data.playerId.toString());
      }
      setLocation(`/room/${data.code}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create room",
        variant: "destructive"
      });
    }
  });

  const joinRoom = useMutation({
    mutationFn: async (code: string) => {
      if (!playerName.trim()) {
        throw new Error("Please enter your name");
      }
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim() })
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to join room");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.playerId) {
        console.log('Saving player ID:', data.playerId);
        sessionStorage.setItem('playerId', data.playerId.toString());
      }
      setLocation(`/room/${data.code}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join room",
        variant: "destructive"
      });
    }
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            AI Pictionary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <div className="grid gap-4">
            <Button
              disabled={!playerName}
              onClick={() => createRoom.mutate()}
              className="w-full"
            >
              Create Room
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or join existing
                </span>
              </div>
            </div>
            <Input
              placeholder="Enter room code"
              onChange={(e) => {
                if (playerName && e.target.value.length === 6) {
                  joinRoom.mutate(e.target.value);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
