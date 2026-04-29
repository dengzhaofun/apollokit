/**
 * Patch tool registry — admin-side complement to the server's
 * `tools/patch-registry.ts`. Maps a tool name (the wire identifier the
 * model emits as `tool-<name>`) to:
 *
 *   - the PATCH endpoint URL template that fires when the user
 *     accepts the proposal (`{key}` is interpolated with the tool's
 *     `key` input field), and
 *   - the human-readable label shown on the card header.
 *
 * Adding a new patchable module = one entry here, one tool file on the
 * server in `apps/server/src/modules/admin-agent/tools/patch/<module>.ts`,
 * and one entry in the server's `patch-registry.ts`.
 */

export type PatchEntry = {
  /** Module label for UI ("签到配置"). */
  label: string
  /**
   * URL template — `{key}` will be replaced with the tool input's `key`
   * field (URL-encoded). The PATCH body is the tool input's `patch`
   * field, sent as JSON.
   */
  endpoint: string
}

export const PATCH_REGISTRY: Record<string, PatchEntry> = {
  patchCheckInConfig: {
    label: "签到配置",
    endpoint: "/api/check-in/configs/{key}",
  },
  patchTaskDefinition: {
    label: "任务",
    endpoint: "/api/task/definitions/{key}",
  },
  patchActivityConfig: {
    label: "活动",
    endpoint: "/api/activity/{key}",
  },
  patchItemDefinition: {
    label: "道具",
    endpoint: "/api/item/definitions/{key}",
  },
  patchCharacterConfig: {
    label: "角色",
    endpoint: "/api/character/characters/{key}",
  },
  patchDialogueScript: {
    label: "剧情脚本",
    endpoint: "/api/dialogue/scripts/{key}",
  },
  patchAnnouncement: {
    label: "公告",
    endpoint: "/api/announcement/{key}",
  },
}

/** Returns the patch entry for a given tool name, or `undefined`. */
export function getPatchEntry(toolName: string): PatchEntry | undefined {
  return PATCH_REGISTRY[toolName]
}

/** Returns true if a UIMessage `part.type` is a `tool-patchXxx` part. */
export function isPatchToolPart(partType: string): boolean {
  if (!partType.startsWith("tool-patch")) return false
  return partType.slice("tool-".length) in PATCH_REGISTRY
}

/** Strip the `tool-` prefix to get the tool name. */
export function toolNameFromPartType(partType: string): string {
  return partType.startsWith("tool-")
    ? partType.slice("tool-".length)
    : partType
}

/**
 * Build the full PATCH URL for a tool name + key. Returns `null` when
 * the tool isn't in the registry (defensive — should never happen if
 * `isPatchToolPart` already passed).
 */
export function buildPatchUrl(toolName: string, key: string): string | null {
  const entry = getPatchEntry(toolName)
  if (!entry) return null
  return entry.endpoint.replace("{key}", encodeURIComponent(key))
}
