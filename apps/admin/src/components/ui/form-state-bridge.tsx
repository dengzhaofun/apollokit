import { useEffect } from "react"

export interface FormBridgeState {
  canSubmit: boolean
  isDirty: boolean
  isSubmitting: boolean
}

/**
 * Drop-in child for a TanStack Form's `<form.Subscribe>` block. Forwards the
 * subscribed state outward via a callback so a parent FormDialog/FormDrawer
 * can drive its `isDirty` gate and external submit button.
 *
 * Usage inside a form component:
 *
 *   <form.Subscribe
 *     selector={(s) => ({
 *       canSubmit: s.canSubmit,
 *       isDirty: s.isDirty,
 *       isSubmitting: s.isSubmitting,
 *     })}
 *   >
 *     {(state) => <FormStateBridge state={state} onChange={onStateChange} />}
 *   </form.Subscribe>
 */
export function FormStateBridge({
  state: { canSubmit, isDirty, isSubmitting },
  onChange,
}: {
  state: FormBridgeState
  onChange: (state: FormBridgeState) => void
}) {
  useEffect(() => {
    onChange({ canSubmit, isDirty, isSubmitting })
  }, [canSubmit, isDirty, isSubmitting, onChange])
  return null
}
