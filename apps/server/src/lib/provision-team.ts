/**
 * Default-resource provisioning for a freshly-created project (Better Auth team).
 *
 * Called from `organizationHooks.afterCreateTeam` (see `auth.ts`). Runs once
 * per `auth.api.createTeam` invocation, regardless of trigger (onboarding
 * flow, manual creation in settings, programmatic via `auth.api`).
 *
 * Phase 1 — keeps a stub. Phase 2 work (event-catalog seeding, default
 * webhook templates, sample activity for demo template) lands inline as
 * each module migrates onto the `tenant_id` model.
 */
export async function provisionTeamDefaults(_teamId: string): Promise<void> {
  // Intentionally a no-op for now. The hook is wired so future per-module
  // initialization (e.g. seed default event_catalog_entries, create empty
  // webhook delivery queue marker, etc.) can be added without touching the
  // auth.ts plugin chain.
  return;
}
