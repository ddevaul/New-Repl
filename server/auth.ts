import { Request as ExpressRequest, Response } from "express";

interface Request extends ExpressRequest {
  user?: {
    id: number;
    isAdmin?: boolean;
  };
}

export type { Request };
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logActivity } from "./services/activityLogger.js";

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const TOKEN_EXPIRY = '7d'; // Increased from 24h to 7 days

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

    // Generate JWT with isAdmin flag
    const token = jwt.sign({ 
      id: user.id,
      isAdmin: user.isAdmin 
    }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

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
    console.log('Login attempt received:', { email: req.body.email });
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('Missing credentials in request');
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      console.log('User not found:', email);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for user:', email);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log('Login successful for user:', email);
    try {
      await logActivity({
        userId: user.id,
        actionType: 'login',
        details: { email: user.email }
      });
    } catch (error) {
      console.warn('Failed to log login activity:', error);
      // Continue with login process even if logging fails
    }

    // Generate JWT with isAdmin flag and longer expiration
    const token = jwt.sign({ 
      id: user.id,
      isAdmin: user.isAdmin 
    }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

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
    res.status(500).json({ message: "An error occurred during login" });
  }
}

// Middleware to verify JWT
export function authMiddleware(req: Request, res: Response, next: Function) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        message: "Access denied. No token provided.",
        needsLogin: true
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; isAdmin?: boolean };
      req.user = {
        id: decoded.id,
        isAdmin: decoded.isAdmin
      };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          message: "Token expired. Please log in again.",
          needsLogin: true
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      message: "Invalid token. Please log in again.",
      needsLogin: true
    });
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

    if (user.gamesPlayed >= (user.gamesLimit || 3)) {
      return res.status(403).send("Free game limit reached");
    }

    next();
  } catch (error) {
    console.error('Game limit check error:', error);
    res.status(500).send("Error checking game limit");
  }
}