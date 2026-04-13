DROP INDEX "item_inventories_singleton_uidx";--> statement-breakpoint
ALTER TABLE "item_inventories" ADD COLUMN "is_singleton" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "item_inventories_singleton_uidx" ON "item_inventories" USING btree ("organization_id","end_user_id","definition_id") WHERE "item_inventories"."is_singleton" = true;