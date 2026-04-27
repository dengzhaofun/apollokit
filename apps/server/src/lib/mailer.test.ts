/**
 * Tests for the organization-invitation mailer.
 *
 * Two paths need verification:
 *
 *  1. **No binding** — local `wrangler dev` or CI without a
 *     Cloudflare account should fall back to a console log so the dev
 *     can still click the accept link. This is the default path in
 *     `pnpm --filter=server test`, since `cloudflare:workers` is
 *     aliased to a shim that does not expose `EMAIL`.
 *
 *  2. **Binding present** — production deploys (and `wrangler dev
 *     --remote` if onboarded) should call the Email Service
 *     `env.EMAIL.send(...)` with the rendered `{to, from, subject,
 *     text, html}` payload.
 *
 * We drive both paths by mocking `cloudflare:workers` per-test with
 * `vi.doMock` + dynamic import — `vi.mock` would hoist and lock the
 * module in whichever shape the first test needs.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

const BASE_PAYLOAD = {
  to: "invitee@example.test",
  inviterName: "Alice",
  organizationName: "Acme Inc.",
  acceptUrl: "http://localhost:3000/accept-invitation/inv-abc-123",
  role: "member",
};

describe("sendInviteEmail", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("cloudflare:workers");
  });

  test("logs the accept link when the EMAIL binding is missing", async () => {
    vi.doMock("cloudflare:workers", () => ({
      env: {
        INVITE_FROM_ADDRESS: "no-reply@test",
        ADMIN_URL: "http://localhost:3000",
        // `EMAIL` intentionally omitted — simulates plain `wrangler dev`
        // or a CI runner where no Cloudflare account is attached.
      },
    }));
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { sendInviteEmail } = await import("./mailer");
    await sendInviteEmail(BASE_PAYLOAD);

    expect(logSpy).toHaveBeenCalledTimes(1);
    // logger.info passes a structured payload `{ level, event, traceId, ... }`
    // to console.info — the prose lives in `event`.
    const payload = logSpy.mock.calls[0]![0] as { event: string };
    expect(payload.event).toContain("[mailer:dev]");
    expect(payload.event).toContain(BASE_PAYLOAD.acceptUrl);
    expect(payload.event).toContain(BASE_PAYLOAD.to);
  });

  test("calls EMAIL.send with the rendered payload when binding present", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("cloudflare:workers", () => ({
      env: {
        INVITE_FROM_ADDRESS: "invites@acme.test",
        ADMIN_URL: "http://localhost:3000",
        EMAIL: { send: sendMock },
      },
    }));

    const { sendInviteEmail } = await import("./mailer");
    await sendInviteEmail(BASE_PAYLOAD);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(arg.from).toBe("invites@acme.test");
    expect(arg.to).toBe(BASE_PAYLOAD.to);
    // Subject surfaces inviter + org so the recipient can decide in-tray
    // whether to open the mail.
    expect(arg.subject).toContain(BASE_PAYLOAD.inviterName);
    expect(arg.subject).toContain(BASE_PAYLOAD.organizationName);
    // Both text and html carry the accept link so mail clients in
    // either mode can route the user.
    expect(arg.text).toContain(BASE_PAYLOAD.acceptUrl);
    expect(arg.html).toContain(BASE_PAYLOAD.acceptUrl);
  });

  test("escapes HTML metacharacters so a hostile org name can't inject markup", async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("cloudflare:workers", () => ({
      env: {
        INVITE_FROM_ADDRESS: "invites@acme.test",
        ADMIN_URL: "http://localhost:3000",
        EMAIL: { send: sendMock },
      },
    }));

    const { sendInviteEmail } = await import("./mailer");
    await sendInviteEmail({
      ...BASE_PAYLOAD,
      organizationName: `<script>alert('x')</script>`,
    });

    const arg = sendMock.mock.calls[0]![0] as { html: string };
    expect(arg.html).not.toContain("<script>alert");
    expect(arg.html).toContain("&lt;script&gt;");
  });
});
