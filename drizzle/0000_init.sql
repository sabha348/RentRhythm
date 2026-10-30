CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer NOT NULL,
	`month` text NOT NULL,
	`paypal_invoice_id` text,
	`invoice_number` text NOT NULL,
	`status` text NOT NULL,
	`total` real NOT NULL,
	`due_date` text NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_tenant_id_month_unique` ON `invoices` (`tenant_id`,`month`);--> statement-breakpoint
CREATE TABLE `meal_attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`ate` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_attendance_tenant_id_date_meal_unique` ON `meal_attendance` (`tenant_id`,`date`,`meal`);--> statement-breakpoint
CREATE TABLE `meal_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`going` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_votes_tenant_id_date_meal_unique` ON `meal_votes` (`tenant_id`,`date`,`meal`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`meal_price_voted` real DEFAULT 3 NOT NULL,
	`meal_price_walk_in` real DEFAULT 5 NOT NULL,
	`grace_days` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`room` text NOT NULL,
	`monthly_rent` real NOT NULL,
	`payday_day` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `utility_charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer NOT NULL,
	`month` text NOT NULL,
	`label` text NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
