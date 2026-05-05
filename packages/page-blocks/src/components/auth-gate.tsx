import * as React from "react";

/**
 * Block-level auth gate. NOT a json-render catalog component — it's a
 * wrapper used internally by `PageRenderer` when a `BlockNode.authGate`
 * is set to `"requireUser"`.
 *
 * SSR contract:
 *   - When `signedIn === true`, renders `children` (the gated block).
 *   - When `signedIn === false`, renders the supplied `fallback` (a
 *     short "please sign in" stub by default).
 *   - When `signedIn === null` (unknown — pages worker hasn't resolved
 *     player identity yet), renders a neutral placeholder; the
 *     hydrated client will re-render with the resolved value.
 *
 * The `signedIn` flag is computed at SSR time by the pages worker:
 *   - authMode=anonymous → always true (anonymous device cookie counts)
 *   - authMode=platform_auth → presence of an end-user Better Auth
 *     session cookie
 *   - authMode=hmac_external → presence of `apollo_eu_hmac` cookie
 *
 * No client-side state lives here. Hydration mismatch is impossible
 * because both server and client read the same flag from the same
 * source.
 */
export function AuthGate(props: {
  signedIn: boolean | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (props.signedIn === true) return <>{props.children}</>;
  if (props.signedIn === false) {
    return (
      <>
        {props.fallback ?? (
          <DefaultFallback />
        )}
      </>
    );
  }
  return (
    <div
      aria-busy="true"
      className="flex w-full items-center justify-center px-6 py-12 text-sm opacity-60"
      data-block="auth-gate-pending"
    >
      Loading…
    </div>
  );
}

function DefaultFallback() {
  return (
    <div
      className="flex w-full flex-col items-center gap-3 px-6 py-12 text-center"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="auth-gate-locked"
    >
      <p className="text-base font-medium">Sign in to continue</p>
      <p className="text-sm opacity-70">
        This section is only visible to signed-in players.
      </p>
      <a
        href="?auth=sign-in"
        className="rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90"
        style={{
          backgroundColor: "var(--page-primary, #ff6b35)",
          color: "var(--page-primary-fg, #ffffff)",
        }}
      >
        Sign in
      </a>
    </div>
  );
}
