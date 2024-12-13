import { db } from "../../db/index.js";
import { preGeneratedImages } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { generateImage } from "./imageGeneration.js";
import { processAndStoreImage } from "./imageService.js";
import { PICTIONARY_WORDS } from "./wordList.js";

// Add a custom word to a category
export async function addCustomWord(word: string, category: string) {
  const validCategories = Object.keys(PICTIONARY_WORDS);
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }
  
  const normalizedWord = word.toLowerCase().trim();
  if (!normalizedWord || normalizedWord.length < 2) {
    throw new Error('Word must be at least 2 characters long');
  }
  
  // Add word to the category
  PICTIONARY_WORDS[category as keyof typeof PICTIONARY_WORDS].push(normalizedWord);
  return { word: normalizedWord, category };
}

// Upload a custom image for a word
export async function uploadCustomImage(word: string, imageBuffer: Buffer) {
  if (!Buffer.isBuffer(imageBuffer)) {
    throw new Error('Invalid image data');
  }
  
  const normalizedWord = word.toLowerCase().trim();
  return processAndStoreImage(normalizedWord, imageBuffer);
}

// Generate AI images for a specific word
export async function generateImagesForWord(word: string, count: number = 3) {
  const normalizedWord = word.toLowerCase().trim();
  const results = [];
  
  const prompts = [
    `A simple, clear illustration of ${word} in a minimalist style.`,
    `A cartoon-style drawing of ${word} with bold outlines.`,
    `A basic, easy-to-recognize ${word} in digital art style.`
  ];
  
  for (let i = 0; i < Math.min(count, prompts.length); i++) {
    try {
      const imageData = await generateImage(prompts[i]);
      if (!imageData.startsWith('data:image/')) {
        console.error(`Failed to generate valid image for "${word}" (variation ${i + 1})`);
        continue;
      }
      
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Store the image
      const imageUrl = await processAndStoreImage(normalizedWord, imageBuffer);
      results.push(imageUrl);
      
      // Wait between generations to avoid rate limits
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Error generating image ${i + 1} for word "${word}":`, error);
    }
  }
  
  return results;
}

// Get all words and their image counts
export async function getWordsStatus() {
  const allWords = Object.entries(PICTIONARY_WORDS).reduce((acc, [category, words]) => {
    words.forEach(word => {
      acc[word.toLowerCase()] = { word: word.toLowerCase(), category, imageCount: 0 };
    });
    return acc;
  }, {} as Record<string, { word: string, category: string, imageCount: number }>);
  
  // Get image counts from database
  const imageCounts = await db.query.preGeneratedImages.findMany({
    columns: {
      word: true,
    }
  });
  
  // Update counts
  imageCounts.forEach(({ word }) => {
    if (allWords[word]) {
      allWords[word].imageCount++;
    }
  });
  
  return Object.values(allWords);
}
