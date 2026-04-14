export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class MailMessageNotFound extends ModuleError {
  constructor(id: string) {
    super("mail.message_not_found", 404, `mail message not found: ${id}`);
    this.name = "MailMessageNotFound";
  }
}

export class MailExpired extends ModuleError {
  constructor(id: string) {
    super("mail.expired", 409, `mail message has expired: ${id}`);
    this.name = "MailExpired";
  }
}

export class MailRevoked extends ModuleError {
  constructor(id: string) {
    super("mail.revoked", 409, `mail message has been revoked: ${id}`);
    this.name = "MailRevoked";
  }
}

export class MailNotTargeted extends ModuleError {
  constructor(id: string) {
    super(
      "mail.not_targeted",
      403,
      `end user is not a recipient of mail message: ${id}`,
    );
    this.name = "MailNotTargeted";
  }
}

export class MailAlreadyClaimed extends ModuleError {
  constructor(id: string) {
    super("mail.already_claimed", 409, `mail reward already claimed: ${id}`);
    this.name = "MailAlreadyClaimed";
  }
}

export class MailMustReadFirst extends ModuleError {
  constructor(id: string) {
    super(
      "mail.must_read_first",
      409,
      `mail must be read before claiming: ${id}`,
    );
    this.name = "MailMustReadFirst";
  }
}

export class MailInvalidTarget extends ModuleError {
  constructor(reason: string) {
    super("mail.invalid_target", 400, `invalid mail targeting: ${reason}`);
    this.name = "MailInvalidTarget";
  }
}

export class MailMulticastTooLarge extends ModuleError {
  constructor(size: number, max: number) {
    super(
      "mail.multicast_too_large",
      400,
      `multicast target list length ${size} exceeds max ${max}`,
    );
    this.name = "MailMulticastTooLarge";
  }
}

export class MailInvalidOrigin extends ModuleError {
  constructor(reason: string) {
    super("mail.invalid_origin", 400, `invalid programmatic origin: ${reason}`);
    this.name = "MailInvalidOrigin";
  }
}
