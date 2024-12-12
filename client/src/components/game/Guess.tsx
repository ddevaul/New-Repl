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
    <div className="space-y-6">
      <div className="p-6 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg space-y-4">
        <p className="text-lg font-medium text-muted-foreground">
          What do you think this image represents?
        </p>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 bg-muted-foreground/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${(attemptsLeft / 3) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground font-medium">
            {attemptsLeft} attempts left
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Type your guess here..."
          className="w-full text-lg py-6"
        />
        <Button 
          type="submit" 
          disabled={attemptsLeft === 0}
          className="w-full py-6 text-lg font-semibold"
        >
          Submit Guess
        </Button>
      </form>
    </div>
  );
}
