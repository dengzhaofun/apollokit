-- pg_trgm extension + GIN trigram indexes for the search-heavy tables.
--
-- Powers the `q` parameter in the list-filter DSL (`f.search({...})`).
-- Without these indexes a leading-`%` ILIKE seq-scans the whole table;
-- with them, ILIKE on a ≥3-char term hits the index and stays under
-- ~50ms even on 100k-row tables.
--
-- Tables indexed (the columns each module's `f.search({ columns: [...] })`
-- already declares as the search surface):
--   eu_user                — name, email
--   activity_configs       — name, alias
--   character_definitions  — name, alias
--   item_definitions       — name, alias
--   task_definitions       — name, alias
--   dialogue_scripts       — name, alias
--
-- The DSL's `f.search({ mode: "trgm" })` toggle is a no-op until these
-- indexes exist; once they're in place a follow-up patch flips each
-- module's `mode` from "ilike" to "trgm" so the planner uses them.
--
-- IF NOT EXISTS guards make the migration safe to re-apply.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "eu_user_name_trgm_idx"
  ON "eu_user" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eu_user_email_trgm_idx"
  ON "eu_user" USING gin ("email" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "activity_configs_name_trgm_idx"
  ON "activity_configs" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_configs_alias_trgm_idx"
  ON "activity_configs" USING gin ("alias" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "character_definitions_name_trgm_idx"
  ON "character_definitions" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "character_definitions_alias_trgm_idx"
  ON "character_definitions" USING gin ("alias" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "item_definitions_name_trgm_idx"
  ON "item_definitions" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_definitions_alias_trgm_idx"
  ON "item_definitions" USING gin ("alias" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_definitions_name_trgm_idx"
  ON "task_definitions" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_definitions_alias_trgm_idx"
  ON "task_definitions" USING gin ("alias" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dialogue_scripts_name_trgm_idx"
  ON "dialogue_scripts" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dialogue_scripts_alias_trgm_idx"
  ON "dialogue_scripts" USING gin ("alias" gin_trgm_ops);
