import { db } from "../../db/index.js";
import { activityLogs } from "../../db/schema.js";

export type ActivityType = 
  | 'login'
  | 'game_start'
  | 'game_end'
  | 'word_add'
  | 'image_generate'
  | 'user_update'
  | 'admin_action';

export interface ActivityLogEntry {
  userId: number;
  actionType: ActivityType;
  details?: Record<string, any>;
}

export async function logActivity(entry: ActivityLogEntry) {
  try {
    const [log] = await db.insert(activityLogs).values({
      userId: entry.userId,
      actionType: entry.actionType,
      details: entry.details ? JSON.stringify(entry.details) : null
    }).returning();
    
    return log;
  } catch (error) {
    console.error('Error logging activity:', error);
    throw new Error('Failed to log activity');
  }
}

export async function getUserActivities(userId: number, limit = 50) {
  try {
    const logs = await db.query.activityLogs.findMany({
      where: (activityLogs, { eq }) => eq(activityLogs.userId, userId),
      orderBy: (activityLogs, { desc }) => [desc(activityLogs.createdAt)],
      limit
    });
    return logs;
  } catch (error) {
    console.error('Error fetching user activities:', error);
    throw new Error('Failed to fetch user activities');
  }
}

export async function getAllActivities(limit = 100) {
  try {
    const logs = await db.query.activityLogs.findMany({
      orderBy: (activityLogs, { desc }) => [desc(activityLogs.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            name: true,
            email: true
          }
        }
      }
    });
    return logs;
  } catch (error) {
    console.error('Error fetching all activities:', error);
    throw new Error('Failed to fetch activities');
  }
}
