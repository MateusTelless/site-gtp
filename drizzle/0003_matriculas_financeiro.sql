CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`ip` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`exam` text NOT NULL,
	`unit` text NOT NULL,
	`shift` text NOT NULL,
	`sheet_code` text DEFAULT '' NOT NULL,
	`course_id` text DEFAULT '' NOT NULL,
	`schedule` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`seats` integer DEFAULT 0 NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'aberta' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`enrollment_id` text,
	`document` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` text NOT NULL,
	`ip` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`class_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`payer_person_id` text NOT NULL,
	`status` text NOT NULL,
	`due_day` integer NOT NULL,
	`payment_method` text NOT NULL,
	`origin` text DEFAULT 'site' NOT NULL,
	`submitted` text NOT NULL,
	`needs_review` integer DEFAULT 0 NOT NULL,
	`status_reason` text,
	`contract_signed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `enrollments_student` ON `enrollments` (`student_id`);--> statement-breakpoint
CREATE INDEX `enrollments_class` ON `enrollments` (`class_id`);--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_on` text NOT NULL,
	`status` text DEFAULT 'aberta' NOT NULL,
	`provider_ref` text,
	`provider_url` text,
	`cancel_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installments_number` ON `installments` (`enrollment_id`,`number`);--> statement-breakpoint
CREATE INDEX `installments_due` ON `installments` (`status`,`due_on`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`installment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`method` text NOT NULL,
	`paid_on` text NOT NULL,
	`status` text DEFAULT 'confirmado' NOT NULL,
	`origin` text NOT NULL,
	`provider_ref` text,
	`recorded_by` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_ref_unique` ON `payments` (`provider_ref`);--> statement-breakpoint
CREATE INDEX `payments_installment` ON `payments` (`installment_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`cpf` text NOT NULL,
	`birth_date` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`cep` text NOT NULL,
	`street` text NOT NULL,
	`number` text NOT NULL,
	`complement` text DEFAULT '' NOT NULL,
	`district` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_cpf_unique` ON `people` (`cpf`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`name` text NOT NULL,
	`enrollment_fee_cents` integer DEFAULT 0 NOT NULL,
	`enrollment_fee_due_days` integer DEFAULT 3 NOT NULL,
	`installment_count` integer NOT NULL,
	`installment_cents` integer NOT NULL,
	`first_due_month` text NOT NULL,
	`due_days` text NOT NULL,
	`methods` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_class` ON `plans` (`class_id`);--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`relationship` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_guardians_pair` ON `student_guardians` (`student_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`status` text DEFAULT 'ativo' NOT NULL,
	`biometrics_registered` integer DEFAULT 0 NOT NULL,
	`biometrics_at` text,
	`biometrics_by` text,
	`access_code` text,
	`legacy_code` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_person_id_unique` ON `students` (`person_id`);