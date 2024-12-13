import fs from 'fs/promises';
import path from 'path';
import { generateImage } from './imageGeneration.js';
import { processAndStoreImage } from './imageService.js';

// Common Pictionary words organized by categories
export const PICTIONARY_WORDS = {
  animals: [
    "dog", "cat", "elephant", "giraffe", "lion", "tiger", "penguin", "kangaroo", "dolphin", "octopus",
    "butterfly", "spider", "monkey", "zebra", "panda", "koala", "rhinoceros", "owl", "eagle", "snake"
  ],
  objects: [
    "chair", "table", "lamp", "computer", "phone", "book", "pencil", "clock", "umbrella", "glasses",
    "camera", "television", "bicycle", "car", "airplane", "train", "boat", "key", "door", "window"
  ],
  nature: [
    "tree", "flower", "mountain", "sun", "moon", "star", "cloud", "river", "ocean", "beach",
    "volcano", "island", "forest", "rainbow", "waterfall", "desert", "cave", "garden", "lake", "storm"
  ],
  food: [
    "pizza", "hamburger", "sandwich", "apple", "banana", "orange", "carrot", "cake", "ice cream", "cookie",
    "sushi", "pasta", "bread", "egg", "cheese", "coffee", "milk", "chocolate", "popcorn", "candy"
  ],
  activities: [
    "running", "swimming", "dancing", "singing", "reading", "writing", "painting", "cooking", "sleeping", "jumping",
    "skiing", "surfing", "fishing", "camping", "hiking", "skating", "playing", "climbing", "driving", "flying"
  ]
};

// Get all words as a flat array
export function getAllWords(): string[] {
  return Object.values(PICTIONARY_WORDS).flat();
}

// Generate variations of a prompt for the same word
function generatePromptVariations(word: string): string[] {
  return [
    `A simple, clear illustration of ${word} in a minimalist style.`,
    `A cartoon-style drawing of ${word} with bold outlines.`,
    `A basic, easy-to-recognize ${word} in digital art style.`
  ];
}

// Generate and store multiple images for each word
export async function generateAndStoreImagesForWord(word: string): Promise<void> {
  console.log(`Starting image generation for word: ${word}`);
  const prompts = generatePromptVariations(word);
  
  for (let i = 0; i < prompts.length; i++) {
    try {
      console.log(`Generating image ${i + 1}/3 for "${word}" with prompt: ${prompts[i]}`);
      const imageData = await generateImage(prompts[i]);
      
      if (!imageData.startsWith('data:image')) {
        console.error(`Failed to generate valid image for "${word}" (variation ${i + 1})`);
        continue;
      }

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Store the image with a unique key
      await processAndStoreImage(word, imageBuffer);
      console.log(`Successfully generated and stored image ${i + 1}/3 for "${word}"`);
      
      // Wait between generations to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error generating image for word "${word}" (variation ${i}):`, error);
    }
  }
}

// Batch process all words
export async function generateAllImages(batchSize = 5): Promise<void> {
  const words = getAllWords();
  console.log(`Starting batch image generation for ${words.length} words`);
  
  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1}/${Math.ceil(words.length/batchSize)}`);
    
    await Promise.all(batch.map(word => generateAndStoreImagesForWord(word)));
    
    // Wait between batches to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('Completed generating all images');
}
