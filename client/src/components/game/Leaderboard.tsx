import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface HighScore {
  playerName: string;
  score: number;
  gamesPlayed: number;
  totalGuessesCorrect: number;
  totalDrawingsGuessed: number;
}

export default function Leaderboard() {
  const { data: highScores, isLoading } = useQuery<HighScore[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: async () => {
      const response = await fetch("/api/leaderboard");
      if (!response.ok) throw new Error("Failed to fetch leaderboard");
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading leaderboard...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {highScores?.length ? (
            highScores.map((score, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-muted/50 backdrop-blur-sm border border-muted rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-primary">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{score.playerName}</div>
                    <div className="text-sm text-muted-foreground">
                      Games: {score.gamesPlayed} • Correct Guesses: {score.totalGuessesCorrect}
                    </div>
                  </div>
                </div>
                <div className="text-xl font-bold">{score.score}</div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground p-4">
              No high scores yet. Be the first to play!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
