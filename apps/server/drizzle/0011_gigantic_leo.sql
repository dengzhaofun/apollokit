ALTER TABLE "experiment_experiments" ADD COLUMN "primary_metric" jsonb;--> statement-breakpoint
ALTER TABLE "experiment_experiments" ADD COLUMN "metric_window_days" integer DEFAULT 7 NOT NULL;