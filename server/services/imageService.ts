import sharp from 'sharp';
import { uploadImage, getImageUrl } from './imageStorage.js';
import { generateImage as generateAIImage, PLACEHOLDER_IMAGE } from './imageGeneration.js';
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
    
    console.log('Image processed successfully, uploading to DigitalOcean Spaces...');
    // Upload to DigitalOcean Spaces
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

// Function to generate and store images for the default word list
export async function generateAndStoreDefaultImages(words: string[]) {
  console.log('Starting to generate and store default images...');
  
  for (const word of words) {
    try {
      // Check if we already have an image for this word
      const existing = await db.query.preGeneratedImages.findFirst({
        where: eq(preGeneratedImages.word, word)
      });
      
      if (!existing) {
        console.log(`Generating image for word: ${word}`);
        const imageData = await generateAIImage(`A simple, clear illustration of ${word}`);
        if (imageData === PLACEHOLDER_IMAGE) {
          console.log('Received placeholder image, skipping storage');
          continue;
        }
        
        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        await processAndStoreImage(word, imageBuffer);
        console.log(`Successfully generated and stored image for: ${word}`);
        
        // Wait a bit between generations to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to generate image for word: ${word}`, error);
    }
  }
  
  console.log('Finished generating and storing default images');
}
