/**
 * 404 stub shown when the request URL doesn't resolve to a published
 * page. We deliberately keep this minimal — operators don't customise
 * their 404, and over-styling encourages typo-bait branding.
 */
export function NotFoundStub(props: {
  reason: "unknown_host" | "unknown_slug" | "unknown_page";
  slug: string | null;
  pathname: string;
}) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-zinc-100"
      data-not-found-reason={props.reason}
    >
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-zinc-400">
        {props.reason === "unknown_host"
          ? "This host isn't a recognised pages.apollokit.dev subdomain."
          : props.reason === "unknown_slug"
            ? `No published page project at "${props.slug ?? ""}".`
            : `"${props.pathname}" doesn't match any page in this project.`}
      </p>
    </main>
  );
}
