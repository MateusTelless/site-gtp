CREATE TABLE `lexus_ex_alunos` (
	`ra` text PRIMARY KEY NOT NULL,
	`name_hash` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lexus_ex_alunos_name` ON `lexus_ex_alunos` (`name_hash`);--> statement-breakpoint
ALTER TABLE `people` ADD `rg` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `ra` text;--> statement-breakpoint
CREATE UNIQUE INDEX `students_ra_unique` ON `students` (`ra`);