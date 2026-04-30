/**
 * React registry that turns catalog component ids into actual React
 * implementations + binds catalog actions to runtime handlers. Lives
 * in the admin-side import path (`@repo/admin-agent-ui/registry`) so
 * the server bundle doesn't pull `react-dom`. Use the matching catalog
 * from `@repo/admin-agent-ui/catalog`.
 *
 * Styling intent: match the admin dashboard's Tailwind v4 +
 * `text-foreground` / `text-muted-foreground` / `border` / `bg-card`
 * tokens. We intentionally do **not** depend on `@json-render/shadcn`
 * for the starter components even though the package is installed —
 * when a real agent ships, that decision can be made then (use
 * shadcn's pre-built components vs. project-styled ones). Keep this
 * registry minimal; extend per agent need.
 *
 * Action wiring:
 *   The catalog declares actions (`refresh`, `export_csv`,
 *   `open_resource`). Components that need to fire one (the Button)
 *   call `emit("press")`; the model is responsible for binding
 *   `on: { press: { action: "<name>" } }` in the element spec. The
 *   registry receives the action name through json-render's action
 *   pipeline and forwards it to a parent-supplied callback via
 *   `<AdminAgentUI onAction>`.
 */

import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  type RendererProps,
} from "@json-render/react";
import * as React from "react";

import {
  catalog,
  type AdminAgentActionName,
  type AdminAgentUISpec,
} from "./catalog.js";

type AnyValue = string | number | boolean | null;

/** Cheap formatter used by Metric / KeyValue / Table cells. */
function formatValue(
  v: AnyValue | undefined,
  format: "number" | "percent" | "currency" | null | undefined,
): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (format === "percent" && typeof v === "number") {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (format === "currency" && typeof v === "number") {
    return v.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }
  if (format === "number" && typeof v === "number") {
    return v.toLocaleString();
  }
  return String(v);
}

/**
 * Module-level "current onAction" reference. defineRegistry's actions
 * are set at module-load time and are the source of truth for the
 * action dispatcher (`JSONUIProvider.handlers` does NOT route Button
 * `emit("press")` events — only the registry's actions do, in this
 * version of json-render). To carry per-instance `onAction` callbacks
 * into those static handlers we proxy through this settable ref.
 *
 * Trade-off: only one `<AdminAgentUI>` can be active at a time per
 * isolate (the last-mounted instance wins). For our admin-chat use
 * cases that's fine — we don't render multiple Renderers concurrently.
 * If we ever do, switch to a context-aware dispatcher that defineRegistry
 * doesn't currently expose, or open an issue upstream.
 */
let onActionRef: ((action: AdminAgentActionName, params: unknown) => void) | null = null;

