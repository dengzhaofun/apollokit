-- Four-role rollout: flip the column default from "member" → "operator"
-- and backfill historical rows whose role is the old "member" alias.
-- See `apps/server/src/auth/ac.ts` — `member` is registered as an alias
-- of `operator` so the in-flight rows keep working until this UPDATE
-- lands; after the UPDATE we can eventually drop the alias (Phase 2).
ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'operator';
--> statement-breakpoint
UPDATE "member" SET "role" = 'operator' WHERE "role" = 'member';
