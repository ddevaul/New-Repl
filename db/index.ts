import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const queryClient = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: { rejectUnauthorized: false },
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(queryClient, { schema });
