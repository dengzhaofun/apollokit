ALTER TABLE "check_in_configs" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "check_in_configs" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "shop_products" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "shop_products" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
CREATE INDEX "check_in_configs_activity_idx" ON "check_in_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "shop_products_activity_idx" ON "shop_products" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "task_definitions_activity_idx" ON "task_definitions" USING btree ("activity_id");