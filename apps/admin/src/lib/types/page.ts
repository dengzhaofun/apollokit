/**
 * Mirror of the server-side `apps/server/src/modules/page/types.ts`
 * shape — admin uses these types for typed react-query hooks against
 * `/api/v1/page/*`. The SDK regen pipeline (packages/sdk-server-ts)
 * will eventually replace this file, but for now hand-mirroring is
 * cheaper than waiting on a regen for every PR-8 iteration.
 */

export type PageAuthMode = "anonymous" | "platform_auth" | "hmac_external";
export type PageProjectStatus = "draft" | "published" | "archived";
export type PageVersionAuthorType = "ai" | "human";
export type PageConversationRole = "user" | "assistant" | "tool";

export interface PageProject {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: PageProjectStatus;
  authMode: PageAuthMode;
  clientCredentialId: string | null;
  boundModules: string[];
  publishedVersionId: string | null;
  settings: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageProjectVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  label: string | null;
  schema: Record<string, unknown>;
  parentVersionId: string | null;
  authorType: PageVersionAuthorType;
  authorId: string | null;
  conversationMessageId: string | null;
  createdAt: string;
}

export interface PageConversationMessage {
  id: string;
  projectId: string;
  messageId: string;
  role: PageConversationRole;
  content: Record<string, unknown>;
  proposedVersionId: string | null;
  createdAt: string;
}

export interface PageTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  coverImageUrl: string | null;
  schema: Record<string, unknown>;
  requiredModules: string[];
  isOfficial: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePageProjectInput {
  slug: string;
  name: string;
  authMode: PageAuthMode;
  boundModules?: string[];
  settings?: Record<string, unknown>;
  templateId?: string;
}

export interface UpdatePageProjectInput {
  name?: string;
  status?: PageProjectStatus;
  boundModules?: string[];
  settings?: Record<string, unknown>;
}

export interface PreviewTokenResult {
  token: string;
  projectId: string;
  versionId: string;
  expiresAt: string;
}
