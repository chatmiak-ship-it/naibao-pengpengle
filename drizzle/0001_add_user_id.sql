ALTER TABLE `scores` ADD COLUMN `user_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scores_score_created_at` ON `scores` (`score`, `created_at`);
