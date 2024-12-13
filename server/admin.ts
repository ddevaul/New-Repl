import { Request as ExpressRequest, Response } from "express";
import multer from "multer";
import sharp from "sharp";

interface Request extends ExpressRequest {
  user?: {
    id: number;
    isAdmin?: boolean;
  };
}

export type { Request };
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { 
  addCustomWord, 
  uploadCustomImage, 
  generateImagesForWord,
  getWordsStatus 
} from "./services/wordManagement.js";

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Middleware to check if user is admin
export async function isAdmin(req: Request, res: Response, next: Function) {
  try {
    if (!req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user?.isAdmin) {
      return res.status(403).send("Not authorized");
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).send("Server error");
  }
}

// Get all users
export async function getAllUsers(req: Request, res: Response) {
  try {
    const allUsers = await db.query.users.findMany({
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    // Filter sensitive information
    const safeUsers = allUsers.map(({ password, ...user }) => user);
    res.json(safeUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).send("Error fetching users");
  }
}

// Update user's game limit
export async function updateUserGamesLimit(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    const { gamesLimit } = req.body;

    if (isNaN(userId) || typeof gamesLimit !== 'number' || gamesLimit < 0) {
      return res.status(400).send("Invalid input");
    }

    const [updatedUser] = await db
      .update(users)
      .set({ gamesLimit })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return res.status(404).send("User not found");
    }

    const { password, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error) {
    console.error('Update games limit error:', error);
    res.status(500).send("Error updating games limit");
  }
}

// Add a new word to the dictionary
export async function addWord(req: Request, res: Response) {
  try {
    const { word, category } = req.body;

    if (!word || !category) {
      return res.status(400).send("Word and category are required");
    }

    const result = await addCustomWord(word, category);
    res.json(result);
  } catch (error) {
    console.error('Add word error:', error);
    res.status(500).send(error instanceof Error ? error.message : "Error adding word");
  }
}

// Upload a custom image for a word
export async function uploadImage(req: Request, res: Response) {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).send(err.message);
    }

    try {
      const { word } = req.body;
      if (!word || !req.file) {
        return res.status(400).send("Word and image are required");
      }

      // Process image with sharp
      const processedImageBuffer = await sharp(req.file.buffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();

      const imageUrl = await uploadCustomImage(word, processedImageBuffer);
      res.json({ word, imageUrl });
    } catch (error) {
      console.error('Upload image error:', error);
      res.status(500).send("Error uploading image");
    }
  });
}

// Generate AI images for a word
export async function generateImages(req: Request, res: Response) {
  try {
    const { word, count } = req.body;
    
    if (!word) {
      return res.status(400).send("Word is required");
    }

    const imageUrls = await generateImagesForWord(word, count);
    res.json({ word, imageUrls });
  } catch (error) {
    console.error('Generate images error:', error);
    res.status(500).send("Error generating images");
  }
}

// Get status of all words and their images
export async function getStatus(req: Request, res: Response) {
  try {
    const status = await getWordsStatus();
    res.json(status);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).send("Error getting word status");
  }
}
