CREATE TABLE `staff_message_recipients` (
	`message_id` text NOT NULL,
	`member_id` text NOT NULL,
	`read_at` text,
	PRIMARY KEY(`message_id`, `member_id`),
	FOREIGN KEY (`message_id`) REFERENCES `staff_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_message_recipients_member` ON `staff_message_recipients` (`member_id`);--> statement-breakpoint
CREATE TABLE `staff_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`request_id` text NOT NULL,
	`audience` text NOT NULL,
	`target_member_ids` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`sender` text NOT NULL,
	`sender_id` text NOT NULL,
	`sent_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_messages_business_date` ON `staff_messages` (`business_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_messages_request` ON `staff_messages` (`business_id`,`request_id`);