import { Request as ExpressRequest, Response } from "express";

interface Request extends ExpressRequest {
  user?: {
    id: number;
  };
}
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

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
