CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scores_created_at` ON `scores` (`created_at`);
