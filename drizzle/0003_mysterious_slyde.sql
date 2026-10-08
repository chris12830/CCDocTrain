CREATE TABLE `training_needs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`role_id` text,
	`member_id` text,
	`kind` text NOT NULL,
	`document_id` text,
	`title` text NOT NULL,
	`start_offset_days` integer DEFAULT 0 NOT NULL,
	`due_offset_days` integer DEFAULT 7 NOT NULL,
	`start_date` text,
	`due_date` text,
	`renewal_lead_days` integer DEFAULT 60 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `training_roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_training_needs_role` ON `training_needs` (`business_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `idx_training_needs_member` ON `training_needs` (`business_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `training_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_training_role_name` ON `training_roles` (`business_id`,`name`);--> statement-breakpoint
ALTER TABLE `members` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `members` ADD `training_role_id` text REFERENCES training_roles(id);--> statement-breakpoint
ALTER TABLE `training` ADD `role_need_id` text REFERENCES training_needs(id);