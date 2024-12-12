import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface GuessProps {
  socket: WebSocket;
  attemptsLeft: number;
  waitingForPrompt: boolean;
}

export default function Guess({ socket, attemptsLeft, waitingForPrompt }: GuessProps) {
  const [guess, setGuess] = useState("");
  const [hasGuessed, setHasGuessed] = useState(false);
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
    setHasGuessed(true);
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
          disabled={hasGuessed || waitingForPrompt || attemptsLeft === 0}
        />
        <Button 
          type="submit" 
          disabled={hasGuessed || waitingForPrompt || attemptsLeft === 0 || !guess.trim()}
          className="w-full py-6 text-lg font-semibold"
        >
          {hasGuessed ? "Waiting for next image..." : 
           waitingForPrompt ? "Waiting for drawer..." :
           attemptsLeft === 0 ? "No attempts left" : "Submit Guess"}
        </Button>
      </form>
    </div>
  );
}
