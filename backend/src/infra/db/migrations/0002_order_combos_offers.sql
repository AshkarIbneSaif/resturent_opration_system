ALTER TABLE `order_items` ADD `combo_id` text REFERENCES combos(id);--> statement-breakpoint
ALTER TABLE `order_items` ADD `combo_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `offer_id` text REFERENCES offers(id);