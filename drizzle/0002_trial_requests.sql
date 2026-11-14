CREATE TABLE `trial_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`course` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'novo' NOT NULL
);
