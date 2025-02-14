import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState("");
  const [gameMode, setGameMode] = useState<"single" | "multi">("multi");
  const { toast } = useToast();

  // Check for authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setLocation('/auth');
      toast({
        title: "Authentication Required",
        description: "Please login or sign up to continue",
        variant: "destructive"
      });
    }
  }, []);

  const createRoom = useMutation({
    mutationFn: async () => {
      if (!playerName.trim()) {
        throw new Error("Please enter your name");
      }
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error("Authentication required");
      }
      
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          playerName: playerName.trim(),
          gameMode
        })
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
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              AI Pictionary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Button
                  onClick={() => setGameMode("single")}
                  variant={gameMode === "single" ? "default" : "outline"}
                  className="flex-1"
                >
                  Single Player
                </Button>
                <Button
                  onClick={() => setGameMode("multi")}
                  variant={gameMode === "multi" ? "default" : "outline"}
                  className="flex-1"
                >
                  Multiplayer
                </Button>
              </div>
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>
            <div className="grid gap-4">
              {gameMode === "multi" ? (
                <>
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
                </>
              ) : (
                <Button
                  disabled={!playerName}
                  onClick={() => createRoom.mutate()}
                  className="w-full"
                >
                  Start Single Player Game
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
