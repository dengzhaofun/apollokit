/**
 * Provides the active TanStack Form instance to descendants of a
 * Drawer/Page that hosts an AI assist panel.
 *
 * The form's value type varies per module, so we erase to `unknown` at
 * the Context boundary; the per-module `applyToForm` helper does a
 * typed cast at the call site (it knows its own module's shape).
 *
 * Why a Context instead of a prop: the new FormDrawerWithAssist
 * doesn't need to know which module it's hosting — the AI panel inside
 * looks up the form via this Context, and the parent that owns the
 * `useForm()` instance is the one that wraps it in <FormProvider>.
 */

import * as React from "react"

/**
 * Type-erased TanStack Form. The real `ReactFormExtendedApi` has a
 * heavily generic `setFieldValue<Field>(name, value)` that won't
 * satisfy a tight signature here, and we don't want to thread the
 * form's value type through every layer.
 *
 * `state.values` and `setFieldValue` are the only members the AI
 * panel touches; the per-module `applyToForm` helper does a typed
 * narrowing at the call site (it knows its own module's shape).
 */
export type AnyFormApi = {
  state: { values: Record<string, unknown> }
  // Loose signatures because each module's TanStack Form has its own
  // narrow `setFieldValue<Field>` shape — the per-module apply helper
  // narrows back at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFieldValue: (name: any, value: any) => void
}

const FormContext = React.createContext<AnyFormApi | null>(null)

export function FormProvider({
  form,
  children,
}: {
  form: AnyFormApi
  children: React.ReactNode
}) {
  return <FormContext.Provider value={form}>{children}</FormContext.Provider>
}

/** Returns null when no <FormProvider> is in scope (e.g. global FAB on dashboard). */
export function useFormContext(): AnyFormApi | null {
  return React.useContext(FormContext)
}
