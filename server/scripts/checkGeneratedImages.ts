import { db } from "../../db/index.js";
import { preGeneratedImages } from "../../db/schema.js";
import { PICTIONARY_WORDS } from "../services/wordList.js";

async function checkGeneratedImages() {
  try {
    console.log('Checking generated images in database...\n');
    
    const images = await db.query.preGeneratedImages.findMany();
    console.log(`Found ${images.length} generated images in total.\n`);
    
    // Get all possible words
    const allWords = Object.values(PICTIONARY_WORDS).flat();
    console.log(`Total words in dictionary: ${allWords.length}\n`);
    
    // Group by word
    const wordGroups = images.reduce((acc: Record<string, string[]>, img: any) => {
      acc[img.word] = acc[img.word] || [];
      acc[img.word].push(img.imageUrl);
      return acc;
    }, {});
    
    // Calculate progress
    const wordsWithImages = Object.keys(wordGroups).length;
    const progressPercent = (wordsWithImages / allWords.length * 100).toFixed(1);
    
    console.log('=== Generation Progress ===');
    console.log(`Words with images: ${wordsWithImages}/${allWords.length} (${progressPercent}%)`);
    console.log('========================\n');
    
    // Display results by category
    for (const [category, words] of Object.entries(PICTIONARY_WORDS)) {
      console.log(`\n=== ${category.toUpperCase()} ===`);
      words.forEach(word => {
        const urls = wordGroups[word] || [];
        const status = urls.length ? `✓ ${urls.length} images` : '✗ no images';
        console.log(`${word}: ${status}`);
      });
    }
    
  } catch (error) {
    console.error('Failed to check generated images:', error);
    process.exit(1);
  }
}

checkGeneratedImages().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
