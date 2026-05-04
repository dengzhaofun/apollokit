CREATE TABLE "mau_active_player" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"eu_user_id" text NOT NULL,
	"year_month" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mau_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"year_month" text NOT NULL,
	"threshold" integer NOT NULL,
	"mau_at_trigger" integer NOT NULL,
	"quota_at_trigger" integer NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mau_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text NOT NULL,
	"period_start" date NOT NULL,
	"mau" integer NOT NULL,
	"source" text NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscription_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mau_quota" integer NOT NULL,
	"overage_price_per_1k" integer NOT NULL,
	"base_price_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_team_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"billing_cycle_anchor" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mau_active_player" ADD CONSTRAINT "mau_active_player_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mau_active_player" ADD CONSTRAINT "mau_active_player_eu_user_id_eu_user_id_fk" FOREIGN KEY ("eu_user_id") REFERENCES "public"."eu_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mau_alert" ADD CONSTRAINT "mau_alert_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_team_subscription" ADD CONSTRAINT "billing_team_subscription_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_team_subscription" ADD CONSTRAINT "billing_team_subscription_plan_id_billing_subscription_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_subscription_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mau_active_player_team_user_month_uidx" ON "mau_active_player" USING btree ("team_id","eu_user_id","year_month");--> statement-breakpoint
CREATE INDEX "mau_active_player_team_month_idx" ON "mau_active_player" USING btree ("team_id","year_month");--> statement-breakpoint
CREATE UNIQUE INDEX "mau_alert_team_month_threshold_uidx" ON "mau_alert" USING btree ("team_id","year_month","threshold");--> statement-breakpoint
CREATE UNIQUE INDEX "mau_snapshot_team_period_source_uidx" ON "mau_snapshot" USING btree ("team_id","period_start","source");--> statement-breakpoint
CREATE INDEX "mau_snapshot_org_period_idx" ON "mau_snapshot" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_plan_slug_uidx" ON "billing_subscription_plan" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_team_subscription_team_uidx" ON "billing_team_subscription" USING btree ("team_id");