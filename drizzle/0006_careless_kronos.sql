DROP INDEX `idx_training_revision_member`;--> statement-breakpoint
ALTER TABLE `training` ADD `cycle_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_training_revision_member_cycle` ON `training` (`revision_id`,`member_id`,`cycle_key`);--> statement-breakpoint
ALTER TABLE `training_needs` ADD `repeat_every_months` integer DEFAULT 0 NOT NULL;