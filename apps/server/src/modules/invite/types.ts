import type {
  inviteCodes,
  inviteRelationships,
  inviteSettings,
} from "../../schema/invite";

export type InviteSettingsRow = typeof inviteSettings.$inferSelect;
export type InviteCodeRow = typeof inviteCodes.$inferSelect;
export type InviteRelationshipRow = typeof inviteRelationships.$inferSelect;

/** 租户 settings 的有效值（service 层 getSettingsOrDefaults 返回的形状）。*/
export type ResolvedInviteSettings = {
  enabled: boolean;
  codeLength: number;
  allowSelfInvite: boolean;
};

/** getSummary / adminGetUserStats 的返回形状。*/
export type InviteSummary = {
  myCode: string;
  myCodeRotatedAt: Date | null;
  boundCount: number;
  qualifiedCount: number;
  invitedBy: {
    inviterEndUserId: string;
    boundAt: Date;
    qualifiedAt: Date | null;
  } | null;
};
