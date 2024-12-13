import { generateAllImages, generateAndStoreImagesForWord, PICTIONARY_WORDS } from '../services/wordList.js';

async function main() {
  const args = process.argv.slice(2);
  const category = args[0];
  const word = args[1];

  if (word) {
    // Generate images for a specific word
    console.log(`Generating images for word: ${word}`);
    await generateAndStoreImagesForWord(word);
  } else if (category && category in PICTIONARY_WORDS) {
    // Generate images for a specific category
    console.log(`Generating images for category: ${category}`);
    const words = PICTIONARY_WORDS[category as keyof typeof PICTIONARY_WORDS];
    for (const word of words) {
      await generateAndStoreImagesForWord(word);
    }
  } else {
    // Generate all images
    console.log('Starting generation of all images');
    await generateAllImages();
  }
}

main().catch(console.error);
