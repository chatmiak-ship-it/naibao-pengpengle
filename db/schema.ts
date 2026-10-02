import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const scores = sqliteTable(
  "scores",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    score: integer("score").notNull(),
    createdAt: integer("created_at").notNull(),
    userId: text("user_id"),
  },
  (table) => [
    index("idx_scores_created_at").on(table.createdAt),
    index("idx_scores_score_created_at").on(table.score, table.createdAt),
  ]
);
