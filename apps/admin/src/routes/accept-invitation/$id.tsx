import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

/**
 * Landing page for the `/accept-invitation/<invitationId>` link that
 * goes out in the invitation email.
 *
 * Flow:
 *  1. If the visitor isn't signed in, remember this URL in
 *     sessionStorage and send them to `/auth/sign-in`. The sign-in
 *     view reads the target back after a successful auth and bounces
 *     here.
 *  2. Once signed in, call `authClient.organization.acceptInvitation`
 *     with the id in the URL. On success, force a session refresh so
 *     the new org shows up as the active one, then land on
 *     `/dashboard`.
 *
 * The page is intentionally outside the `_dashboard` layout: new
 * users reach it before they have a session, and the dashboard layout
 * kicks anonymous users back to sign-in — which would wipe the
 * invitation context.
 */
export const Route = createFileRoute("/accept-invitation/$id")({
  head: () => seo({ title: "Accept invitation", noindex: true }),
  component: AcceptInvitationPage,
})

const REDIRECT_STORAGE_KEY = "post_login_redirect"

function AcceptInvitationPage() {
  const { id } = Route.useParams()
    const { orgSlug, projectSlug } = useTenantParams()
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "failed">(
    "idle",
  )
  // useRef guards against StrictMode double-invoke retriggering the
  // `acceptInvitation` mutation and producing a second toast.
  const kickedOff = useRef(false)

  useEffect(() => {
    if (isPending) return
    if (!session) {
      sessionStorage.setItem(
        REDIRECT_STORAGE_KEY,
        `/accept-invitation/${id}`,
      )
      toast.info(m.accept_invitation_sign_in_first())
      navigate({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
      })
      return
    }

    if (kickedOff.current) return
    kickedOff.current = true
    setStatus("processing")

    authClient.organization
      .acceptInvitation({ invitationId: id })
      .then(async (result) => {
        if (result.error) {
          setStatus("failed")
          toast.error(m.accept_invitation_failed())
          return
        }
        // Force the client's session cache to reload so the newly
        // joined organization is picked up as the active one. Without
        // this step the dashboard can render with the previous org
        // context until the next navigation.
        await authClient.getSession({
          query: { disableCookieCache: true },
        })
        setStatus("done")
        toast.success(m.accept_invitation_success())
        navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard" , params: { orgSlug, projectSlug }})
      })
      .catch(() => {
        setStatus("failed")
        toast.error(m.accept_invitation_failed())
      })
  }, [id, session, isPending, navigate, orgSlug, projectSlug])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-muted-foreground">
        {status === "failed"
          ? m.accept_invitation_failed()
          : status === "done"
            ? m.accept_invitation_success()
            : m.accept_invitation_processing()}
      </p>
    </div>
  )
}
