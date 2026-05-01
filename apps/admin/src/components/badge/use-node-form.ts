import { useForm } from "@tanstack/react-form"

import type {
  BadgeAggregation,
  BadgeDismissMode,
  BadgeDisplayType,
  BadgeNode,
  BadgeSignalMatchMode,
  CreateBadgeNodeInput,
} from "#/lib/types/badge"

/**
 * Form-state shape for the badge-node form. Differs from
 * `CreateBadgeNodeInput` in two places:
 *   - `parentKey` stays `string | null` (not stripped).
 *   - `dismissConfigJson` / `visibilityRuleJson` are textarea strings;
 *     we JSON.parse them at submit time.
 *   - `formError` carries JSON parse errors back to the field UI.
 */
export type BadgeNodeFormValues = {
  key: string
  parentKey: string | null
  displayType: BadgeDisplayType
  displayLabelKey: string
  signalMatchMode: BadgeSignalMatchMode
  signalKey: string
  signalKeyPrefix: string
  aggregation: BadgeAggregation
  dismissMode: BadgeDismissMode
  dismissConfigJson: string
  visibilityRuleJson: string
  isActive: boolean
  jsonError: string
}

export function useBadgeNodeForm({
  initial,
  onSubmit,
}: {
  initial?: BadgeNode
  onSubmit: (input: CreateBadgeNodeInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: {
      key: initial?.key ?? "",
      parentKey: initial?.parentKey ?? (null as string | null),
      displayType: ((initial?.displayType as BadgeDisplayType) ??
        "dot") as BadgeDisplayType,
      displayLabelKey: initial?.displayLabelKey ?? "",
      signalMatchMode: ((initial?.signalMatchMode as BadgeSignalMatchMode) ??
        "none") as BadgeSignalMatchMode,
      signalKey: initial?.signalKey ?? "",
      signalKeyPrefix: initial?.signalKeyPrefix ?? "",
      aggregation: ((initial?.aggregation as BadgeAggregation) ??
        "none") as BadgeAggregation,
      dismissMode: ((initial?.dismissMode as BadgeDismissMode) ??
        "auto") as BadgeDismissMode,
      dismissConfigJson: initial?.dismissConfig
        ? JSON.stringify(initial.dismissConfig, null, 2)
        : "",
      visibilityRuleJson: initial?.visibilityRule
        ? JSON.stringify(initial.visibilityRule, null, 2)
        : "",
      sortOrder: initial?.sortOrder ?? 0,
      isActive: initial?.isActive ?? true,
      jsonError: "",
    } as BadgeNodeFormValues,
    onSubmit: async ({ value, formApi }) => {
      formApi.setFieldValue("jsonError", "")
      let dismissConfig: Record<string, unknown> | null = null
      let visibilityRule: Record<string, unknown> | null = null
      try {
        dismissConfig = value.dismissConfigJson.trim()
          ? JSON.parse(value.dismissConfigJson)
          : null
        visibilityRule = value.visibilityRuleJson.trim()
          ? JSON.parse(value.visibilityRuleJson)
          : null
      } catch (err) {
        formApi.setFieldValue(
          "jsonError",
          err instanceof Error ? err.message : "Invalid JSON",
        )
        return
      }

      await onSubmit({
        key: value.key.trim(),
        parentKey: value.parentKey,
        displayType: value.displayType,
        displayLabelKey: value.displayLabelKey.trim() || null,
        signalMatchMode: value.signalMatchMode,
        signalKey:
          value.signalMatchMode === "exact" && value.signalKey.trim()
            ? value.signalKey.trim()
            : null,
        signalKeyPrefix:
          value.signalMatchMode === "prefix" && value.signalKeyPrefix.trim()
            ? value.signalKeyPrefix.trim()
            : null,
        aggregation: value.aggregation,
        dismissMode: value.dismissMode,
        dismissConfig,
        visibilityRule,
        isActive: value.isActive,
      })
    },
  })
}

export type BadgeNodeFormApi = ReturnType<typeof useBadgeNodeForm>
