/**
 * Generative-UI catalog for admin-agent.
 *
 * The catalog is the **source of truth** that constrains what an LLM can
 * emit when it builds a UI tree:
 *   - Each component's `props` zod schema bounds the data the model can
 *     generate (no free-form HTML, no arbitrary attributes).
 *   - The `description` text is what the model reads to decide which
 *     component to use for a given user need.
 *   - Each `actions` entry declares an opaque action name the model can
 *     bind to a Button via the spec's `on.press = { action: "<name>" }`.
 *     Handlers are wired in the consumer's registry.
 *
 * Why this lives in a shared `@repo/admin-agent-ui` package (not in
 * `apps/admin` directly):
 *   - The **server** imports the catalog when defining tools that emit
 *     specs (so the tool's `inputSchema` can require a valid spec).
 *   - The **admin** imports the catalog AND a registry (`registry.tsx`)
 *     that maps catalog keys to React implementations.
 *   Sharing keeps the schema in one place; React-only deps (the
 *   registry) stay isolated to the admin path so the server bundle
 *   doesn't pull `react-dom`.
 *
 * Status (2026-04-30):
 *   - Scaffold only. No agent currently emits json-render specs.
 *   - When the first analytics / report / dashboard agent lands, it
 *     will define a `composeXxx` tool whose `inputSchema` is
 *     `specSchema` and the admin frontend will render that tool's
 *     output via `<AdminAgentUI spec={...} />` from the registry.
 *
 * Adding a component:
 *   1. Add an entry under `components` here with a zod props schema and
 *      a one-line description aimed at the model ("Display a single
 *      KPI value with optional delta").
 *   2. Add the matching React implementation in `registry.tsx`.
 *   3. (If the registry has new variants) update unit tests so the
 *      catalog/registry pair stays in sync.
 */

import { defineCatalog } from "@json-render/core";
import { schema as reactSchema } from "@json-render/react/schema";
import { z } from "zod";

const formatEnum = z.enum(["number", "percent", "currency"]).nullable();

export const catalog = defineCatalog(reactSchema, {
  components: {
    /* ─── Layout ─────────────────────────────────────────────── */

    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
      }),
      description:
        "A bordered container card with optional title and description; " +
        "use as the top-level container for a logical group of content.",
    },

    Section: {
      props: z.object({
        heading: z.string().nullable(),
      }),
      description:
        "A vertical block of related items inside a Card. Use to group " +
        "metrics or list items with a shared subheading.",
    },

    Heading: {
      props: z.object({
        text: z.string(),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
      description: "A standalone heading. Use sparingly; Card/Section have built-in headings.",
    },

    Paragraph: {
      props: z.object({
        text: z.string(),
      }),
      description: "Plain-text paragraph for explanatory copy.",
    },

    /* ─── Data display ────────────────────────────────────────── */

    Metric: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        format: formatEnum,
        delta: z
          .object({
            value: z.union([z.string(), z.number()]),
            direction: z.enum(["up", "down", "flat"]),
          })
          .nullable(),
      }),
      description:
        "Headline KPI tile with an optional comparison delta. Use for " +
        "dashboard-style number reporting (e.g. DAU, retention rate).",
    },

    KeyValue: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
      description:
        "A compact label-value pair for inline metadata (e.g. resource " +
        "id, last-updated timestamp). Less prominent than Metric.",
    },

    Table: {
      props: z.object({
        columns: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            format: formatEnum,
          }),
        ),
        rows: z.array(
          z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
        ),
      }),
      description:
        "Tabular data. Each row is a record keyed by `columns[*].key`. " +
        "Use for medium-sized result sets (10–50 rows); for larger sets " +
        "summarise instead.",
    },

    List: {
      props: z.object({
        ordered: z.boolean(),
        items: z.array(z.string()),
      }),
      description: "Bulleted or ordered list of short strings.",
    },

    /* ─── Actions ─────────────────────────────────────────────── */

    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "destructive"]).nullable(),
      }),
      description:
        "Clickable action button. The model binds `on.press` in the spec " +
        "to a catalog action (e.g. `on: { press: { action: 'refresh' } }`).",
    },

    Link: {
      props: z.object({
        label: z.string(),
        href: z.string(),
      }),
      description:
        "Hyperlink to a URL or in-app route. Use for navigation hints " +
        "rather than firing actions.",
    },
  },

  /**
   * Action ids the model may bind to a Button. Keep this a closed set
   * so the FE knows which actions to handle. Add a new entry here +
   * a handler in the embedding component.
   */
  actions: {
    refresh: { description: "Refresh / re-run the agent's last query" },
    export_csv: { description: "Export the visible data as CSV" },
    open_resource: { description: "Open a resource detail page" },
  },
});

/** Names of actions registered in the catalog (literal-typed for `onAction` switch). */
export type AdminAgentActionName = "refresh" | "export_csv" | "open_resource";

/** Type of the spec the model emits (and tools accept as input). */
export type AdminAgentUISpec = (typeof catalog)["_specType"];

/**
 * Zod schema for the spec — server tools whose job is to emit a UI tree
 * use this as their `inputSchema`. Cached on first access since
 * `catalog.zodSchema()` rebuilds the schema each call.
 */
let cachedSchema: ReturnType<typeof catalog.zodSchema> | null = null;
export function specSchema(): ReturnType<typeof catalog.zodSchema> {
  if (!cachedSchema) cachedSchema = catalog.zodSchema();
  return cachedSchema;
}
