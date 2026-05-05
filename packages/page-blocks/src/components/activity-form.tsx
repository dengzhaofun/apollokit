import { z } from "zod";

const activityFieldShape = z.object({
  id: z.string().min(1).max(64),
  /** Field type — drives input rendering. */
  type: z.enum(["text", "textarea", "email", "select", "checkbox"]),
  label: z.string().min(1).max(120),
  placeholder: z.string().max(120).optional(),
  helperText: z.string().max(200).optional(),
  required: z.boolean().optional(),
  /** Used when `type === "select"`. */
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .max(20)
    .optional(),
  maxLength: z.number().int().min(1).max(2048).optional(),
});

export const activityFormPropsSchema = z.object({
  heading: z.string().max(120).optional(),
  intro: z.string().max(400).optional(),
  /** Field schema. AI sets this; runtime renders inputs in order. */
  fields: z.array(activityFieldShape).min(1).max(20),
  ctaLabel: z.string().max(60).optional(),
  successMessage: z.string().max(300).optional(),
});

export type ActivityFormProps = z.infer<typeof activityFormPropsSchema>;
export type ActivityFormField = z.infer<typeof activityFieldShape>;

/**
 * Operator-defined form (entry / questionnaire / sweepstakes signup).
 *
 * Posts to the page client form endpoint which writes to
 * `page_form_submissions`. The pages worker injects the projectId /
 * pageId / blockId triple into hidden inputs at SSR time so the server
 * can attribute the submission without trusting client routing.
 *
 * Pure HTML form — no JS required. Server's reply substitutes the
 * page on submit; on success operators can render a follow-up page.
 */
export function ActivityForm(
  props: ActivityFormProps & {
    initialData?: {
      projectId: string;
      pageId: string;
      blockId: string;
    };
  },
) {
  const ctaLabel = props.ctaLabel ?? "Submit";

  return (
    <section
      className="w-full px-6 py-10"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="activity-form"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        {props.heading ? (
          <h2 className="text-2xl font-bold tracking-tight text-center">
            {props.heading}
          </h2>
        ) : null}
        {props.intro ? (
          <p className="text-sm opacity-75 text-center">{props.intro}</p>
        ) : null}
        <form
          method="post"
          action="/api/v1/client/page/forms"
          className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-5"
          data-form="activity-form"
        >
          {props.initialData ? (
            <>
              <input
                type="hidden"
                name="projectId"
                value={props.initialData.projectId}
              />
              <input
                type="hidden"
                name="pageId"
                value={props.initialData.pageId}
              />
              <input
                type="hidden"
                name="blockId"
                value={props.initialData.blockId}
              />
            </>
          ) : null}

          {props.fields.map((field) => (
            <ActivityFieldInput key={field.id} field={field} />
          ))}

          <button
            type="submit"
            className="rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-90"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {ctaLabel}
          </button>
        </form>
        {props.successMessage ? (
          <p className="text-xs opacity-60 text-center">
            {props.successMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ActivityFieldInput({ field }: { field: ActivityFormField }) {
  const labelEl = (
    <label
      htmlFor={`field-${field.id}`}
      className="flex flex-col gap-1 text-xs font-medium"
    >
      <span>
        {field.label}
        {field.required ? (
          <span className="ml-1 text-red-400">*</span>
        ) : null}
      </span>
      {field.helperText ? (
        <span className="text-[11px] font-normal opacity-60">
          {field.helperText}
        </span>
      ) : null}
    </label>
  );

  const baseInputClass =
    "rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm placeholder-white/40 focus:border-white/40 focus:outline-none";

  if (field.type === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <textarea
          id={`field-${field.id}`}
          name={`payload.${field.id}`}
          placeholder={field.placeholder}
          required={field.required}
          maxLength={field.maxLength}
          rows={4}
          className={baseInputClass}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <select
          id={`field-${field.id}`}
          name={`payload.${field.id}`}
          required={field.required}
          defaultValue=""
          className={baseInputClass}
        >
          <option value="" disabled>
            {field.placeholder ?? "Choose…"}
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-start gap-2 text-xs">
        <input
          id={`field-${field.id}`}
          type="checkbox"
          name={`payload.${field.id}`}
          required={field.required}
          className="mt-0.5"
        />
        <label htmlFor={`field-${field.id}`} className="leading-snug">
          {field.label}
          {field.required ? (
            <span className="ml-1 text-red-400">*</span>
          ) : null}
          {field.helperText ? (
            <span className="block text-[11px] opacity-60">
              {field.helperText}
            </span>
          ) : null}
        </label>
      </div>
    );
  }

  // text / email
  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      <input
        id={`field-${field.id}`}
        type={field.type === "email" ? "email" : "text"}
        name={`payload.${field.id}`}
        placeholder={field.placeholder}
        required={field.required}
        maxLength={field.maxLength}
        className={baseInputClass}
      />
    </div>
  );
}
