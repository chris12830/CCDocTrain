CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_business_date` ON `audit` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/Toronto' NOT NULL,
	`sample` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_owner` ON `businesses` (`owner_id`);--> statement-breakpoint
CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`issuer` text NOT NULL,
	`number` text,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`reminder_days` integer DEFAULT 60 NOT NULL,
	`file_key` text,
	`filename` text,
	`mime` text,
	`replaces_id` text,
	`superseded` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_certifications_business` ON `certifications` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_certifications_member` ON `certifications` (`member_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`title` text NOT NULL,
	`code` text NOT NULL,
	`category` text NOT NULL,
	`current_revision_id` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_documents_business` ON `documents` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_code` ON `documents` (`business_id`,`code`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`job` text NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL,
	`invite_hash` text,
	`invite_expires` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_members_business` ON `members` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_email` ON `members` (`business_id`,`email`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`file_key` text,
	`filename` text,
	`mime` text,
	`content` text DEFAULT '' NOT NULL,
	`changes` text NOT NULL,
	`created_at` text NOT NULL,
	`released_at` text,
	`author` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_revisions_document` ON `revisions` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revision_number` ON `revisions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `training` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`document_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`member_id` text NOT NULL,
	`start_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`viewed_at` text,
	`acknowledged_at` text,
	`acknowledged_by` text,
	`comment` text,
	`reminder_count` integer DEFAULT 0 NOT NULL,
	`last_reminder` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_training_business` ON `training` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_training_member` ON `training` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_training_revision_member` ON `training` (`revision_id`,`member_id`);