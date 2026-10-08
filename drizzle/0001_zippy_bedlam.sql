CREATE TABLE `staff_records` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`record_date` text NOT NULL,
	`appraisal_year` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`author` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`filed_at` text,
	`follow_up_date` text,
	`completed_at` text,
	`follow_up_notes` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_records_business_member` ON `staff_records` (`business_id`,`member_id`);