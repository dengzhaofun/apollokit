import { z } from "zod";

export const authFormPropsSchema = z.object({
  // Title / subtitle override the default "Sign in / Sign up" copy.
  title: z.string().max(120).optional(),
  subtitle: z.string().max(300).optional(),
  // Default mode shown on first paint. Form has both forms toggleable.
  defaultMode: z.enum(["sign-in", "sign-up"]).optional().default("sign-in"),
  // Whether to surface a "send magic link" alternative submit. The
  // pages worker wires the actual end-user-auth call; this block is
  // declarative — it just renders the form.
  enableMagicLink: z.boolean().optional().default(true),
  // Where to send the user after a successful auth. Relative path
  // within the same project, or absolute https URL.
  redirectAfter: z.string().max(2048).optional(),
});

export type AuthFormProps = z.infer<typeof authFormPropsSchema>;

/**
 * End-user authentication form. Posts to the pages worker's
 * `/api/auth/...` proxy which forwards to the server's
 * `/api/v1/client/auth/*` Better Auth instance. The cookie domain
 * (`.pages.apollokit.dev`) is set by the server; this block just
 * collects credentials.
 *
 * Fully SSR-safe: form submission is a regular HTML form POST to
 * `/api/auth/sign-in/email` (or `/sign-up/email`); JS hydration only
 * adds optimistic UX (mode toggle, magic-link alt button).
 *
 * @see plan §3.1 — cross-subdomain cookie config
 */
export function AuthForm(props: AuthFormProps) {
  const mode = props.defaultMode ?? "sign-in";
  const isSignUp = mode === "sign-up";
  const action = isSignUp
    ? "/api/auth/sign-up/email"
    : "/api/auth/sign-in/email";

  return (
    <section
      className="flex w-full flex-col items-center px-6 py-12"
      style={{
        backgroundColor: "var(--page-bg, #0b0b10)",
        color: "var(--page-fg, #ffffff)",
      }}
      data-block="auth-form"
      data-mode={mode}
    >
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur">
        <header className="flex flex-col gap-1 text-center">
          <h2 className="text-2xl font-bold">
            {props.title ?? (isSignUp ? "Create account" : "Sign in")}
          </h2>
          {props.subtitle ? (
            <p className="text-sm opacity-70">{props.subtitle}</p>
          ) : null}
        </header>

        <form
          method="post"
          action={action}
          className="flex flex-col gap-3"
          data-form="auth-credentials"
        >
          {isSignUp ? (
            <input
              type="text"
              name="name"
              placeholder="Display name"
              autoComplete="name"
              required
              className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm placeholder-white/40 focus:border-white/40 focus:outline-none"
            />
          ) : null}
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={8}
            className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm placeholder-white/40 focus:border-white/40 focus:outline-none"
          />
          {props.redirectAfter ? (
            <input
              type="hidden"
              name="callbackURL"
              value={props.redirectAfter}
            />
          ) : null}
          <button
            type="submit"
            className="mt-1 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90"
            style={{
              backgroundColor: "var(--page-primary, #ff6b35)",
              color: "var(--page-primary-fg, #ffffff)",
            }}
          >
            {isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        {props.enableMagicLink !== false ? (
          <form
            method="post"
            action="/api/auth/sign-in/magic-link"
            className="flex flex-col gap-2"
            data-form="auth-magic-link"
          >
            <button
              type="submit"
              className="rounded-md border border-white/15 px-4 py-2 text-xs font-medium opacity-80 hover:opacity-100"
            >
              Or email me a magic link
            </button>
          </form>
        ) : null}

        <div className="text-center text-xs opacity-70">
          {isSignUp ? (
            <span>
              Have an account?{" "}
              <a href="?auth=sign-in" className="underline">
                Sign in
              </a>
            </span>
          ) : (
            <span>
              New here?{" "}
              <a href="?auth=sign-up" className="underline">
                Create one
              </a>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
