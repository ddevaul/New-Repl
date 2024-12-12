import { Request as ExpressRequest, Response } from "express";

interface Request extends ExpressRequest {
  user?: {
    id: number;
  };
}
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function signup(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [user] = await db.insert(users).values({
      email,
      password: hashedPassword,
      name,
      gamesPlayed: 0,
    }).returning();

    // Generate JWT
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        gamesPlayed: user.gamesPlayed,
        isAdmin: user.isAdmin 
      } 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).send("Error creating user");
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return res.status(400).send("User not found");
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).send("Invalid password");
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        gamesPlayed: user.gamesPlayed,
        isAdmin: user.isAdmin 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send("Error logging in");
  }
}

// Middleware to verify JWT
export function authMiddleware(req: Request, res: Response, next: Function) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).send("Access denied. No token provided.");
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).send("Invalid token");
  }
}

// Check games played
export async function checkGameLimit(req: Request, res: Response, next: Function) {
  try {
    if (!req.user) {
      return res.status(401).send("Not authenticated");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user) {
      return res.status(400).send("User not found");
    }

    if (user.gamesPlayed && user.gamesPlayed >= 3) {
      return res.status(403).send("Free game limit reached");
    }

    next();
  } catch (error) {
    res.status(500).send("Error checking game limit");
  }
}
