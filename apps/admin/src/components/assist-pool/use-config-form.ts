import { useForm } from "@tanstack/react-form"

import type {
  AssistContributionPolicy,
  AssistPoolMode,
  CreateAssistPoolConfigInput,
} from "#/lib/types/assist-pool"

type PolicyKind = AssistContributionPolicy["kind"]

export type AssistPoolFormValues = {
  name: string
  alias: string
  description: string
  mode: AssistPoolMode
  targetAmount: number
  policyKind: PolicyKind
  fixedAmount: number
  uniformMin: number
  uniformMax: number
  decayBase: number
  decayTailRatio: number
  decayTailFloor: number
  perAssisterLimit: number
  initiatorCanAssist: boolean
  expiresInSeconds: number
  isActive: boolean
}

/**
 * activityId is held externally (passed back into onSubmit's payload),
 * so the AI's apply tool doesn't need to know about it. Keeping it out
 * of `defaultValues` matches the original component's behavior.
 */
export function useAssistPoolForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateAssistPoolConfigInput>
  onSubmit: (values: CreateAssistPoolConfigInput) => void | Promise<void>
}) {
  const initialPolicy =
    defaultValues?.contributionPolicy ??
    ({ kind: "fixed", amount: 20 } as AssistContributionPolicy)
  const activityId = defaultValues?.activityId ?? null

  return useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      mode: (defaultValues?.mode ?? "decrement") as AssistPoolMode,
      targetAmount: defaultValues?.targetAmount ?? 100,
      policyKind: initialPolicy.kind as PolicyKind,
      fixedAmount: initialPolicy.kind === "fixed" ? initialPolicy.amount : 20,
      uniformMin: initialPolicy.kind === "uniform" ? initialPolicy.min : 5,
      uniformMax: initialPolicy.kind === "uniform" ? initialPolicy.max : 30,
      decayBase: initialPolicy.kind === "decaying" ? initialPolicy.base : 30,
      decayTailRatio:
        initialPolicy.kind === "decaying" ? initialPolicy.tailRatio : 0.1,
      decayTailFloor:
        initialPolicy.kind === "decaying" ? initialPolicy.tailFloor : 1,
      perAssisterLimit: defaultValues?.perAssisterLimit ?? 1,
      initiatorCanAssist: defaultValues?.initiatorCanAssist ?? false,
      expiresInSeconds: defaultValues?.expiresInSeconds ?? 86400,
      isActive: defaultValues?.isActive ?? true,
    } as AssistPoolFormValues,
    onSubmit: async ({ value }) => {
      let policy: AssistContributionPolicy
      if (value.policyKind === "fixed") {
        policy = { kind: "fixed", amount: value.fixedAmount }
      } else if (value.policyKind === "uniform") {
        policy = { kind: "uniform", min: value.uniformMin, max: value.uniformMax }
      } else {
        policy = {
          kind: "decaying",
          base: value.decayBase,
          tailRatio: value.decayTailRatio,
          tailFloor: value.decayTailFloor,
        }
      }
      await onSubmit({
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        mode: value.mode,
        targetAmount: value.targetAmount,
        contributionPolicy: policy,
        perAssisterLimit: value.perAssisterLimit,
        initiatorCanAssist: value.initiatorCanAssist,
        expiresInSeconds: value.expiresInSeconds,
        isActive: value.isActive,
        activityId,
      })
    },
  })
}

export type AssistPoolFormApi = ReturnType<typeof useAssistPoolForm>
