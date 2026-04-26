import type { AnyFieldApi } from "@tanstack/react-form"

import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"

/**
 * Thin field wrappers around shadcn primitives + tanstack-form.
 *
 * Pair with `useForm({ validators: { onChange: zodSchema } })` from
 * `@tanstack/react-form` — zod schemas implement Standard Schema and
 * are accepted directly. Errors are pulled from `field.state.meta.errors`
 * and rendered below the input. Wire the field reference like:
 *
 *     <form.Field name="title" validators={...}>
 *       {(field) => <TextField field={field} label="Title" />}
 *     </form.Field>
 */

interface CommonProps {
  field: AnyFieldApi
  label?: string
  hint?: string
  required?: boolean
}

function FieldShell({
  label,
  hint,
  required,
  htmlFor,
  errors,
  children,
}: {
  label?: string
  hint?: string
  required?: boolean
  htmlFor: string
  errors: unknown[]
  children: React.ReactNode
}) {
  const errMsg = formatError(errors[0])
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={htmlFor} className="inline-flex items-center gap-1.5">
          {label}
          {required ? " *" : ""}
          {hint ? <FieldHint>{hint}</FieldHint> : null}
        </Label>
      ) : null}
      {children}
      {errMsg ? (
        <p className="text-sm text-destructive">{errMsg}</p>
      ) : null}
    </div>
  )
}

/**
 * Standard Schema validators (e.g. zod) hand back issue objects with a
 * `.message` field. tanstack-form may also surface plain strings from
 * legacy validators, so handle both.
 */
function formatError(err: unknown): string | null {
  if (!err) return null
  if (typeof err === "string") return err
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === "string") return msg
  }
  return null
}

export function TextField({
  field,
  label,
  hint,
  required,
  type = "text",
  placeholder,
}: CommonProps & { type?: string; placeholder?: string }) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      required={required}
      htmlFor={field.name}
      errors={field.state.meta.errors}
    >
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={(field.state.value as string | number | undefined) ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) =>
          field.handleChange(
            type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
        placeholder={placeholder}
      />
    </FieldShell>
  )
}

export function TextareaField({
  field,
  label,
  hint,
  required,
  rows = 3,
  placeholder,
}: CommonProps & { rows?: number; placeholder?: string }) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      required={required}
      htmlFor={field.name}
      errors={field.state.meta.errors}
    >
      <Textarea
        id={field.name}
        name={field.name}
        rows={rows}
        value={(field.state.value as string | undefined) ?? ""}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
      />
    </FieldShell>
  )
}
