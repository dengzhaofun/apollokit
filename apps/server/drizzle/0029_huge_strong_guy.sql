ALTER TABLE "item_definitions" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
CREATE INDEX "item_definitions_activity_idx" ON "item_definitions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "entity_blueprints_activity_idx" ON "entity_blueprints" USING btree ("activity_id");