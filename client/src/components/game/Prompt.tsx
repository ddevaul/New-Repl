import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PromptProps {
  socket: WebSocket;
  word?: string;
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
    <div className="space-y-6">
      <div className="p-6 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg space-y-4">
        {word ? (
          <>
            <p className="font-medium text-muted-foreground">Your word is:</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              {word}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-muted-foreground">Choose your word:</p>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a word or phrase..."
              className="text-lg"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (prompt.trim()) {
                    socket.send(JSON.stringify({
                      type: "setWord",
                      word: prompt.trim()
                    }));
                    setPrompt("");
                  }
                }}
              >
                Use This Word
              </Button>
            </div>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or use auto-generated word
                </span>
              </div>
            </div>
            <Button
              onClick={() => {
                socket.send(JSON.stringify({
                  type: "generateWord"
                }));
              }}
              variant="outline"
              className="w-full"
            >
              Generate Random Word
            </Button>
          </>
        )}
        <div className="mt-4 flex items-center gap-2">
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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how to visualize this word..."
          className="w-full text-lg py-6"
        />
        <Button 
          type="submit" 
          disabled={attemptsLeft === 0}
          className="w-full py-6 text-lg font-semibold"
        >
          Generate Image
        </Button>
      </form>
    </div>
  );
}
