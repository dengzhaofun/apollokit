CREATE TABLE "entity_action_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_blueprint_skins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"rarity" text,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stat_bonuses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_blueprints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"schema_id" uuid NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"rarity" text,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stat_growth" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"level_up_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank_up_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthesis_cost" jsonb,
	"max_level" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_formation_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"max_formations" integer DEFAULT 5 NOT NULL,
	"max_slots" integer DEFAULT 4 NOT NULL,
	"accepts_schema_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_duplicate_blueprints" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_formations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"formation_index" integer NOT NULL,
	"name" text,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"schema_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"rank_key" text,
	"skin_id" uuid,
	"computed_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_data" jsonb,
	"is_locked" boolean DEFAULT false NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_schemas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"stat_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tag_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slot_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level_config" jsonb DEFAULT '{"enabled":false,"maxLevel":1}'::jsonb NOT NULL,
	"rank_config" jsonb DEFAULT '{"enabled":false,"ranks":[]}'::jsonb NOT NULL,
	"synthesis_config" jsonb DEFAULT '{"enabled":false,"sameBlueprint":true,"inputCount":2}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_slot_assignments" (
	"owner_instance_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	"equipped_instance_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_slot_assignments_pk" PRIMARY KEY("owner_instance_id","slot_key","slot_index")
);
--> statement-breakpoint
ALTER TABLE "entity_blueprint_skins" ADD CONSTRAINT "entity_blueprint_skins_blueprint_id_entity_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."entity_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD CONSTRAINT "entity_blueprints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD CONSTRAINT "entity_blueprints_schema_id_entity_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."entity_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_formation_configs" ADD CONSTRAINT "entity_formation_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_formations" ADD CONSTRAINT "entity_formations_config_id_entity_formation_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."entity_formation_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_instances" ADD CONSTRAINT "entity_instances_blueprint_id_entity_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."entity_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_instances" ADD CONSTRAINT "entity_instances_skin_id_entity_blueprint_skins_id_fk" FOREIGN KEY ("skin_id") REFERENCES "public"."entity_blueprint_skins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_schemas" ADD CONSTRAINT "entity_schemas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_slot_assignments" ADD CONSTRAINT "entity_slot_assignments_owner_instance_id_entity_instances_id_fk" FOREIGN KEY ("owner_instance_id") REFERENCES "public"."entity_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_slot_assignments" ADD CONSTRAINT "entity_slot_assignments_equipped_instance_id_entity_instances_id_fk" FOREIGN KEY ("equipped_instance_id") REFERENCES "public"."entity_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_action_logs_org_user_idx" ON "entity_action_logs" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_action_logs_instance_idx" ON "entity_action_logs" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "entity_action_logs_action_created_idx" ON "entity_action_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "entity_blueprint_skins_blueprint_idx" ON "entity_blueprint_skins" USING btree ("blueprint_id");--> statement-breakpoint
CREATE INDEX "entity_blueprint_skins_org_idx" ON "entity_blueprint_skins" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_blueprint_skins_bp_alias_uidx" ON "entity_blueprint_skins" USING btree ("blueprint_id","alias") WHERE "entity_blueprint_skins"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_blueprints_org_idx" ON "entity_blueprints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "entity_blueprints_schema_idx" ON "entity_blueprints" USING btree ("schema_id");--> statement-breakpoint
CREATE INDEX "entity_blueprints_org_schema_idx" ON "entity_blueprints" USING btree ("organization_id","schema_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_blueprints_org_alias_uidx" ON "entity_blueprints" USING btree ("organization_id","alias") WHERE "entity_blueprints"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_formation_configs_org_idx" ON "entity_formation_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_formation_configs_org_alias_uidx" ON "entity_formation_configs" USING btree ("organization_id","alias") WHERE "entity_formation_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_formations_org_user_config_idx_uidx" ON "entity_formations" USING btree ("organization_id","end_user_id","config_id","formation_index");--> statement-breakpoint
CREATE INDEX "entity_formations_org_user_idx" ON "entity_formations" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_instances_org_user_idx" ON "entity_instances" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_instances_org_user_schema_idx" ON "entity_instances" USING btree ("organization_id","end_user_id","schema_id");--> statement-breakpoint
CREATE INDEX "entity_instances_org_user_bp_idx" ON "entity_instances" USING btree ("organization_id","end_user_id","blueprint_id");--> statement-breakpoint
CREATE INDEX "entity_schemas_org_idx" ON "entity_schemas" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_schemas_org_alias_uidx" ON "entity_schemas" USING btree ("organization_id","alias") WHERE "entity_schemas"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_slot_assignments_equipped_uidx" ON "entity_slot_assignments" USING btree ("equipped_instance_id");--> statement-breakpoint
CREATE INDEX "entity_slot_assignments_org_user_idx" ON "entity_slot_assignments" USING btree ("organization_id","end_user_id");