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
 *   The same applies to `sendVerificationEmail` (called on sign-up when
 *   `requireEmailVerification: true`) and `sendResetPassword` (called
 *   when a user hits "forgot password").
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
import { logger } from "./logger";

export type InviteEmailPayload = {
  to: string;
  inviterName: string;
  organizationName: string;
  acceptUrl: string;
  role: string;
};

export type VerifyEmailPayload = {
  to: string;
  name: string;
  verifyUrl: string;
};

export type ResetPasswordEmailPayload = {
  to: string;
  name: string;
  resetUrl: string;
};

type RenderedEmail = { subject: string; text: string; html: string };

/**
 * Build the invitation email body. Kept simple on purpose — no
 * template engine, no branding assets, no CSS-in-JS. The HTML is
 * minimal-but-valid so major mail clients render it consistently.
 */
function renderInviteEmail(p: InviteEmailPayload): RenderedEmail {
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

function renderVerifyEmail(p: VerifyEmailPayload): RenderedEmail {
  const subject = `Verify your apollokit email`;
  const text =
    `Hi ${p.name || "there"},\n\n` +
    `Confirm your email to finish setting up your apollokit account.\n\n` +
    `Verify here:\n${p.verifyUrl}\n\n` +
    `If you didn't sign up for apollokit, you can safely ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; line-height: 1.5;">
  <p>Hi ${escapeHtml(p.name || "there")},</p>
  <p>Confirm your email to finish setting up your apollokit account.</p>
  <p>
    <a href="${encodeURI(p.verifyUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;">
      Verify email
    </a>
  </p>
  <p style="color:#666;font-size:13px;">Or copy this link:<br/>
    <code>${escapeHtml(p.verifyUrl)}</code></p>
  <p style="color:#999;font-size:12px;">If you didn't sign up for apollokit, you can safely ignore this email.</p>
</body></html>`;
  return { subject, text, html };
}

function renderResetPasswordEmail(p: ResetPasswordEmailPayload): RenderedEmail {
  const subject = `Reset your apollokit password`;
  const text =
    `Hi ${p.name || "there"},\n\n` +
    `Click the link below to choose a new apollokit password. The link expires in 1 hour.\n\n` +
    `${p.resetUrl}\n\n` +
    `If you didn't ask to reset your password, you can ignore this email — your password will stay the same.`;
  const html = `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; line-height: 1.5;">
  <p>Hi ${escapeHtml(p.name || "there")},</p>
  <p>Click the button below to choose a new apollokit password. The link expires in 1 hour.</p>
  <p>
    <a href="${encodeURI(p.resetUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;">
      Reset password
    </a>
  </p>
  <p style="color:#666;font-size:13px;">Or copy this link:<br/>
    <code>${escapeHtml(p.resetUrl)}</code></p>
  <p style="color:#999;font-size:12px;">If you didn't ask to reset your password, you can ignore this email — your password will stay the same.</p>
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

async function deliver(
  to: string,
  mail: RenderedEmail,
  devLogPrefix: string,
): Promise<void> {
  const binding = (env as { EMAIL?: typeof env.EMAIL | undefined }).EMAIL;
  if (!binding) {
    logger.info(devLogPrefix);
    return;
  }
  await binding.send({
    from: env.INVITE_FROM_ADDRESS,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

/**
 * Send an organization invitation. On platforms where the `EMAIL`
 * binding isn't attached, logs the accept link so developers can still
 * test the accept flow end-to-end.
 */
export async function sendInviteEmail(p: InviteEmailPayload): Promise<void> {
  await deliver(
    p.to,
    renderInviteEmail(p),
    `[mailer:dev] Invitation for ${p.to} → ${p.acceptUrl} (role=${p.role}, org=${p.organizationName})`,
  );
}

/**
 * Send the email-verification link issued by Better Auth's
 * `emailVerification.sendVerificationEmail` hook. Triggered on sign-up
 * (when `requireEmailVerification: true`) and on resend.
 */
export async function sendVerifyEmail(p: VerifyEmailPayload): Promise<void> {
  await deliver(
    p.to,
    renderVerifyEmail(p),
    `[mailer:dev] Verify-email for ${p.to} → ${p.verifyUrl}`,
  );
}

/**
 * Send the password-reset link issued by Better Auth's
 * `emailAndPassword.sendResetPassword` hook. Triggered when the user
 * hits "forgot password".
 */
export async function sendPasswordResetEmail(
  p: ResetPasswordEmailPayload,
): Promise<void> {
  await deliver(
    p.to,
    renderResetPasswordEmail(p),
    `[mailer:dev] Password-reset for ${p.to} → ${p.resetUrl}`,
  );
}
