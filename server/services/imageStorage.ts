import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET!;

export async function uploadImage(imageData: Buffer, key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: imageData,
    ContentType: 'image/png',
  });

  try {
    await s3Client.send(command);
    return await getImageUrl(key);
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw new Error('Failed to upload image');
  }
}

export async function getImageUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    // Generate a presigned URL that expires in 1 hour
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error('Failed to generate image URL');
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
