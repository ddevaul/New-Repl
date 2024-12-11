import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface GuessProps {
  socket: WebSocket;
  attemptsLeft: number;
}

export default function Guess({ socket, attemptsLeft }: GuessProps) {
  const [guess, setGuess] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guess.trim()) {
      toast({
        title: "Error",
        description: "Please enter a guess",
        variant: "destructive"
      });
      return;
    }

    socket.send(JSON.stringify({
      type: "guess",
      guess: guess.trim()
    }));
    setGuess("");
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Attempts left: {attemptsLeft}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Enter your guess..."
          className="flex-1"
        />
        <Button type="submit" disabled={attemptsLeft === 0}>
          Guess
        </Button>
      </form>
    </div>
  );
}
