ALTER TABLE "currency_ledger" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "currency_ledger" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "item_grant_logs" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "item_grant_logs" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "entity_instances" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "currencies_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "item_definitions_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "entity_blueprints_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "currency_ledger_activity_idx" ON "currency_ledger" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "item_grant_logs_activity_idx" ON "item_grant_logs" USING btree ("activity_id");--> statement-breakpoint
ALTER TABLE "activity_configs" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "activity_configs" DROP COLUMN "kind_metadata";