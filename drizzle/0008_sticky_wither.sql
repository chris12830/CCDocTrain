CREATE TABLE `document_control_numbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `businesses` ADD `document_numbering_mode` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `system_control_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_system_control_number` ON `documents` (`system_control_number`);