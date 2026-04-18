ALTER TABLE "storage_box_deposits" DROP CONSTRAINT "storage_box_deposits_currency_definition_id_item_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "storage_box_deposits" ADD CONSTRAINT "storage_box_deposits_currency_definition_id_currencies_id_fk" FOREIGN KEY ("currency_definition_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;