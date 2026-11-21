CREATE TABLE `exam_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`course` text NOT NULL,
	`exam_id` text DEFAULT '' NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'novo' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exam_leads_created` ON `exam_leads` (`created_at`);