const registryDef = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => (
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        {props.title || props.description ? (
          <div className="flex flex-col space-y-1 p-4 pb-2">
            {props.title ? (
              <h3 className="text-sm font-semibold leading-none">{props.title}</h3>
            ) : null}
            {props.description ? (
              <p className="text-xs text-muted-foreground">{props.description}</p>
            ) : null}
          </div>
        ) : null}
        <div className="p-4 pt-2">{children}</div>
      </div>
    ),

    Section: ({ props, children }) => (
      <section className="space-y-1">
        {props.heading ? (
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {props.heading}
          </h4>
        ) : null}
        <div className="space-y-1">{children}</div>
      </section>
    ),

    Heading: ({ props }) => {
      const Tag = (`h${props.level}`) as "h1" | "h2" | "h3";
      const sz =
        props.level === 1
          ? "text-xl font-semibold"
          : props.level === 2
            ? "text-lg font-semibold"
            : "text-base font-medium";
      return <Tag className={sz}>{props.text}</Tag>;
    },

    Paragraph: ({ props }) => (
      <p className="text-sm text-foreground leading-relaxed">{props.text}</p>
    ),

    Metric: ({ props }) => {
      const arrow =
        props.delta?.direction === "up"
          ? "↑"
          : props.delta?.direction === "down"
            ? "↓"
            : "·";
      const deltaColor =
        props.delta?.direction === "up"
          ? "text-emerald-600 dark:text-emerald-400"
          : props.delta?.direction === "down"
            ? "text-rose-600 dark:text-rose-400"
            : "text-muted-foreground";
      return (
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{props.label}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {formatValue(props.value as AnyValue, props.format)}
          </span>
          {props.delta ? (
            <span className={`text-xs tabular-nums ${deltaColor}`}>
              {arrow} {formatValue(props.delta.value as AnyValue, null)}
            </span>
          ) : null}
        </div>
      );
    },

    KeyValue: ({ props }) => (
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-muted-foreground">{props.label}</span>
        <span className="font-mono text-foreground">
          {formatValue(props.value as AnyValue, null)}
        </span>
      </div>
    ),

    Table: ({ props }) => (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              {props.columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-b-0">
                {props.columns.map((c) => (
                  <td key={c.key} className="px-2 py-1 tabular-nums">
                    {formatValue(row[c.key] as AnyValue | undefined, c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),

    List: ({ props }) => {
      const Tag = props.ordered ? "ol" : "ul";
      const cls = props.ordered ? "list-decimal" : "list-disc";
      return (
        <Tag className={`${cls} pl-5 text-sm space-y-1`}>
          {props.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </Tag>
      );
    },

    Button: ({ props, emit }) => {
      const variant = props.variant ?? "primary";
      const cls =
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : variant === "destructive"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "border bg-background text-foreground hover:bg-accent";
      return (
        <button
          type="button"
          onClick={() => emit("press")}
          className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${cls}`}
        >
          {props.label}
        </button>
      );
    },

    Link: ({ props }) => (
      <a
        href={props.href}
        className="text-sm text-primary underline underline-offset-2 hover:no-underline"
      >
        {props.label}
      </a>
    ),
  },

  // defineRegistry's actions are the live dispatch handlers — they
  // forward to the host's `onAction` via the module-level ref. Action
  // signature is `(params, setState, state) => Promise<void>`; we
  // ignore setState/state because this scaffold doesn't own state.
  actions: {
    refresh: async (params) => {
      onActionRef?.("refresh", params);
    },
    export_csv: async (params) => {
      onActionRef?.("export_csv", params);
    },
    open_resource: async (params) => {
      onActionRef?.("open_resource", params);
    },
  },
});

export const registry = registryDef.registry;

/**
 * Convenience wrapper: renders an arbitrary spec from the project
 * registry. Most callers should use this instead of importing
 * `<Renderer>` + `registry` separately. `onAction` is invoked with the
 * action name and any params the spec bound when the user clicks a
 * Button bound to that action.
 *
 * Why this exists despite `<Renderer>` already being a thin wrapper:
 *   the action plumbing (catalog actions ↔ host callback) lives here,
 *   so callers don't have to remember to wire the `onActionRef`
 *   themselves.
 */
export function AdminAgentUI({
  spec,
  onAction,
  loading,
}: {
  /**
   * The spec from `specSchema().parse(...)` (or directly typed as
   * `AdminAgentUISpec`). `null` is accepted so callers can render
   * during streaming/loading without conditional-renders.
   *
   * The runtime cast to `RendererProps["spec"]` is safe: the inferred
   * `AdminAgentUISpec` is structurally a superset (stricter `visible`
   * types) that satisfies json-render's loose `Spec` shape at runtime.
   */
  spec: AdminAgentUISpec | null;
  onAction?: (action: AdminAgentActionName, params: unknown) => void;
  loading?: boolean;
}) {
  // Refresh the module-level ref each render so the latest closure
  // wins. Cleared on unmount so a stale callback can't fire if a
  // dispatch races with teardown.
  React.useEffect(() => {
    onActionRef = onAction
      ? (action, payload) => onAction(action, payload)
      : null;
    return () => {
      onActionRef = null;
    };
  }, [onAction]);

  // Per-render handlers map: JSONUIProvider's `handlers` prop accepts
  // `(params) => Promise<unknown>` shaped functions. We provide both
  // (a) the live closure on this prop AND (b) the registered actions
  // in `defineRegistry` (those forward to `onActionRef`). Either path
  // works depending on json-render's internal dispatch resolution.
  const handlers = React.useMemo(() => {
    const map: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
    const names: AdminAgentActionName[] = ["refresh", "export_csv", "open_resource"];
    for (const name of names) {
      map[name] = async (params) => {
        onAction?.(name, params);
      };
    }
    return map;
  }, [onAction]);

  return (
    <JSONUIProvider registry={registry} handlers={handlers}>
      <Renderer
        spec={spec as RendererProps["spec"]}
        registry={registry}
        loading={loading}
      />
    </JSONUIProvider>
  );
}

// Re-export Renderer so callers that need the lower-level API can grab
// it from this package without importing `@json-render/react` directly.
export { Renderer };
