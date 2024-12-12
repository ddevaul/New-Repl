import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  gamesPlayed: integer("games_played").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isAdmin: boolean("is_admin").default(false),
  gamesLimit: integer("games_limit").default(3)
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").unique().notNull(),
  status: text("status").notNull().default("waiting"), // waiting, playing, ended
  currentRound: integer("current_round").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  creatorId: integer("creator_id").references(() => users.id)
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").references(() => rooms.id),
  name: text("name").notNull(),
  isDrawer: boolean("is_drawer").default(false),
  score: integer("score").default(0)
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").references(() => rooms.id),
  word: text("word").notNull(),
  drawerPrompts: text("drawer_prompts").array(),
  guesses: text("guesses").array(),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow()
});

export const highScores = pgTable("high_scores", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  gamesPlayed: integer("games_played").notNull().default(1),
  totalGuessesCorrect: integer("total_guesses_correct").notNull().default(0),
  totalDrawingsGuessed: integer("total_drawings_guessed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const userRelations = relations(users, ({ many }) => ({
  rooms: many(rooms)
}));

export const roomRelations = relations(rooms, ({ many, one }) => ({
  players: many(players),
  rounds: many(rounds),
  creator: one(users, {
    fields: [rooms.creatorId],
    references: [users.id]
  })
}));

export const playerRelations = relations(players, ({ one }) => ({
  room: one(rooms, {
    fields: [players.roomId],
    references: [rooms.id]
  })
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const roundRelations = relations(rounds, ({ one }) => ({
  room: one(rooms, {
    fields: [rounds.roomId],
    references: [rooms.id]
  })
}));

export const insertRoomSchema = createInsertSchema(rooms);
export const selectRoomSchema = createSelectSchema(rooms);
export const insertPlayerSchema = createInsertSchema(players);
export const selectPlayerSchema = createSelectSchema(players);
export const insertRoundSchema = createInsertSchema(rounds);
export const selectRoundSchema = createSelectSchema(rounds);
export const insertHighScoreSchema = createInsertSchema(highScores);
export const selectHighScoreSchema = createSelectSchema(highScores);
