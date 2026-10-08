CREATE TABLE `certification_types` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certification_type_name` ON `certification_types` (`business_id`,`name_key`);--> statement-breakpoint
ALTER TABLE `certifications` ADD `certification_type_id` text REFERENCES certification_types(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `deletion_reason` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `deleted_by` text;--> statement-breakpoint
ALTER TABLE `training_needs` ADD `certification_type_id` text REFERENCES certification_types(id);