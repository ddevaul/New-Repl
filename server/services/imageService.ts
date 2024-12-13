import sharp from 'sharp';
import { uploadImage } from './imageStorage.js';
import { generateImage as generateAIImage } from './imageGeneration.js';
import { db } from "../../db/index.js";
import { preGeneratedImages } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// Function to process and store an AI-generated image
export async function processAndStoreImage(word: string, imageBuffer: Buffer): Promise<string> {
  try {
    console.log(`Starting image processing for word: ${word}`, {
      bufferLength: imageBuffer.length,
      isBuffer: Buffer.isBuffer(imageBuffer)
    });
    
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer received');
    }
    
    console.log('Processing image with Sharp...');
    // Process the image with sharp (resize, optimize, etc.)
    const processedImage = await sharp(imageBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();
    
    console.log('Image processed successfully, uploading to storage...');
    // Upload to storage
    const key = `generated/${word.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.png`;
    const storedImageUrl = await uploadImage(processedImage, key);
    console.log('Image uploaded successfully:', { key, url: storedImageUrl });
    
    // Store in database - allow multiple images per word
    await db.insert(preGeneratedImages).values({
      word: word.toLowerCase(),
      imageUrl: storedImageUrl
    });
    
    console.log(`Successfully stored image for word: ${word}`);
    return storedImageUrl;
  } catch (error) {
    console.error('Error processing and storing image:', error);
    throw new Error('Failed to process and store image');
  }
}

// Function to generate and store images for a word
export async function generateAndStoreImages(word: string, count: number = 3): Promise<string[]> {
  console.log(`Generating ${count} images for word: ${word}`);
  const generatedUrls: string[] = [];
  
  const prompts = [
    `A simple, clear illustration of ${word} in a minimalist style.`,
    `A cartoon-style drawing of ${word} with bold outlines.`,
    `A basic, easy-to-recognize ${word} in digital art style.`
  ].slice(0, count);
  
  for (const prompt of prompts) {
    try {
      console.log(`Generating image for prompt: ${prompt}`);
      const imageData = await generateAIImage(prompt);
      
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Process and store the image
      const imageUrl = await processAndStoreImage(word, imageBuffer);
      generatedUrls.push(imageUrl);
      
      // Wait between generations to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to generate image for prompt: ${prompt}`, error);
    }
  }
  
  if (generatedUrls.length === 0) {
    throw new Error(`Failed to generate any images for word: ${word}`);
  }
  
  return generatedUrls;
}

// Function to get or generate images for a word
export async function getOrGenerateImages(word: string): Promise<string[]> {
  // Try to get existing images first
  const existingImages = await db.query.preGeneratedImages.findMany({
    where: eq(preGeneratedImages.word, word.toLowerCase())
  });
  
  if (existingImages && existingImages.length > 0) {
    console.log(`Found ${existingImages.length} existing images for word: ${word}`);
    return existingImages.map(img => img.imageUrl);
  }
  
  // Generate new images if none exist
  console.log(`No existing images found for word: ${word}, generating new ones`);
  return generateAndStoreImages(word);
}
