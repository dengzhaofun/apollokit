CREATE TABLE "experiment_assignments" (
	"experiment_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_assignments_pk" PRIMARY KEY("experiment_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"variant_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_control" boolean DEFAULT false NOT NULL,
	"config_json" jsonb,
	"sort_order" text COLLATE "C" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_experiments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"traffic_allocation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"control_variant_key" text NOT NULL,
	"targeting_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"primary_metric" jsonb,
	"metric_window_days" integer DEFAULT 7 NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiment_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiment_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_experiments" ADD CONSTRAINT "experiment_experiments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_assignments_org_user_idx" ON "experiment_assignments" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "experiment_assignments_variant_idx" ON "experiment_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_variants_experiment_key_uidx" ON "experiment_variants" USING btree ("experiment_id","variant_key");--> statement-breakpoint
CREATE INDEX "experiment_variants_org_idx" ON "experiment_variants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiment_variants_experiment_sort_idx" ON "experiment_variants" USING btree ("experiment_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_experiments_org_key_uidx" ON "experiment_experiments" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "experiment_experiments_org_status_started_idx" ON "experiment_experiments" USING btree ("organization_id","status","started_at");