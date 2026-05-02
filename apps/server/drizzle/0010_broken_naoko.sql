DROP INDEX "activity_configs_status_lifecycle_idx";--> statement-breakpoint
CREATE INDEX "activity_configs_status_lifecycle_idx" ON "activity_configs" USING btree ("status","visible_at","start_at","end_at","hidden_at");--> statement-breakpoint
ALTER TABLE "activity_configs" DROP COLUMN "reward_end_at";--> statement-breakpoint
ALTER TABLE "activity_configs" DROP COLUMN "milestone_tiers";--> statement-breakpoint
ALTER TABLE "activity_members" DROP COLUMN "milestones_achieved";