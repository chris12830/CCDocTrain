CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`sent_date` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	`resolved_at` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reminder_delivery` ON `reminders` (`business_id`,`member_id`,`kind`,`source_id`,`sent_date`);--> statement-breakpoint
CREATE INDEX `idx_reminder_member` ON `reminders` (`business_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `reminder_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `reminder_every_days` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `reminder_last_run` text;--> statement-breakpoint
ALTER TABLE `certifications` ADD `photo_submitted_by` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `certifications` ADD `photo_submitted_at` text;--> statement-breakpoint
ALTER TABLE `certifications` ADD `submission_id` text;--> statement-breakpoint
ALTER TABLE `certifications` ADD `photo_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certification_submission` ON `certifications` (`business_id`,`submission_id`);