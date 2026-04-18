-- Development-only cleanup: drop historical "singleton" rows (the upsert
-- pattern previously used to model currency balances inside the unified
-- item_inventories table). Currencies now live in currency_wallets.
-- Users confirmed no back-compat is required at this stage.
DELETE FROM "item_inventories" WHERE "is_singleton" = true;
--> statement-breakpoint
ALTER TABLE "item_definitions" DROP COLUMN "is_currency";
