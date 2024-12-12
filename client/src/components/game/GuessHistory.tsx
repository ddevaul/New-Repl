import { ScrollArea } from "@/components/ui/scroll-area";

interface GuessHistoryProps {
  guesses: Array<{
    playerId: number;
    playerName: string;
    guess: string;
    isCorrect?: boolean;
  }>;
  currentPlayerId?: number;
}

export default function GuessHistory({ guesses, currentPlayerId }: GuessHistoryProps) {
  if (!guesses?.length) return null;

  return (
    <ScrollArea className="h-[200px] w-full rounded-md border p-4">
      <div className="space-y-2">
        {guesses.map((guess, index) => (
          <div
            key={index}
            className={`flex items-start gap-2 ${
              guess.isCorrect ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="flex-shrink-0">
              <div className="h-2 w-2 mt-2 rounded-full bg-primary/60" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">
                {guess.playerName}
                {currentPlayerId === guess.playerId && " (You)"}
              </p>
              <p className="text-sm text-muted-foreground">
                {guess.guess}
                {guess.isCorrect && (
                  <span className="ml-2 text-primary">✓ Correct!</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
