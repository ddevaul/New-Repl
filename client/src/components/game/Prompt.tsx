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

  const checkWordSimilarity = (prompt: string, word: string): boolean => {
    const promptWords = prompt.toLowerCase().split(/\s+/);
    const targetWord = word.toLowerCase();
    const targetWords = targetWord.split(/\s+/);
    
    return promptWords.some(pWord => 
      targetWords.some(tWord => 
        // Check for exact match or if one word contains the other
        tWord === pWord || 
        tWord.includes(pWord) || 
        pWord.includes(tWord) ||
        // Check for simple plural forms
        tWord + 's' === pWord ||
        tWord === pWord + 's'
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    
    if (!trimmedPrompt) {
      toast({
        title: "Error",
        description: "Please enter a prompt",
        variant: "destructive"
      });
      return;
    }

    if (word && checkWordSimilarity(trimmedPrompt, word)) {
      toast({
        title: "Error",
        description: "You can't use the actual word or similar variations. Try describing it differently!",
        variant: "destructive"
      });
      return;
    }

    socket.send(JSON.stringify({
      type: "prompt",
      prompt: trimmedPrompt
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
          disabled={attemptsLeft === 0 || socket.readyState !== WebSocket.OPEN || word === undefined}
        />
        <Button 
          type="submit" 
          disabled={attemptsLeft === 0 || socket.readyState !== WebSocket.OPEN || !prompt.trim() || word === undefined}
          className="w-full py-6 text-lg font-semibold"
        >
          {attemptsLeft === 0 ? "No attempts left" : word ? "Generate Image" : "Choose a word first"}
        </Button>
      </form>
    </div>
  );
}
