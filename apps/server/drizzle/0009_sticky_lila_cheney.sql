CREATE TABLE "shop_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"parent_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"level" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_growth_stage_claims" (
	"stage_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "shop_growth_stage_claims_pk" PRIMARY KEY("stage_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "shop_growth_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"stage_index" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb,
	"reward_items" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product_tags" (
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_product_tags_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"gallery_images" jsonb,
	"product_type" text DEFAULT 'regular' NOT NULL,
	"cost_items" jsonb NOT NULL,
	"reward_items" jsonb NOT NULL,
	"time_window_type" text DEFAULT 'none' NOT NULL,
	"available_from" timestamp,
	"available_to" timestamp,
	"eligibility_anchor" text,
	"eligibility_window_seconds" integer,
	"refresh_cycle" text,
	"refresh_limit" integer,
	"user_limit" integer,
	"global_limit" integer,
	"global_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_user_purchase_states" (
	"product_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"cycle_count" integer DEFAULT 0 NOT NULL,
	"cycle_reset_at" timestamp,
	"first_purchase_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_user_purchase_states_pk" PRIMARY KEY("product_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_parent_id_shop_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shop_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_growth_stage_claims" ADD CONSTRAINT "shop_growth_stage_claims_stage_id_shop_growth_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."shop_growth_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_growth_stages" ADD CONSTRAINT "shop_growth_stages_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_tags" ADD CONSTRAINT "shop_product_tags_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_tags" ADD CONSTRAINT "shop_product_tags_tag_id_shop_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."shop_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_category_id_shop_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."shop_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_tags" ADD CONSTRAINT "shop_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_user_purchase_states" ADD CONSTRAINT "shop_user_purchase_states_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_categories_org_idx" ON "shop_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shop_categories_parent_idx" ON "shop_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_categories_org_alias_uidx" ON "shop_categories" USING btree ("organization_id","alias") WHERE "shop_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_growth_stage_claims_org_user_product_idx" ON "shop_growth_stage_claims" USING btree ("organization_id","end_user_id","product_id");--> statement-breakpoint
CREATE INDEX "shop_growth_stages_product_idx" ON "shop_growth_stages" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shop_growth_stages_org_idx" ON "shop_growth_stages" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_growth_stages_product_index_uidx" ON "shop_growth_stages" USING btree ("product_id","stage_index");--> statement-breakpoint
CREATE INDEX "shop_product_tags_tag_idx" ON "shop_product_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "shop_products_org_idx" ON "shop_products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shop_products_org_category_idx" ON "shop_products" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "shop_products_org_type_idx" ON "shop_products" USING btree ("organization_id","product_type");--> statement-breakpoint
CREATE INDEX "shop_products_org_window_active_idx" ON "shop_products" USING btree ("organization_id","time_window_type","is_active");--> statement-breakpoint
CREATE INDEX "shop_products_absolute_window_idx" ON "shop_products" USING btree ("organization_id","is_active","available_from","available_to") WHERE "shop_products"."time_window_type" = 'absolute';--> statement-breakpoint
CREATE UNIQUE INDEX "shop_products_org_alias_uidx" ON "shop_products" USING btree ("organization_id","alias") WHERE "shop_products"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_tags_org_idx" ON "shop_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_tags_org_alias_uidx" ON "shop_tags" USING btree ("organization_id","alias") WHERE "shop_tags"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_user_purchase_states_org_user_idx" ON "shop_user_purchase_states" USING btree ("organization_id","end_user_id");