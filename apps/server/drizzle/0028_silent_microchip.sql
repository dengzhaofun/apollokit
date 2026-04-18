CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"currency_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"balance_before" integer,
	"balance_after" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"currency_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_wallets" ADD CONSTRAINT "currency_wallets_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "currencies_org_idx" ON "currencies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_org_alias_uidx" ON "currencies" USING btree ("organization_id","alias") WHERE "currencies"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "currencies_activity_idx" ON "currencies" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_org_user_idx" ON "currency_ledger" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_source_idx" ON "currency_ledger" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_currency_idx" ON "currency_ledger" USING btree ("currency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currency_wallets_org_user_cur_uidx" ON "currency_wallets" USING btree ("organization_id","end_user_id","currency_id");--> statement-breakpoint
CREATE INDEX "currency_wallets_org_user_idx" ON "currency_wallets" USING btree ("organization_id","end_user_id");