ALTER TABLE `bills` ADD `discount_reason` text;--> statement-breakpoint
ALTER TABLE `bills` ADD `offer_id` text REFERENCES offers(id);--> statement-breakpoint
ALTER TABLE `combos` ADD `description` text;--> statement-breakpoint
ALTER TABLE `combos` ADD `created_by` text REFERENCES users(id);