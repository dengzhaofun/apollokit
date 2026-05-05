/**
 * Runtime APIPage component for fumadocs-generated MDX pages.
 *
 * The codegen script writes `<APIPage document="apollokit" operations={…} />`
 * into MDX. The default `createAPIPage` from `fumadocs-openapi/ui` is an
 * **async React Server Component** intended for Next.js RSC — TanStack
 * Start has no RSC, so the async signature crashes hydration with
 * "is an async Client Component".
 *
 * Workaround: use `createClientAPIPage` (designed for non-RSC), and wrap
 * it so the MDX-side `document` string is resolved to the bundled
 * payload at render time. The bundled snapshot is imported directly so
 * it ships in the JS bundle — no runtime fetch, no fs.
 */

import type { ComponentType } from "react";
import { defaultShikiFactory } from "fumadocs-core/highlight/shiki/full";
import {
  createClientAPIPage,
  type ClientApiPageProps,
} from "fumadocs-openapi/ui/create-client";
import type { OperationItem, WebhookItem } from "fumadocs-openapi/ui";

import rawSchema from "../../../server/openapi.json";

export const SCHEMA_KEY = "apollokit";

// The server's OpenAPI spec uses /api/v1/... paths, but the generated MDX
// files reference /api/... (without /v1). Strip the /v1 prefix so lookups match.
const schema = {
  ...rawSchema,
  paths: Object.fromEntries(
    Object.entries(rawSchema.paths ?? {}).map(([path, value]) => [
      path.replace(/^\/api\/v1\//, "/api/"),
      value,
    ]),
  ),
};

// fumadocs-core v15+ replaced the zero-arg `createShikiFactory()` with a
// config-taking variant. We use the pre-built `defaultShikiFactory` (JS
// regex engine, lazy-imports shiki on first render) — matches how SSR
// samples on fumadocs.dev wire it.
const ClientAPIPage = createClientAPIPage({
  shiki: defaultShikiFactory,
}) as ComponentType<ClientApiPageProps>;

interface APIPageProps {
  document: string;
  showTitle?: boolean;
  showDescription?: boolean;
  operations?: OperationItem[];
  webhooks?: WebhookItem[];
}

/**
 * Drop-in replacement for the default `<APIPage>` MDX component. Looks
 * the `document` key up in our single-spec registry and forwards a
 * pre-bundled payload to the client-side renderer.
 */
export function APIPage(props: APIPageProps) {
  if (props.document !== SCHEMA_KEY) {
    throw new Error(
      `Unknown OpenAPI document "${props.document}" — expected "${SCHEMA_KEY}".`,
    );
  }
  return (
    <ClientAPIPage
      {...props}
      payload={{ bundled: schema as never }}
    />
  );
}
