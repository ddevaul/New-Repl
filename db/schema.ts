import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  serial,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  isAdmin: boolean("is_admin").default(false),
  gamesPlayed: integer("games_played").default(0),
  gamesLimit: integer("games_limit").default(3),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const highScores = pgTable("high_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  gamesPlayed: integer("games_played").default(0),
  totalGuessesCorrect: integer("total_guesses_correct").default(0),
  totalDrawingsGuessed: integer("total_drawings_guessed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const highScoreRelations = relations(highScores, ({ one }) => ({
  user: one(users, {
    fields: [highScores.userId],
    references: [users.id],
  }),
}));

export const insertHighScoreSchema = createInsertSchema(highScores);
export const selectHighScoreSchema = createSelectSchema(highScores);

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  actionType: text("action_type").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow()
});

export const activityLogRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id]
  })
}));

export const insertActivityLogSchema = createInsertSchema(activityLogs);
export const selectActivityLogSchema = createSelectSchema(activityLogs);

export const preGeneratedImages = pgTable("pre_generated_images", {
  id: serial("id").primaryKey(),
  word: text("word").notNull(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const insertPreGeneratedImageSchema = createInsertSchema(preGeneratedImages);
export const selectPreGeneratedImageSchema = createSelectSchema(preGeneratedImages);

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