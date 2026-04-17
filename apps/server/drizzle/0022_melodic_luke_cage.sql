ALTER TABLE "entity_instances" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "nodes_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "schedules_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN "auto_publish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_instances_activity_idx" ON "entity_instances" USING btree ("activity_id");