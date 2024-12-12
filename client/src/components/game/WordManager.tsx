import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Category = {
  id: string;
  name: string;
  wordCount: number;
  isCustom?: boolean;
};

export default function WordManager() {
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newWord, setNewWord] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const response = await fetch("/api/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    }
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: newCategoryId.toLowerCase(),
          name: newCategoryName
        })
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to add category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewCategoryId("");
      setNewCategoryName("");
      toast({
        title: "Success",
        description: "Category added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add category",
        variant: "destructive"
      });
    }
  });

  const addWord = useMutation({
    mutationFn: async () => {
      if (!selectedCategory) throw new Error("No category selected");
      const response = await fetch(`/api/categories/${selectedCategory}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: newWord })
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to add word");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewWord("");
      toast({
        title: "Success",
        description: "Word added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add word",
        variant: "destructive"
      });
    }
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
          Word Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new category */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Add New Category</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              placeholder="Category ID (e.g., 'sports')"
            />
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Display Name (e.g., 'Sports')"
            />
          </div>
          <Button 
            onClick={() => addCategory.mutate()}
            disabled={!newCategoryId || !newCategoryName}
            className="w-full"
          >
            Add Category
          </Button>
        </div>

        {/* Category list */}
        <Accordion type="single" collapsible className="w-full">
          {categories?.map((category) => (
            <AccordionItem key={category.id} value={category.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex justify-between items-center w-full pr-4">
                  <span className="font-medium">{category.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {category.wordCount} words
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <Input
                      value={selectedCategory === category.id ? newWord : ""}
                      onChange={(e) => {
                        setSelectedCategory(category.id);
                        setNewWord(e.target.value);
                      }}
                      placeholder="Add new word..."
                    />
                    <Button
                      onClick={() => addWord.mutate()}
                      disabled={!newWord || selectedCategory !== category.id}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
