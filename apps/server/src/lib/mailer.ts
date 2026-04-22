/**
 * Mail sending — thin wrapper over the Cloudflare Email Service
 * `send_email` binding with a development fallback.
 *
 * Why this file exists:
 *   Better Auth's organization plugin invokes `sendInvitationEmail` when
 *   someone calls `POST /api/auth/organization/invite-member`. Without a
 *   real mailer the invitation row lands in the DB but nobody receives
 *   the accept link. This module is what the hook calls.
 *
 * Why it doesn't go through AppDeps:
 *   The Better Auth instance is assembled at module load time in
 *   `src/auth.ts` — earlier than the `deps` singleton is constructed,
 *   and against the `cloudflare:workers` `env` directly. Threading
 *   mailer through AppDeps would mean a circular bootstrap. For a
 *   single-purpose platform utility (not a business service) a flat
 *   import is simpler and type-safer.
 *
 * Dev fallback:
 *   When the `EMAIL` binding isn't attached — typically local `wrangler
 *   dev` without `remote: true`, or a CI environment with no Cloudflare
 *   account — we log the accept link to the console instead of failing
 *   the invite. Operators can copy/paste the link manually while
 *   running off-Cloudflare. Production deployments that onboard a
 *   domain via the Email Service dashboard will have `env.EMAIL`
 *   populated by the `send_email` binding in `wrangler.jsonc`.
 */

import { env } from "cloudflare:workers";

export type InviteEmailPayload = {
  to: string;
  inviterName: string;
  organizationName: string;
  acceptUrl: string;
  role: string;
};

/**
 * Build the invitation email body. Kept simple on purpose — no
 * template engine, no branding assets, no CSS-in-JS. The HTML is
 * minimal-but-valid so major mail clients render it consistently.
 */
function renderInviteEmail(p: InviteEmailPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `${p.inviterName} invited you to ${p.organizationName}`;
  const text =
    `${p.inviterName} invited you to join ${p.organizationName} on apollokit ` +
    `as ${p.role}.\n\n` +
    `Accept the invitation:\n${p.acceptUrl}\n\n` +
    `If you weren't expecting this, you can safely ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; line-height: 1.5;">
  <p>${escapeHtml(p.inviterName)} invited you to join
    <strong>${escapeHtml(p.organizationName)}</strong> on apollokit
    as <strong>${escapeHtml(p.role)}</strong>.</p>
  <p>
    <a href="${encodeURI(p.acceptUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;">
      Accept invitation
    </a>
  </p>
  <p style="color:#666;font-size:13px;">Or copy this link:<br/>
    <code>${escapeHtml(p.acceptUrl)}</code></p>
  <p style="color:#999;font-size:12px;">If you weren't expecting this, you can safely ignore this email.</p>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send an organization invitation. On platforms where the `EMAIL`
 * binding isn't attached, logs the accept link so developers can still
 * test the accept flow end-to-end.
 */
export async function sendInviteEmail(p: InviteEmailPayload): Promise<void> {
  const mail = renderInviteEmail(p);

  // `env.EMAIL` is typed as `SendEmail` once the `send_email` binding
  // is declared in wrangler.jsonc (see `worker-configuration.d.ts`).
  // We still defend against `undefined` at runtime: CI and ad-hoc
  // scripts can import this module without the binding wired up.
  const binding = (env as { EMAIL?: typeof env.EMAIL | undefined }).EMAIL;
  if (!binding) {
    console.log(
      `[mailer:dev] Invitation for ${p.to} → ${p.acceptUrl} (role=${p.role}, org=${p.organizationName})`,
    );
    return;
  }

  await binding.send({
    from: env.INVITE_FROM_ADDRESS,
    to: p.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
