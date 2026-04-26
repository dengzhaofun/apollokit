CREATE TABLE "navigation_favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"route_path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "navigation_favorites" ADD CONSTRAINT "navigation_favorites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_favorites" ADD CONSTRAINT "navigation_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_favorites_unique" ON "navigation_favorites" USING btree ("organization_id","user_id","route_path");--> statement-breakpoint
CREATE INDEX "navigation_favorites_lookup" ON "navigation_favorites" USING btree ("organization_id","user_id");