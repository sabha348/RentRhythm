CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`resource_id` text,
	`outcome` text NOT NULL,
	`received_at` text DEFAULT (datetime('now')) NOT NULL
);
