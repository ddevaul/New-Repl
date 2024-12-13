import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize S3 client for DigitalOcean Spaces
const s3Client = new S3Client({
  region: "us-east-1", // DigitalOcean Spaces default region
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true // Required for DigitalOcean Spaces
});

const BUCKET_NAME = process.env.S3_BUCKET!;

// Verify environment variables
if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !BUCKET_NAME) {
  console.error('Missing required S3 configuration environment variables');
  throw new Error('S3 storage configuration is incomplete');
}

export async function uploadImage(imageData: Buffer, key: string): Promise<string> {
  console.log('Starting image upload to DigitalOcean Spaces:', { bucket: BUCKET_NAME, key });
  
  try {
    // Set proper content type and ACL for public access
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: imageData,
      ContentType: 'image/png',
      ACL: 'public-read'
    });

    await s3Client.send(command);
    console.log('Image uploaded successfully to DigitalOcean Spaces');
    
    // Get a public URL for the uploaded image
    const publicUrl = await getImageUrl(key);
    console.log('Generated public URL for image:', publicUrl);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading image to DigitalOcean Spaces:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

export async function getImageUrl(key: string): Promise<string> {
  console.log('Generating URL for image:', { bucket: BUCKET_NAME, key });

  try {
    // For DigitalOcean Spaces, we can construct the public URL directly
    const publicUrl = `https://${BUCKET_NAME}.${process.env.S3_ENDPOINT!.replace('https://', '')}/${key}`;
    console.log('Generated public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error generating public URL:', error);
    throw new Error(`Failed to generate image URL: ${error.message}`);
  }
}

// Function to check if storage is properly configured
export async function checkStorageConnection(): Promise<boolean> {
  try {
    // Attempt to list objects (with a limit of 1) to verify connection
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'test-connection'
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Storage connection check failed:', error);
    return false;
  }
}
