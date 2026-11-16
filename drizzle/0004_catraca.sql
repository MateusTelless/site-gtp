CREATE TABLE `catraca_acessos` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo` text NOT NULL,
	`student_id` text,
	`data_hora` text NOT NULL,
	`resultado` text NOT NULL,
	`motivo` text DEFAULT '' NOT NULL,
	`equipamento` integer DEFAULT 1 NOT NULL,
	`recebido_em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catraca_acessos_codigo` ON `catraca_acessos` (`codigo`,`data_hora`);--> statement-breakpoint
CREATE INDEX `catraca_acessos_student` ON `catraca_acessos` (`student_id`,`data_hora`);--> statement-breakpoint
CREATE INDEX `catraca_acessos_data` ON `catraca_acessos` (`data_hora`);--> statement-breakpoint
CREATE TABLE `catraca_status` (
	`equipamento` integer PRIMARY KEY NOT NULL,
	`versao` text NOT NULL,
	`conectada` integer NOT NULL,
	`ultima_lista` text,
	`pendentes` integer DEFAULT 0 NOT NULL,
	`visto_em` text NOT NULL
);
