import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").unique().notNull(),
  status: text("status").notNull().default("waiting"), // waiting, playing, ended
  currentRound: integer("current_round").default(1),
  createdAt: timestamp("created_at").defaultNow()
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

export const roomRelations = relations(rooms, ({ many }) => ({
  players: many(players),
  rounds: many(rounds)
}));

export const playerRelations = relations(players, ({ one }) => ({
  room: one(rooms, {
    fields: [players.roomId],
    references: [rooms.id]
  })
}));

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
