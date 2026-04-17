ALTER TABLE "banner_groups" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "banner_groups" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
ALTER TABLE "lottery_pools" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "lottery_pools" ADD COLUMN "activity_node_id" uuid;--> statement-breakpoint
CREATE INDEX "banner_groups_activity_idx" ON "banner_groups" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "lottery_pools_activity_idx" ON "lottery_pools" USING btree ("activity_id");