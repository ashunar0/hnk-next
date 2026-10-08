CREATE TABLE `invoice_shares` (
	`invoice_id` text NOT NULL,
	`user_id` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`invoice_id`, `user_id`),
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
