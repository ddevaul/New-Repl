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
    console.log(`Starting generation for ${words.length} words in category ${category}:`);
    console.log(words.join(', '));
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      console.log(`\n[${i + 1}/${words.length}] Generating images for "${word}"...`);
      await generateAndStoreImagesForWord(word);
      console.log(`Completed generation for "${word}"\n`);
    }
  } else {
    // Generate all images
    console.log('Starting generation of all images');
    await generateAllImages();
  }
}

main().catch(console.error);
