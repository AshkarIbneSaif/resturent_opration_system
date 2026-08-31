CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`old_value_json` text,
	`new_value_json` text,
	`ip_address` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`bill_number` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`service_charge_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`status` text DEFAULT 'UNPAID' NOT NULL,
	`generated_by` text NOT NULL,
	`generated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_bill_number_unique` ON `bills` (`bill_number`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `combo_items` (
	`combo_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`combo_id`, `menu_item_id`),
	FOREIGN KEY (`combo_id`) REFERENCES `combos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `combos` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`price_minor` integer NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_id`, `name`),
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text,
	`phone` text,
	`email` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_availability_events` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`changed_by` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`starts_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`ends_at` integer,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username_attempted` text NOT NULL,
	`success` integer NOT NULL,
	`reason` text,
	`ip_address` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `menu_item_modifiers` (
	`menu_item_id` text NOT NULL,
	`modifier_id` text NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`max_quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`menu_item_id`, `modifier_id`),
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modifier_id`) REFERENCES `modifiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`base_price_minor` integer NOT NULL,
	`image_path` text,
	`is_active` integer DEFAULT true NOT NULL,
	`kitchen_available` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `menu_items_category_idx` ON `menu_items` (`category_id`);--> statement-breakpoint
CREATE TABLE `menu_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`name` text NOT NULL,
	`price_delta_minor` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `modifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_delta_minor` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offer_items` (
	`offer_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`offer_id`, `menu_item_id`),
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_item_modifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`modifier_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modifier_id`) REFERENCES `modifiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	`notes` text,
	`kitchen_status` text DEFAULT 'PENDING' NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `menu_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`old_status` text,
	`new_status` text NOT NULL,
	`changed_by` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_idx` ON `order_status_history` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`public_order_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`source` text NOT NULL,
	`order_type` text NOT NULL,
	`table_id` text,
	`waiter_user_id` text,
	`created_by_user_id` text NOT NULL,
	`customer_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`service_charge_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`waiter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_public_order_id_unique` ON `orders` (`public_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_table_idx` ON `orders` (`table_id`);--> statement-breakpoint
CREATE INDEX `orders_waiter_idx` ON `orders` (`waiter_user_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`payment_method` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reference` text,
	`received_by` text NOT NULL,
	`paid_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE TABLE `restaurant_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`table_number` text NOT NULL,
	`capacity` integer NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `table_branch_number_uq` ON `restaurant_tables` (`branch_id`,`table_number`);--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_path` text,
	`address` text,
	`phone` text,
	`email` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`employee_code` text,
	`role_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_branch_idx` ON `users` (`branch_id`);