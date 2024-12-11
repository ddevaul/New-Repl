import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PromptProps {
  socket: WebSocket;
  word: string;
  attemptsLeft: number;
}

export default function Prompt({ socket, word, attemptsLeft }: PromptProps) {
  const [prompt, setPrompt] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt",
        variant: "destructive"
      });
      return;
    }

    socket.send(JSON.stringify({
      type: "prompt",
      prompt: prompt.trim()
    }));
    setPrompt("");
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <p className="font-medium">Your word is:</p>
        <p className="text-2xl font-bold text-primary">{word}</p>
      </div>
      
      <div className="text-sm text-muted-foreground">
        Attempts left: {attemptsLeft}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your AI image prompt..."
          className="flex-1"
        />
        <Button type="submit" disabled={attemptsLeft === 0}>
          Generate
        </Button>
      </form>
    </div>
  );
}
