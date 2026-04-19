# 邀请系统 实施计划 (Invite System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/server` 新增 `invite` 模块，支持推广拉新（referral）场景：老玩家拿邀请码、客户方游戏服务器调 `/bind` 落关系、调 `/qualify` 触发阶梯奖励事件。

**Architecture:** 单向 pub/sub——invite 只发 `invite.bound` / `invite.qualified` 两个事件到 event-bus；`task` 模块已有 forwarder 自动订阅并驱动奖励。invite 不 import task。所有写路径走 Neon HTTP 驱动的"单句原子写（`INSERT … ON CONFLICT …`）"模式——项目没有 transaction。

**Tech Stack:** Hono + @hono/zod-openapi · Drizzle ORM + Neon Postgres (HTTP) · Better Auth (admin session) · client-credentials (C-end API key + HMAC / server secret) · Vitest（真 Neon dev branch，不 mock）

**Design Spec:** [docs/superpowers/specs/2026-04-19-invite-system-design.md](../specs/2026-04-19-invite-system-design.md) — 本 plan 以它为真理；遇到歧义以 spec 为准。

---

## 文件结构一览

```
apps/server/src/
├── schema/
│   ├── invite.ts                 (create)  3 张表 + 约束 + 索引
│   └── index.ts                  (modify)  re-export invite 表
├── lib/
│   ├── crypto.ts                 (modify)  加 constantTimeEqual
│   └── crypto.test.ts            (modify)  测新函数
├── modules/
│   ├── client-credentials/
│   │   ├── errors.ts             (modify)  加 InvalidSecret
│   │   ├── service.ts            (modify)  加 verifyServerRequest
│   │   └── service.test.ts       (modify)  测 verifyServerRequest
│   └── invite/                   (create dir)
│       ├── code.ts               (create)  邀请码 32 字符字母表生成器
│       ├── code.test.ts          (create)
│       ├── types.ts              (create)
│       ├── errors.ts             (create)
│       ├── validators.ts         (create)  Zod + OpenAPI schema
│       ├── service.ts            (create)  业务逻辑
│       ├── service.test.ts       (create)
│       ├── routes.ts             (create)  admin router
│       ├── routes.test.ts        (create)
│       ├── client-routes.ts      (create)  client router (HMAC + server 混合)
│       ├── client-routes.test.ts (create)
│       └── index.ts              (create)  barrel + singleton + registerEvent
└── index.ts                      (modify)  mount /api/invite 和 /api/invite/client
```

---

## 任务依赖图

```
Task 1 (code.ts 工具)    Task 2 (schema+migration)    Task 3 (errors/types/validators)
        │                         │                              │
        └───────┬─────────────────┴──────────────────┬───────────┘
                │                                    │
           Task 4 (client-credentials 扩展)     Task 5 (service: settings)
                │                                    │
                └────────────────────────────────────┼──► Task 6 (service: codes)
                                                     │         │
                                                     │    Task 7 (service: bind)
                                                     │         │
                                                     │    Task 8 (service: qualify)
                                                     │         │
                                                     └───► Task 9 (service: 查询方法)
                                                               │
                                                     Task 10 (admin routes)
                                                               │
                                                     Task 11 (client routes)
                                                               │
                                                     Task 12 (barrel + mount)
```

---

## Task 1: 邀请码生成器（纯函数，TDD）

**Files:**
- Create: `apps/server/src/modules/invite/code.ts`
- Test: `apps/server/src/modules/invite/code.test.ts`

- [ ] **Step 1.1: 新建目录**

```bash
mkdir -p apps/server/src/modules/invite
```

- [ ] **Step 1.2: 写失败测试**

创建 `apps/server/src/modules/invite/code.test.ts`：

```ts
import { describe, expect, test } from "vitest";
import {
  generateInviteCode,
  formatInviteCode,
  normalizeInviteCode,
  isWellFormedInviteCode,
} from "./code";

describe("invite code", () => {
  test("generated code only uses unambiguous alphabet (no 0/1/I/L/O)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode(8);
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/);
      expect(code).toHaveLength(8);
    }
  });

  test("generateInviteCode default length is 8", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  test("generateInviteCode accepts multiple-of-4 lengths", () => {
    expect(generateInviteCode(4)).toHaveLength(4);
    expect(generateInviteCode(12)).toHaveLength(12);
    expect(generateInviteCode(16)).toHaveLength(16);
  });

  test("generateInviteCode rejects non-multiple-of-4 lengths", () => {
    expect(() => generateInviteCode(5)).toThrow();
    expect(() => generateInviteCode(0)).toThrow();
    expect(() => generateInviteCode(-4)).toThrow();
  });

  test("formatInviteCode inserts '-' every 4 chars", () => {
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(formatInviteCode("ABCD")).toBe("ABCD");
    expect(formatInviteCode("ABCDEFGHJKLM")).toBe("ABCD-EFGH-JKLM");
  });

  test("normalizeInviteCode upper-cases, trims, and strips dashes/spaces", () => {
    expect(normalizeInviteCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeInviteCode("  abcd efgh  ")).toBe("ABCDEFGH");
    expect(normalizeInviteCode("AB-CD-EF-GH")).toBe("ABCDEFGH");
  });

  test("isWellFormedInviteCode accepts valid alphabet + length multiple of 4", () => {
    expect(isWellFormedInviteCode("ABCDEFGH")).toBe(true);
    expect(isWellFormedInviteCode("abcd-efgh")).toBe(true);
    expect(isWellFormedInviteCode("2345")).toBe(true);
  });

  test("isWellFormedInviteCode rejects ambiguous chars 0/1/I/L/O", () => {
    expect(isWellFormedInviteCode("ABCD0EFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCD1EFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDIEFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDLEFG")).toBe(false);
    expect(isWellFormedInviteCode("ABCDOEFG")).toBe(false);
  });

  test("isWellFormedInviteCode rejects empty and non-multiple-of-4", () => {
    expect(isWellFormedInviteCode("")).toBe(false);
    expect(isWellFormedInviteCode("ABC")).toBe(false);
    expect(isWellFormedInviteCode("ABCDE")).toBe(false);
  });

  test("isWellFormedInviteCode rejects lengths > 24 after normalize", () => {
    expect(isWellFormedInviteCode("ABCDEFGHABCDEFGHABCDEFGHABCD")).toBe(false);
  });
});
```

- [ ] **Step 1.3: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/code.test.ts
```

Expected: FAIL — `Failed to resolve import "./code"`

- [ ] **Step 1.4: 实现 code.ts**

创建 `apps/server/src/modules/invite/code.ts`：

```ts
/**
 * 邀请码生成 / 格式化 / 归一化。
 *
 * 约定：
 *   - 归一化形式：全大写、无分隔符，例 "ABCDEFGH"
 *   - 展示形式：每 4 位插入一个 "-"，例 "ABCD-EFGH"
 *   - 存储：DB 里只存归一化形式
 *
 * 不引入 nanoid（项目约定，见 apps/server/CLAUDE.md）。
 * 思路与 lib/cdkey-code.ts 一致但不复用——两模块未来演进方向可能分化。
 */

// 32 字符字母表，去掉歧义字符 0 / 1 / I / L / O
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ALPHABET_REGEX = /^[23456789A-HJ-NP-Z]+$/;

/** 生成 length 位归一化邀请码。length 必须是 4 的倍数。 */
export function generateInviteCode(length = 8): string {
  if (length <= 0 || length % 4 !== 0) {
    throw new Error("invite code length must be a positive multiple of 4");
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}

/** 展示用：每 4 位插入 "-"（末段不跟分隔符）。 */
export function formatInviteCode(normalized: string): string {
  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    out += normalized[i];
    if ((i + 1) % 4 === 0 && i < normalized.length - 1) out += "-";
  }
  return out;
}

/** 用户输入归一化：trim + 大写 + 去 "-" 和空白。 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[-\s]/g, "");
}

/**
 * 合法性检查（仅看字符集和长度）。不查 DB。
 * 接受含 "-" 和大小写混杂的原始输入——内部会先 normalize。
 */
export function isWellFormedInviteCode(raw: string): boolean {
  const s = normalizeInviteCode(raw);
  if (s.length === 0 || s.length > 24) return false;
  if (s.length % 4 !== 0) return false;
  return ALPHABET_REGEX.test(s);
}
```

- [ ] **Step 1.5: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/code.test.ts
```

Expected: PASS — 9 个 test 全绿

- [ ] **Step 1.6: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 1.7: Commit**

```bash
git add apps/server/src/modules/invite/code.ts apps/server/src/modules/invite/code.test.ts
git commit -m "feat(invite): 邀请码生成/格式化/归一化工具"
```

---

## Task 2: Schema + 数据库迁移

**Files:**
- Create: `apps/server/src/schema/invite.ts`
- Modify: `apps/server/src/schema/index.ts`

- [ ] **Step 2.1: 写 schema 文件**

创建 `apps/server/src/schema/invite.ts`：

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * 邀请系统租户级配置。每个 org 至多一行；没有行时 service 层返回默认值。
 */
export const inviteSettings = pgTable(
  "invite_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    codeLength: integer("code_length").default(8).notNull(),
    allowSelfInvite: boolean("allow_self_invite").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // codeLength ∈ {4, 8, 12, 16, 20, 24}
    check(
      "invite_settings_code_length_check",
      sql`${table.codeLength} >= 4 AND ${table.codeLength} <= 24 AND ${table.codeLength} % 4 = 0`,
    ),
  ],
);

/**
 * 邀请码 —— 一人一码，仅存当前 active。
 *
 * reset 语义 = UPDATE code + rotated_at；不保留历史。
 * 已存在的 invite_relationships 通过 inviter_code_snapshot 保留绑定时的码。
 */
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    code: text("code").notNull(),
    rotatedAt: timestamp("rotated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 一人一码
    uniqueIndex("invite_codes_org_user_uidx").on(
      table.organizationId,
      table.endUserId,
    ),
    // 码在租户内唯一（跨租户可重）
    uniqueIndex("invite_codes_org_code_uidx").on(
      table.organizationId,
      table.code,
    ),
  ],
);

/**
 * 邀请关系 —— bind 建立、qualify 推进。
 *
 * UNIQUE (org, invitee_end_user_id) 是强约束：一个被邀人全租户内只能被邀一次。
 * CHECK 约束 invitee ≠ inviter 做 DB 层兜底防自邀（若 settings.allowSelfInvite
 * 开启则放到 service 层，对 CHECK 不可见——因此 CHECK 只在 !allowSelfInvite
 * 情况下成立；注意：我们这里设计上 DB 层不允许自邀，self-invite 放 service 层决定
 * 要不要拒；但 DB 一旦允许，invitee=inviter 的数据确实会落——修正：CHECK 放宽到
 * inviter/invitee 不等，把 allowSelfInvite 作为 service-level override 仅对此绕开）。
 *
 * 实际决策：去掉 DB CHECK，自邀防护完全放 service 层。理由：allowSelfInvite=true
 * 时需要允许相等，DB CHECK 会硬挡；让 service 负责是正确语义。
 */
export const inviteRelationships = pgTable(
  "invite_relationships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inviterEndUserId: text("inviter_end_user_id").notNull(),
    inviteeEndUserId: text("invitee_end_user_id").notNull(),
    inviterCodeSnapshot: text("inviter_code_snapshot").notNull(),
    boundAt: timestamp("bound_at").defaultNow().notNull(),
    qualifiedAt: timestamp("qualified_at"),
    qualifiedReason: text("qualified_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("invite_relationships_org_invitee_uidx").on(
      table.organizationId,
      table.inviteeEndUserId,
    ),
    index("invite_relationships_org_inviter_bound_idx").on(
      table.organizationId,
      table.inviterEndUserId,
      table.boundAt,
    ),
  ],
);
```

> **注**：spec 里原本写了 DB CHECK 防自邀，但因为 `allowSelfInvite=true` 时要让 inviter === invitee 合法落库，DB 层硬挡会阻断该特性。决策：**自邀防护完全放 service 层**，DB 层去掉 CHECK。上面 schema 文件头部注释已解释。

- [ ] **Step 2.2: Re-export schema**

编辑 `apps/server/src/schema/index.ts` 加一行 re-export：

```ts
export * from "./invite";
```

（插入位置：按字母序放在现有 re-export 之间。先 `cat apps/server/src/schema/index.ts` 确认位置。）

- [ ] **Step 2.3: 生成迁移**

```bash
pnpm --filter=server db:generate
```

Expected: 产出 `apps/server/drizzle/XXXX_*.sql`（文件名 hash 依 drizzle 工具而定）。

- [ ] **Step 2.4: Review 生成的 SQL**

打开 `apps/server/drizzle/` 下最新的 `.sql` 文件，**人工确认**以下几点都在：

1. `CREATE TABLE invite_settings` 包含 PK `organization_id` + FK → `organization.id` ON DELETE CASCADE
2. `CREATE TABLE invite_codes` 含两个 unique index：`invite_codes_org_user_uidx`、`invite_codes_org_code_uidx`
3. `CREATE TABLE invite_relationships` 含 unique index `invite_relationships_org_invitee_uidx` + 普通 index `invite_relationships_org_inviter_bound_idx`
4. `invite_settings_code_length_check` CHECK 约束存在
5. 所有 FK 都带 `ON DELETE CASCADE`
6. **无** `CHECK` 阻止 `inviter_end_user_id = invitee_end_user_id`（故意不做）

如缺任何一项，停下来修 schema 再 regenerate。

- [ ] **Step 2.5: 应用迁移**

```bash
pnpm --filter=server db:migrate
```

Expected: 成功应用到 `.dev.vars` 里配置的 Neon dev 分支。

- [ ] **Step 2.6: 烟雾测试 schema import**

```bash
pnpm --filter=server check-types
```

Expected: 0 error。如果 index.ts re-export 有拼写错，typecheck 会炸在这步。

- [ ] **Step 2.7: Commit**

```bash
git add apps/server/src/schema/invite.ts apps/server/src/schema/index.ts apps/server/drizzle/
git commit -m "feat(invite): schema — invite_settings / invite_codes / invite_relationships"
```

---

## Task 3: 错误 / 类型 / validators 骨架

**Files:**
- Create: `apps/server/src/modules/invite/errors.ts`
- Create: `apps/server/src/modules/invite/types.ts`
- Create: `apps/server/src/modules/invite/validators.ts`

- [ ] **Step 3.1: 写 errors.ts**

创建 `apps/server/src/modules/invite/errors.ts`：

```ts
import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class InviteDisabled extends ModuleError {
  constructor() {
    super("invite.disabled", 403, "invite system is disabled for this organization");
    this.name = "InviteDisabled";
  }
}

export class InviteCodeNotFound extends ModuleError {
  constructor() {
    super("invite.code_not_found", 404, "invite code not found or has been reset");
    this.name = "InviteCodeNotFound";
  }
}

export class InviteSelfInviteForbidden extends ModuleError {
  constructor() {
    super("invite.self_invite_forbidden", 400, "cannot invite yourself");
    this.name = "InviteSelfInviteForbidden";
  }
}

export class InviteAlreadyBound extends ModuleError {
  constructor() {
    super("invite.already_bound", 409, "this user is already bound to a different inviter");
    this.name = "InviteAlreadyBound";
  }
}

export class InviteeNotBound extends ModuleError {
  constructor() {
    super("invite.invitee_not_bound", 404, "invitee has no bound inviter");
    this.name = "InviteeNotBound";
  }
}

export class InviteRelationshipNotFound extends ModuleError {
  constructor(id: string) {
    super("invite.relationship_not_found", 404, `invite relationship not found: ${id}`);
    this.name = "InviteRelationshipNotFound";
  }
}

export class InviteCodeConflict extends ModuleError {
  constructor() {
    super("invite.code_conflict", 500, "failed to generate a unique invite code after retries");
    this.name = "InviteCodeConflict";
  }
}
```

- [ ] **Step 3.2: 写 types.ts**

创建 `apps/server/src/modules/invite/types.ts`：

```ts
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
```

- [ ] **Step 3.3: 写 validators.ts**

创建 `apps/server/src/modules/invite/validators.ts`：

```ts
import { z } from "@hono/zod-openapi";

/* ─── Settings I/O ─────────────────────────────────────────────── */

export const UpsertInviteSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    codeLength: z
      .number()
      .int()
      .min(4)
      .max(24)
      .refine((n) => n % 4 === 0, { message: "codeLength must be a multiple of 4" })
      .optional(),
    allowSelfInvite: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .openapi("UpsertInviteSettingsInput");

export type UpsertInviteSettingsInput = z.infer<typeof UpsertInviteSettingsSchema>;

export const InviteSettingsViewSchema = z
  .object({
    organizationId: z.string(),
    enabled: z.boolean(),
    codeLength: z.number().int(),
    allowSelfInvite: z.boolean(),
    metadata: z.record(z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("InviteSettingsView");

/* ─── Code I/O ─────────────────────────────────────────────────── */

export const InviteCodeViewSchema = z
  .object({
    code: z.string().openapi({ description: "Human-readable form with dashes, e.g. ABCD-EFGH" }),
    rotatedAt: z.string().nullable(),
  })
  .openapi("InviteCodeView");

/* ─── Relationship I/O ─────────────────────────────────────────── */

export const InviteRelationshipViewSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    inviterEndUserId: z.string(),
    inviteeEndUserId: z.string(),
    inviterCodeSnapshot: z.string(),
    boundAt: z.string(),
    qualifiedAt: z.string().nullable(),
    qualifiedReason: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
  })
  .openapi("InviteRelationshipView");

export const InviteRelationshipListSchema = z
  .object({
    items: z.array(InviteRelationshipViewSchema),
    total: z.number().int(),
  })
  .openapi("InviteRelationshipList");

/* ─── Summary I/O ──────────────────────────────────────────────── */

export const InviteSummaryViewSchema = z
  .object({
    myCode: z.string(),
    myCodeRotatedAt: z.string().nullable(),
    boundCount: z.number().int(),
    qualifiedCount: z.number().int(),
    invitedBy: z
      .object({
        inviterEndUserId: z.string(),
        boundAt: z.string(),
        qualifiedAt: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("InviteSummaryView");

/* ─── Pagination / param / query ──────────────────────────────── */

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
  }),
});

export const RelationshipIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
  }),
});

export const AdminListRelationshipsQuerySchema = PaginationQuerySchema.extend({
  inviterEndUserId: z.string().min(1).max(256).optional(),
  qualifiedOnly: z.coerce.boolean().optional(),
});

/* ─── Client (C-end) bodies ───────────────────────────────────── */

// HMAC 流 —— 客户端代终端用户发起
export const ClientMyCodeQuerySchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
});

export const ClientResetCodeBodySchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
});

// Server 流 —— 客户方游戏服务器直连
export const ClientBindBodySchema = z
  .object({
    code: z.string().min(1).max(64).openapi({ description: "Inviter's code; case / dash-insensitive" }),
    inviteeEndUserId: z.string().min(1).max(256),
  })
  .openapi("ClientBindBody");

export const ClientQualifyBodySchema = z
  .object({
    inviteeEndUserId: z.string().min(1).max(256),
    qualifiedReason: z.string().max(128).nullable().optional(),
  })
  .openapi("ClientQualifyBody");

/* ─── Error response ──────────────────────────────────────────── */

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("ErrorResponse");
```

- [ ] **Step 3.4: typecheck**

```bash
pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 3.5: Commit**

```bash
git add apps/server/src/modules/invite/errors.ts apps/server/src/modules/invite/types.ts apps/server/src/modules/invite/validators.ts
git commit -m "feat(invite): errors + types + validators 骨架"
```

---

## Task 4: client-credentials 扩展（crypto + errors + service）

引入 `verifyServerRequest(publishableKey, providedSecret)` 给 invite 的 bind/qualify 用。

**Files:**
- Modify: `apps/server/src/lib/crypto.ts`
- Modify: `apps/server/src/lib/crypto.test.ts`
- Modify: `apps/server/src/modules/client-credentials/errors.ts`
- Modify: `apps/server/src/modules/client-credentials/service.ts`
- Modify: `apps/server/src/modules/client-credentials/service.test.ts`

- [ ] **Step 4.1: 先写 crypto 失败测试**

打开 `apps/server/src/lib/crypto.test.ts`，在文件末尾追加：

```ts
import { constantTimeEqual } from "./crypto";

describe("constantTimeEqual", () => {
  test("equal strings return true", () => {
    expect(constantTimeEqual("hello", "hello")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("csk_abc123XYZ", "csk_abc123XYZ")).toBe(true);
  });

  test("different strings return false", () => {
    expect(constantTimeEqual("hello", "world")).toBe(false);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  test("different-length strings return false without crashing", () => {
    expect(constantTimeEqual("short", "a-bit-longer")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
  });

  test("unicode-safe (utf-8 bytes)", () => {
    expect(constantTimeEqual("你好", "你好")).toBe(true);
    expect(constantTimeEqual("你好", "你不好")).toBe(false);
  });
});
```

（如果该文件顶部没 `import { describe, test, expect } from "vitest"`，对照现有 import 补上。）

- [ ] **Step 4.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/lib/crypto.test.ts
```

Expected: FAIL — `constantTimeEqual is not a function`

- [ ] **Step 4.3: 实现 constantTimeEqual**

编辑 `apps/server/src/lib/crypto.ts`，在文件末尾追加：

```ts
/**
 * Constant-time string equality.
 *
 * Encodes both strings as UTF-8 and compares byte-by-byte without early
 * return. Different-length inputs always return false (but still traverse
 * the longer buffer to keep timing consistent with the length check).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const x = ba[i] ?? 0;
    const y = bb[i] ?? 0;
    diff |= x ^ y;
  }
  return diff === 0;
}
```

- [ ] **Step 4.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/lib/crypto.test.ts
```

Expected: PASS

- [ ] **Step 4.5: 加 InvalidSecret error**

编辑 `apps/server/src/modules/client-credentials/errors.ts`，在文件末尾追加：

```ts
export class InvalidSecret extends ModuleError {
  constructor() {
    super("client_credential.invalid_secret", 401, "invalid client secret");
    this.name = "InvalidSecret";
  }
}
```

- [ ] **Step 4.6: 先写 verifyServerRequest 失败测试**

打开 `apps/server/src/modules/client-credentials/service.test.ts`，在最后一个 `describe` 前追加一个新 describe 块：

```ts
describe("verifyServerRequest", () => {
  // 假设该文件已有 svc 变量 / orgId beforeAll 机制。复用同 pattern：
  // 每个 test 新建一个 cred，行末 revoke 或让 afterAll 级联清。
  test("accepts correct publishable key + secret", async () => {
    const created = await svc.create(orgId, { name: "server-test-1" });
    const result = await svc.verifyServerRequest(
      created.publishableKey,
      created.secret,
    );
    expect(result.valid).toBe(true);
    expect(result.organizationId).toBe(orgId);
    expect(result.credentialId).toBe(created.id);
  });

  test("rejects wrong secret with InvalidSecret", async () => {
    const created = await svc.create(orgId, { name: "server-test-2" });
    await expect(
      svc.verifyServerRequest(created.publishableKey, "csk_wrong_secret_value"),
    ).rejects.toThrow(/invalid client secret/i);
  });

  test("rejects disabled credential", async () => {
    const created = await svc.create(orgId, { name: "server-test-3" });
    await svc.revoke(orgId, created.id);
    await expect(
      svc.verifyServerRequest(created.publishableKey, created.secret),
    ).rejects.toThrow(/disabled/i);
  });

  test("rejects unknown publishable key", async () => {
    await expect(
      svc.verifyServerRequest("cpk_does_not_exist", "csk_whatever"),
    ).rejects.toThrow(/not found/i);
  });

  test("devMode bypasses secret check", async () => {
    const created = await svc.create(orgId, { name: "server-test-4" });
    await svc.updateDevMode(orgId, created.id, true);
    const result = await svc.verifyServerRequest(
      created.publishableKey,
      "csk_any_garbage",
    );
    expect(result.valid).toBe(true);
    expect(result.devMode).toBe(true);
  });
});
```

（先看 service.test.ts 文件顶部的 `svc` / `orgId` / imports 现状；上面 `describe` 块假设了和 `verifyRequest` test 同一套 fixtures。如果 svc 变量名不同，对照调整。）

- [ ] **Step 4.7: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/client-credentials/service.test.ts
```

Expected: FAIL — `verifyServerRequest is not a function`

- [ ] **Step 4.8: 实现 verifyServerRequest**

编辑 `apps/server/src/modules/client-credentials/service.ts`：

1. 顶部 import 区加入 `constantTimeEqual`：

```ts
import {
  encrypt,
  decrypt,
  generateKeyPair,
  verifyHmac,
  constantTimeEqual,
} from "../../lib/crypto";
```

2. 顶部 error import 加入 `InvalidSecret`：

```ts
import {
  CredentialNotFound,
  CredentialDisabled,
  CredentialExpired,
  InvalidHmac,
  InvalidSecret,
} from "./errors";
```

3. 在 service return 对象里，`verifyRequest` 方法之后追加：

```ts
    /**
     * Server-to-server variant: caller sends the plaintext secret directly
     * (via a trusted header from its own backend, e.g. x-api-secret).
     * We decrypt the stored secret and constant-time compare.
     *
     * Use case: invite bind / qualify — the call originates from the
     * customer's game server, not from the end user's browser, so HMAC
     * over endUserId is not meaningful here.
     */
    async verifyServerRequest(
      publishableKey: string,
      providedSecret: string,
    ): Promise<VerifyResult> {
      const [cred] = await db
        .select()
        .from(clientCredentials)
        .where(eq(clientCredentials.publishableKey, publishableKey));

      if (!cred) throw new CredentialNotFound(publishableKey);
      if (!cred.enabled) throw new CredentialDisabled(publishableKey);
      if (cred.expiresAt && cred.expiresAt < new Date()) {
        throw new CredentialExpired(publishableKey);
      }

      if (cred.devMode) {
        return {
          valid: true,
          organizationId: cred.organizationId,
          credentialId: cred.id,
          devMode: true,
        };
      }

      const stored = await decrypt(cred.encryptedSecret, appSecret);
      if (!constantTimeEqual(stored, providedSecret)) {
        throw new InvalidSecret();
      }

      return {
        valid: true,
        organizationId: cred.organizationId,
        credentialId: cred.id,
        devMode: false,
      };
    },
```

- [ ] **Step 4.9: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/client-credentials/service.test.ts
```

Expected: PASS — 新增 5 个 test 全绿，原有 test 不受影响

- [ ] **Step 4.10: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 4.11: Commit**

```bash
git add apps/server/src/lib/crypto.ts apps/server/src/lib/crypto.test.ts apps/server/src/modules/client-credentials/
git commit -m "feat(client-credentials): verifyServerRequest + constantTimeEqual"
```

---

## Task 5: Service — Settings

**Files:**
- Create: `apps/server/src/modules/invite/service.ts`（骨架 + settings）
- Create: `apps/server/src/modules/invite/service.test.ts`

- [ ] **Step 5.1: 写失败测试**

创建 `apps/server/src/modules/invite/service.test.ts`：

```ts
/**
 * Service-layer tests for invite module.
 *
 * Hits the real Neon dev branch configured in `.dev.vars`. Each test
 * file seeds its own test org in beforeAll and cleans via cascade.
 * End-user ids are unique per test to avoid cross-test interference.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createEventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createInviteService } from "./service";

describe("invite service — settings", () => {
  const events = createEventBus();
  const svc = createInviteService({ db, events });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-settings");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getSettings returns null when no row exists", async () => {
    const result = await svc.getSettings(orgId);
    expect(result).toBeNull();
  });

  test("upsertSettings creates a row with defaults merged", async () => {
    const result = await svc.upsertSettings(orgId, {
      enabled: true,
      codeLength: 12,
      allowSelfInvite: false,
      metadata: { tier: "pro" },
    });
    expect(result.organizationId).toBe(orgId);
    expect(result.enabled).toBe(true);
    expect(result.codeLength).toBe(12);
    expect(result.allowSelfInvite).toBe(false);
    expect(result.metadata).toEqual({ tier: "pro" });
  });

  test("upsertSettings updates existing row", async () => {
    const result = await svc.upsertSettings(orgId, {
      enabled: false,
      codeLength: 8,
    });
    expect(result.enabled).toBe(false);
    expect(result.codeLength).toBe(8);
    // unset fields keep their previous value (allowSelfInvite was false)
    expect(result.allowSelfInvite).toBe(false);
  });
});
```

- [ ] **Step 5.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: FAIL — `Failed to resolve import "./service"`

- [ ] **Step 5.3: 写 service.ts 骨架 + settings**

创建 `apps/server/src/modules/invite/service.ts`：

```ts
/**
 * Invite service — protocol-agnostic business logic.
 *
 * - No Hono / @hono/zod-openapi imports.
 * - No direct `../../db` import — receives deps via factory.
 * - Single-statement atomic writes (neon-http 无 transaction).
 *
 * Events published (when `events` dep is supplied):
 *   - invite.bound      — relationship created
 *   - invite.qualified  — relationship first-time qualified
 *
 * Nothing here imports the task module.
 */

import { and, count, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import type { EventBus } from "../../lib/event-bus";
import {
  inviteCodes,
  inviteRelationships,
  inviteSettings,
} from "../../schema/invite";
import {
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "./code";
import {
  InviteAlreadyBound,
  InviteCodeConflict,
  InviteCodeNotFound,
  InviteDisabled,
  InviteRelationshipNotFound,
  InviteSelfInviteForbidden,
  InviteeNotBound,
} from "./errors";
import type {
  InviteSummary,
  ResolvedInviteSettings,
} from "./types";
import type { UpsertInviteSettingsInput } from "./validators";

// Extend event-bus type map for invite-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "invite.bound": {
      organizationId: string;
      endUserId: string;
      inviterEndUserId: string;
      inviteeEndUserId: string;
      code: string;
      boundAt: Date;
    };
    "invite.qualified": {
      organizationId: string;
      endUserId: string;
      inviterEndUserId: string;
      inviteeEndUserId: string;
      qualifiedReason: string | null;
      qualifiedAt: Date;
      boundAt: Date;
    };
  }
}

type InviteDeps = Pick<AppDeps, "db"> & { events?: EventBus };

const DEFAULT_SETTINGS: ResolvedInviteSettings = {
  enabled: true,
  codeLength: 8,
  allowSelfInvite: false,
};

const CODE_RETRIES = 3;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}

export function createInviteService(d: InviteDeps) {
  const { db, events } = d;

  async function getSettingsOrDefaults(orgId: string): Promise<ResolvedInviteSettings> {
    const rows = await db
      .select()
      .from(inviteSettings)
      .where(eq(inviteSettings.organizationId, orgId))
      .limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_SETTINGS;
    return {
      enabled: row.enabled,
      codeLength: row.codeLength,
      allowSelfInvite: row.allowSelfInvite,
    };
  }

  return {
    /* ── Settings ─────────────────────────────────────────── */
    async getSettings(orgId: string) {
      const rows = await db
        .select()
        .from(inviteSettings)
        .where(eq(inviteSettings.organizationId, orgId))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertSettings(orgId: string, input: UpsertInviteSettingsInput) {
      // Build the insert values from input + defaults for first-insert.
      const insertValues = {
        organizationId: orgId,
        enabled: input.enabled ?? true,
        codeLength: input.codeLength ?? 8,
        allowSelfInvite: input.allowSelfInvite ?? false,
        metadata: (input.metadata ?? null) as Record<string, unknown> | null,
      };

      // On conflict, only update fields the caller explicitly set (keeps
      // existing row's other fields intact when the caller sends a partial
      // update). We use COALESCE-via-conditional in an update object.
      const setClause: Record<string, unknown> = {};
      if (input.enabled !== undefined) setClause.enabled = input.enabled;
      if (input.codeLength !== undefined) setClause.codeLength = input.codeLength;
      if (input.allowSelfInvite !== undefined) setClause.allowSelfInvite = input.allowSelfInvite;
      if (input.metadata !== undefined) setClause.metadata = input.metadata;

      if (Object.keys(setClause).length === 0) {
        // Nothing to update on conflict — but we still want to be idempotent
        // and return the row. Do an insert-ignore, then select.
        await db
          .insert(inviteSettings)
          .values(insertValues)
          .onConflictDoNothing();
        const [row] = await db
          .select()
          .from(inviteSettings)
          .where(eq(inviteSettings.organizationId, orgId))
          .limit(1);
        if (!row) throw new Error("upsertSettings: row missing after insert-ignore");
        return row;
      }

      const [row] = await db
        .insert(inviteSettings)
        .values(insertValues)
        .onConflictDoUpdate({
          target: inviteSettings.organizationId,
          set: setClause,
        })
        .returning();
      if (!row) throw new Error("upsertSettings: returning no row");
      return row;
    },
  };
}

export type InviteService = ReturnType<typeof createInviteService>;

// Suppress unused-imports warnings for symbols referenced only by later tasks.
// They will be used when Tasks 6–9 extend this file.
void and; void count; void desc; void sql;
void inviteCodes; void inviteRelationships;
void formatInviteCode; void generateInviteCode; void normalizeInviteCode;
void InviteAlreadyBound; void InviteCodeConflict; void InviteCodeNotFound;
void InviteDisabled; void InviteRelationshipNotFound; void InviteSelfInviteForbidden; void InviteeNotBound;
void events; void getSettingsOrDefaults; void isUniqueViolation;
void formatInviteCode;
void ({} as InviteSummary);
```

> **注**：文件尾的 `void` 语句只是**临时占位**，让第一版 service.ts 在 lint/typecheck 下通过。Task 6–9 扩展 service 时会把它们真正用上并**删除所有 `void` 占位**。

- [ ] **Step 5.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: PASS — 3 个 settings test 全绿

- [ ] **Step 5.5: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 5.6: Commit**

```bash
git add apps/server/src/modules/invite/service.ts apps/server/src/modules/invite/service.test.ts
git commit -m "feat(invite): service skeleton + settings getSettings/upsertSettings"
```

---

## Task 6: Service — 邀请码（getOrCreateMyCode / resetCode / lookupByCode）

**Files:**
- Modify: `apps/server/src/modules/invite/service.ts`
- Modify: `apps/server/src/modules/invite/service.test.ts`

- [ ] **Step 6.1: 写失败测试**

打开 `service.test.ts`，在文件末尾追加：

```ts
describe("invite service — codes", () => {
  const events = createEventBus();
  const svc = createInviteService({ db, events });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-codes");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getOrCreateMyCode generates a new code on first call", async () => {
    const result = await svc.getOrCreateMyCode(orgId, "user-A");
    expect(result.code).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
    expect(result.rotatedAt).toBeNull();
  });

  test("getOrCreateMyCode returns the same code on second call", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-B");
    const second = await svc.getOrCreateMyCode(orgId, "user-B");
    expect(second.code).toBe(first.code);
  });

  test("resetCode rotates to a different code and sets rotatedAt", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-C");
    const rotated = await svc.resetCode(orgId, "user-C");
    expect(rotated.code).not.toBe(first.code);
    expect(rotated.rotatedAt).toBeInstanceOf(Date);
  });

  test("lookupByCode finds an active code (normalized input)", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "user-D");
    const normalized = code.replace("-", "");
    const hit = await svc.lookupByCode(orgId, normalized);
    expect(hit).toEqual({ endUserId: "user-D" });
  });

  test("lookupByCode accepts dashed input", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "user-E");
    const hit = await svc.lookupByCode(orgId, code);
    expect(hit).toEqual({ endUserId: "user-E" });
  });

  test("lookupByCode returns null for unknown code", async () => {
    const hit = await svc.lookupByCode(orgId, "ZZZZZZZZ");
    expect(hit).toBeNull();
  });

  test("lookupByCode returns null for malformed code", async () => {
    const hit = await svc.lookupByCode(orgId, "abc-with-0-in-it");
    expect(hit).toBeNull();
  });

  test("lookupByCode returns null for rotated-away old code", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-F");
    await svc.resetCode(orgId, "user-F");
    const hit = await svc.lookupByCode(orgId, first.code);
    expect(hit).toBeNull();
  });
});
```

- [ ] **Step 6.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: FAIL — `svc.getOrCreateMyCode is not a function`

- [ ] **Step 6.3: 实现 code 方法**

打开 `apps/server/src/modules/invite/service.ts`：

1. 先**删除文件末尾所有 `void` 占位行**（从 `// Suppress unused-imports...` 那行开始到 `void ({} as InviteSummary);` 这段）。

2. 在 return 对象里（`upsertSettings` 之后）追加：

```ts
    /* ── 邀请码 ───────────────────────────────────────────── */

    /**
     * 返回 endUser 的当前 active 码，首次调用时生成。
     * 并发/码冲突时最多重试 CODE_RETRIES 次。
     */
    async getOrCreateMyCode(orgId: string, endUserId: string) {
      // Fast path: 已有码直接返回
      const existing = await db
        .select({
          code: inviteCodes.code,
          rotatedAt: inviteCodes.rotatedAt,
        })
        .from(inviteCodes)
        .where(
          and(
            eq(inviteCodes.organizationId, orgId),
            eq(inviteCodes.endUserId, endUserId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return {
          code: formatInviteCode(existing[0].code),
          rotatedAt: existing[0].rotatedAt,
        };
      }

      // Slow path: 生成 + retry
      const settings = await getSettingsOrDefaults(orgId);
      for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
        const candidate = generateInviteCode(settings.codeLength);
        try {
          const [row] = await db
            .insert(inviteCodes)
            .values({
              organizationId: orgId,
              endUserId,
              code: candidate,
            })
            .onConflictDoNothing()
            .returning();
          if (row) {
            return {
              code: formatInviteCode(row.code),
              rotatedAt: row.rotatedAt,
            };
          }
          // onConflictDoNothing returned 0 rows — can mean:
          //   (a) (org, endUserId) unique violation → 别人刚给 endUserId 插了一条
          //       → 重新走 fast path 读出来
          //   (b) (org, code) unique violation → 码撞了 → retry 下一个 candidate
          // 先重读看是否是 (a)
          const reread = await db
            .select({
              code: inviteCodes.code,
              rotatedAt: inviteCodes.rotatedAt,
            })
            .from(inviteCodes)
            .where(
              and(
                eq(inviteCodes.organizationId, orgId),
                eq(inviteCodes.endUserId, endUserId),
              ),
            )
            .limit(1);
          if (reread[0]) {
            return {
              code: formatInviteCode(reread[0].code),
              rotatedAt: reread[0].rotatedAt,
            };
          }
          // 不是 (a)，肯定是 (b)——继续 retry
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          // 同上：重读或 retry
          const reread = await db
            .select({
              code: inviteCodes.code,
              rotatedAt: inviteCodes.rotatedAt,
            })
            .from(inviteCodes)
            .where(
              and(
                eq(inviteCodes.organizationId, orgId),
                eq(inviteCodes.endUserId, endUserId),
              ),
            )
            .limit(1);
          if (reread[0]) {
            return {
              code: formatInviteCode(reread[0].code),
              rotatedAt: reread[0].rotatedAt,
            };
          }
        }
      }
      throw new InviteCodeConflict();
    },

    /**
     * 轮换 endUser 的码。返回新码 + 设置 rotatedAt = now。
     * endUser 必须已经有码——如果没码，先调 getOrCreateMyCode 再 reset
     * 更符合常识，这里按"没码就先生成再立即 reset"的保守实现。
     */
    async resetCode(orgId: string, endUserId: string) {
      const settings = await getSettingsOrDefaults(orgId);
      for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
        const candidate = generateInviteCode(settings.codeLength);
        try {
          const [row] = await db
            .insert(inviteCodes)
            .values({
              organizationId: orgId,
              endUserId,
              code: candidate,
              rotatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [inviteCodes.organizationId, inviteCodes.endUserId],
              set: {
                code: candidate,
                rotatedAt: new Date(),
              },
            })
            .returning();
          if (row) {
            return {
              code: formatInviteCode(row.code),
              rotatedAt: row.rotatedAt!,
            };
          }
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          // 码碰撞——retry 下一个 candidate
        }
      }
      throw new InviteCodeConflict();
    },

    /**
     * 根据码查 endUserId。接收归一化或带 "-" 的形式。
     * 码不合法或不存在都返回 null——调用方统一抛 InviteCodeNotFound。
     */
    async lookupByCode(orgId: string, rawCode: string) {
      const normalized = normalizeInviteCode(rawCode);
      if (normalized.length === 0) return null;
      // 基本字符集检查：凡归一化后非字母表字符就直接返回 null
      if (!/^[23456789A-HJ-NP-Z]+$/.test(normalized)) return null;

      const rows = await db
        .select({ endUserId: inviteCodes.endUserId })
        .from(inviteCodes)
        .where(
          and(
            eq(inviteCodes.organizationId, orgId),
            eq(inviteCodes.code, normalized),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
```

- [ ] **Step 6.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: PASS — 11 个 test 全绿（settings 3 + codes 8）

- [ ] **Step 6.5: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 6.6: Commit**

```bash
git add apps/server/src/modules/invite/service.ts apps/server/src/modules/invite/service.test.ts
git commit -m "feat(invite): service — getOrCreateMyCode / resetCode / lookupByCode"
```

---

## Task 7: Service — bind（落关系 + 发 invite.bound 事件）

**Files:**
- Modify: `apps/server/src/modules/invite/service.ts`
- Modify: `apps/server/src/modules/invite/service.test.ts`

- [ ] **Step 7.1: 写失败测试**

打开 `service.test.ts`，在文件末尾追加：

```ts
describe("invite service — bind", () => {
  let events: ReturnType<typeof createEventBus>;
  let svc: ReturnType<typeof createInviteService>;
  let orgId: string;
  // 全局订阅收集器：每个 test 开头清空
  const emitted: Array<{ type: string; payload: unknown }> = [];

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-bind");
    events = createEventBus();
    svc = createInviteService({ db, events });
    events.on("invite.bound", (p) => {
      emitted.push({ type: "invite.bound", payload: p });
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("bind落关系、发 invite.bound 一次", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-1");
    const result = await svc.bind(orgId, {
      code,
      inviteeEndUserId: "invitee-1",
    });
    expect(result.alreadyBound).toBe(false);
    expect(result.relationship.inviterEndUserId).toBe("inviter-1");
    expect(result.relationship.inviteeEndUserId).toBe("invitee-1");
    expect(result.relationship.inviterCodeSnapshot).toBe(
      code.replace("-", ""),
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.type).toBe("invite.bound");
    expect(emitted[0]!.payload).toMatchObject({
      organizationId: orgId,
      endUserId: "inviter-1", // task 归属
      inviterEndUserId: "inviter-1",
      inviteeEndUserId: "invitee-1",
      code: code, // 带 "-" 的人类可读形式
    });
  });

  test("bind 幂等：相同 inviter 再 bind → alreadyBound=true，事件不重复", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-2");
    await svc.bind(orgId, { code, inviteeEndUserId: "invitee-2" });
    emitted.length = 0; // 清前一次
    const again = await svc.bind(orgId, { code, inviteeEndUserId: "invitee-2" });
    expect(again.alreadyBound).toBe(true);
    expect(again.relationship.inviterEndUserId).toBe("inviter-2");
    expect(emitted).toHaveLength(0);
  });

  test("bind 冲突：换个 inviter 再 bind 同 invitee → InviteAlreadyBound", async () => {
    const { code: codeA } = await svc.getOrCreateMyCode(orgId, "inviter-3a");
    const { code: codeB } = await svc.getOrCreateMyCode(orgId, "inviter-3b");
    await svc.bind(orgId, { code: codeA, inviteeEndUserId: "invitee-3" });
    await expect(
      svc.bind(orgId, { code: codeB, inviteeEndUserId: "invitee-3" }),
    ).rejects.toThrow(/already.*bound/i);
  });

  test("bind 自邀默认被禁 → InviteSelfInviteForbidden", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-4");
    await expect(
      svc.bind(orgId, { code, inviteeEndUserId: "inviter-4" }),
    ).rejects.toThrow(/cannot invite yourself/i);
  });

  test("bind 自邀在 allowSelfInvite=true 下通过", async () => {
    await svc.upsertSettings(orgId, { allowSelfInvite: true });
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-5");
    const result = await svc.bind(orgId, {
      code,
      inviteeEndUserId: "inviter-5",
    });
    expect(result.relationship.inviterEndUserId).toBe("inviter-5");
    expect(result.relationship.inviteeEndUserId).toBe("inviter-5");
    // 恢复 — 否则污染后续 test
    await svc.upsertSettings(orgId, { allowSelfInvite: false });
  });

  test("bind 用不存在的码 → InviteCodeNotFound", async () => {
    await expect(
      svc.bind(orgId, {
        code: "ZZZZZZZZ",
        inviteeEndUserId: "invitee-noop",
      }),
    ).rejects.toThrow(/not found|has been reset/i);
  });

  test("bind 被禁用的租户 → InviteDisabled", async () => {
    await svc.upsertSettings(orgId, { enabled: false });
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-6");
    await expect(
      svc.bind(orgId, { code, inviteeEndUserId: "invitee-6" }),
    ).rejects.toThrow(/disabled/i);
    await svc.upsertSettings(orgId, { enabled: true });
  });
});
```

- [ ] **Step 7.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: FAIL — `svc.bind is not a function`

- [ ] **Step 7.3: 实现 bind**

编辑 `apps/server/src/modules/invite/service.ts`，在 `lookupByCode` 之后追加：

```ts
    /* ── bind ─────────────────────────────────────────────── */

    /**
     * 客户方游戏服务器在 B 注册时调用。落关系、发 invite.bound 事件。
     *
     * 幂等规则：
     *   - invitee 已被**同** inviter 绑 → 200, alreadyBound=true, 不发事件
     *   - invitee 已被**不同** inviter 绑 → throw InviteAlreadyBound (409)
     */
    async bind(
      orgId: string,
      input: { code: string; inviteeEndUserId: string },
    ): Promise<{
      relationship: typeof inviteRelationships.$inferSelect;
      alreadyBound: boolean;
    }> {
      const settings = await getSettingsOrDefaults(orgId);
      if (!settings.enabled) throw new InviteDisabled();

      const lookup = await this.lookupByCode(orgId, input.code);
      if (!lookup) throw new InviteCodeNotFound();
      const inviterEndUserId = lookup.endUserId;

      if (
        inviterEndUserId === input.inviteeEndUserId &&
        !settings.allowSelfInvite
      ) {
        throw new InviteSelfInviteForbidden();
      }

      const normalized = normalizeInviteCode(input.code);

      // 原子插入：INSERT ... ON CONFLICT DO NOTHING RETURNING *, (xmax = 0) AS inserted
      const inserted = await db
        .insert(inviteRelationships)
        .values({
          organizationId: orgId,
          inviterEndUserId,
          inviteeEndUserId: input.inviteeEndUserId,
          inviterCodeSnapshot: normalized,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 1) {
        // 新建成功
        const row = inserted[0]!;
        if (events) {
          await events.emit("invite.bound", {
            organizationId: orgId,
            endUserId: inviterEndUserId,
            inviterEndUserId,
            inviteeEndUserId: input.inviteeEndUserId,
            code: formatInviteCode(normalized),
            boundAt: row.boundAt,
          });
        }
        return { relationship: row, alreadyBound: false };
      }

      // 冲突 —— 查已有行
      const [existing] = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
          ),
        )
        .limit(1);
      if (!existing) {
        // 理论上不可能 —— UNIQUE 冲突意味着行存在
        throw new Error(
          "invite.bind: conflict reported but existing row not found",
        );
      }
      if (existing.inviterEndUserId === inviterEndUserId) {
        return { relationship: existing, alreadyBound: true };
      }
      throw new InviteAlreadyBound();
    },
```

- [ ] **Step 7.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: PASS — 18 个 test（settings 3 + codes 8 + bind 7）

- [ ] **Step 7.5: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 7.6: Commit**

```bash
git add apps/server/src/modules/invite/service.ts apps/server/src/modules/invite/service.test.ts
git commit -m "feat(invite): service.bind — 原子落关系 + 幂等 + 自邀拦截 + 事件"
```

---

## Task 8: Service — qualify（推进 qualified_at + 发 invite.qualified 事件）

**Files:**
- Modify: `apps/server/src/modules/invite/service.ts`
- Modify: `apps/server/src/modules/invite/service.test.ts`

- [ ] **Step 8.1: 写失败测试**

打开 `service.test.ts`，在文件末尾追加：

```ts
describe("invite service — qualify", () => {
  let events: ReturnType<typeof createEventBus>;
  let svc: ReturnType<typeof createInviteService>;
  let orgId: string;
  const emitted: Array<{ type: string; payload: unknown }> = [];

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-qualify");
    events = createEventBus();
    svc = createInviteService({ db, events });
    events.on("invite.qualified", (p) => {
      emitted.push({ type: "invite.qualified", payload: p });
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("首次 qualify 成功、事件发射、reason 落库", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-q1");
    await svc.bind(orgId, { code, inviteeEndUserId: "invitee-q1" });

    const result = await svc.qualify(orgId, {
      inviteeEndUserId: "invitee-q1",
      qualifiedReason: "first_purchase",
    });
    expect(result.alreadyQualified).toBe(false);
    expect(result.relationship.qualifiedAt).toBeInstanceOf(Date);
    expect(result.relationship.qualifiedReason).toBe("first_purchase");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload).toMatchObject({
      organizationId: orgId,
      endUserId: "inviter-q1",
      inviterEndUserId: "inviter-q1",
      inviteeEndUserId: "invitee-q1",
      qualifiedReason: "first_purchase",
    });
  });

  test("二次 qualify 幂等、事件不重发", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-q2");
    await svc.bind(orgId, { code, inviteeEndUserId: "invitee-q2" });
    await svc.qualify(orgId, { inviteeEndUserId: "invitee-q2" });
    emitted.length = 0;
    const again = await svc.qualify(orgId, {
      inviteeEndUserId: "invitee-q2",
      qualifiedReason: "later-reason-ignored",
    });
    expect(again.alreadyQualified).toBe(true);
    expect(emitted).toHaveLength(0);
  });

  test("qualify 对未 bind 的 invitee → InviteeNotBound", async () => {
    await expect(
      svc.qualify(orgId, { inviteeEndUserId: "never-bound" }),
    ).rejects.toThrow(/no bound inviter/i);
  });

  test("qualify 禁用的租户 → InviteDisabled", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-q3");
    await svc.bind(orgId, { code, inviteeEndUserId: "invitee-q3" });
    await svc.upsertSettings(orgId, { enabled: false });
    await expect(
      svc.qualify(orgId, { inviteeEndUserId: "invitee-q3" }),
    ).rejects.toThrow(/disabled/i);
    await svc.upsertSettings(orgId, { enabled: true });
  });
});
```

- [ ] **Step 8.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: FAIL — `svc.qualify is not a function`

- [ ] **Step 8.3: 实现 qualify**

编辑 `service.ts`，在 `bind` 之后追加：

```ts
    /* ── qualify ──────────────────────────────────────────── */

    /**
     * 客户方在认定"这个邀请算数了"时调用。推进 qualified_at + 发 invite.qualified。
     *
     * 原子写：UPDATE ... WHERE qualified_at IS NULL。RETURNING 1 行 → 首次；
     * 0 行再 SELECT 一次区分"不存在"和"已 qualified"。
     */
    async qualify(
      orgId: string,
      input: { inviteeEndUserId: string; qualifiedReason?: string | null },
    ): Promise<{
      relationship: typeof inviteRelationships.$inferSelect;
      alreadyQualified: boolean;
    }> {
      const settings = await getSettingsOrDefaults(orgId);
      if (!settings.enabled) throw new InviteDisabled();

      const reason = input.qualifiedReason ?? null;
      const now = new Date();
      const updated = await db
        .update(inviteRelationships)
        .set({ qualifiedAt: now, qualifiedReason: reason })
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
            sql`${inviteRelationships.qualifiedAt} IS NULL`,
          ),
        )
        .returning();

      if (updated.length === 1) {
        const row = updated[0]!;
        if (events) {
          await events.emit("invite.qualified", {
            organizationId: orgId,
            endUserId: row.inviterEndUserId,
            inviterEndUserId: row.inviterEndUserId,
            inviteeEndUserId: row.inviteeEndUserId,
            qualifiedReason: row.qualifiedReason,
            qualifiedAt: row.qualifiedAt!,
            boundAt: row.boundAt,
          });
        }
        return { relationship: row, alreadyQualified: false };
      }

      // 0 rows — 区分"不存在"和"已 qualified"
      const [existing] = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, input.inviteeEndUserId),
          ),
        )
        .limit(1);
      if (!existing) throw new InviteeNotBound();
      return { relationship: existing, alreadyQualified: true };
    },
```

- [ ] **Step 8.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: PASS — 22 个 test（新增 4 个 qualify）

- [ ] **Step 8.5: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 8.6: Commit**

```bash
git add apps/server/src/modules/invite/service.ts apps/server/src/modules/invite/service.test.ts
git commit -m "feat(invite): service.qualify — 原子推进 + 幂等 + 事件"
```

---

## Task 9: Service — 查询方法（getSummary / listMyInvitees / admin list / stats / revoke / adminResetUserCode）

**Files:**
- Modify: `apps/server/src/modules/invite/service.ts`
- Modify: `apps/server/src/modules/invite/service.test.ts`

- [ ] **Step 9.1: 写失败测试**

打开 `service.test.ts`，在文件末尾追加：

```ts
describe("invite service — queries", () => {
  let events: ReturnType<typeof createEventBus>;
  let svc: ReturnType<typeof createInviteService>;
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-queries");
    events = createEventBus();
    svc = createInviteService({ db, events });
    // 种子数据：A 邀 X/Y/Z，X 被 qualify，Y 未被 qualify，Z 未被 qualify
    //           B 邀 M（单一关系）
    const { code: codeA } = await svc.getOrCreateMyCode(orgId, "A");
    const { code: codeB } = await svc.getOrCreateMyCode(orgId, "B");
    await svc.bind(orgId, { code: codeA, inviteeEndUserId: "X" });
    await svc.bind(orgId, { code: codeA, inviteeEndUserId: "Y" });
    await svc.bind(orgId, { code: codeA, inviteeEndUserId: "Z" });
    await svc.qualify(orgId, { inviteeEndUserId: "X", qualifiedReason: "purchase" });
    await svc.bind(orgId, { code: codeB, inviteeEndUserId: "M" });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getSummary 返回自己的码 + 邀请统计 + 被邀信息", async () => {
    const aSummary = await svc.getSummary(orgId, "A");
    expect(aSummary.boundCount).toBe(3);
    expect(aSummary.qualifiedCount).toBe(1);
    expect(aSummary.invitedBy).toBeNull();
    expect(aSummary.myCode).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);

    const xSummary = await svc.getSummary(orgId, "X");
    expect(xSummary.boundCount).toBe(0);
    expect(xSummary.qualifiedCount).toBe(0);
    expect(xSummary.invitedBy).not.toBeNull();
    expect(xSummary.invitedBy!.inviterEndUserId).toBe("A");
    expect(xSummary.invitedBy!.qualifiedAt).toBeInstanceOf(Date);
  });

  test("listMyInvitees 分页返回", async () => {
    const page1 = await svc.listMyInvitees(orgId, "A", { limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    const page2 = await svc.listMyInvitees(orgId, "A", { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(1);
  });

  test("adminListRelationships 全量 + 按 inviter 筛 + qualifiedOnly", async () => {
    const all = await svc.adminListRelationships(orgId, { limit: 100 });
    expect(all.total).toBe(4); // A:X,A:Y,A:Z,B:M

    const onlyA = await svc.adminListRelationships(orgId, {
      inviterEndUserId: "A",
      limit: 100,
    });
    expect(onlyA.total).toBe(3);

    const qualified = await svc.adminListRelationships(orgId, {
      qualifiedOnly: true,
      limit: 100,
    });
    expect(qualified.total).toBe(1);
    expect(qualified.items[0]!.inviteeEndUserId).toBe("X");
  });

  test("adminGetUserStats 与 getSummary 同结构", async () => {
    const stats = await svc.adminGetUserStats(orgId, "A");
    expect(stats.boundCount).toBe(3);
    expect(stats.qualifiedCount).toBe(1);
  });

  test("adminResetUserCode 轮换", async () => {
    const before = await svc.getOrCreateMyCode(orgId, "reset-target");
    const after = await svc.adminResetUserCode(orgId, "reset-target");
    expect(after.code).not.toBe(before.code);
  });

  test("adminRevokeRelationship 删行、UNIQUE 释放 → invitee 可重 bind", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-rv");
    const bound = await svc.bind(orgId, {
      code,
      inviteeEndUserId: "invitee-rv",
    });
    await svc.adminRevokeRelationship(orgId, bound.relationship.id);

    // 可重 bind
    const { code: code2 } = await svc.getOrCreateMyCode(orgId, "inviter-rv-2");
    const rebound = await svc.bind(orgId, {
      code: code2,
      inviteeEndUserId: "invitee-rv",
    });
    expect(rebound.relationship.inviterEndUserId).toBe("inviter-rv-2");
  });

  test("adminRevokeRelationship 不存在 → InviteRelationshipNotFound", async () => {
    await expect(
      svc.adminRevokeRelationship(orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 9.2: 跑测试确认失败**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: FAIL — `svc.getSummary is not a function`

- [ ] **Step 9.3: 实现查询方法**

编辑 `service.ts`，在 `qualify` 之后追加：

```ts
    /* ── 查询 ─────────────────────────────────────────────── */

    async getSummary(
      orgId: string,
      endUserId: string,
    ): Promise<InviteSummary> {
      const code = await this.getOrCreateMyCode(orgId, endUserId);

      const [boundResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        );

      const [qualifiedResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
            sql`${inviteRelationships.qualifiedAt} IS NOT NULL`,
          ),
        );

      const [invitedByRow] = await db
        .select({
          inviterEndUserId: inviteRelationships.inviterEndUserId,
          boundAt: inviteRelationships.boundAt,
          qualifiedAt: inviteRelationships.qualifiedAt,
        })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviteeEndUserId, endUserId),
          ),
        )
        .limit(1);

      return {
        myCode: code.code,
        myCodeRotatedAt: code.rotatedAt,
        boundCount: boundResult?.value ?? 0,
        qualifiedCount: qualifiedResult?.value ?? 0,
        invitedBy: invitedByRow ?? null,
      };
    },

    async listMyInvitees(
      orgId: string,
      endUserId: string,
      opts?: { limit?: number; offset?: number },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;

      const items = await db
        .select()
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        )
        .orderBy(desc(inviteRelationships.boundAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(
          and(
            eq(inviteRelationships.organizationId, orgId),
            eq(inviteRelationships.inviterEndUserId, endUserId),
          ),
        );

      return { items, total: totalResult?.value ?? 0 };
    },

    async adminListRelationships(
      orgId: string,
      opts?: {
        limit?: number;
        offset?: number;
        inviterEndUserId?: string;
        qualifiedOnly?: boolean;
      },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;

      const filters = [eq(inviteRelationships.organizationId, orgId)];
      if (opts?.inviterEndUserId) {
        filters.push(
          eq(inviteRelationships.inviterEndUserId, opts.inviterEndUserId),
        );
      }
      if (opts?.qualifiedOnly) {
        filters.push(sql`${inviteRelationships.qualifiedAt} IS NOT NULL`);
      }

      const items = await db
        .select()
        .from(inviteRelationships)
        .where(and(...filters))
        .orderBy(desc(inviteRelationships.boundAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ value: count() })
        .from(inviteRelationships)
        .where(and(...filters));

      return { items, total: totalResult?.value ?? 0 };
    },

    async adminGetUserStats(
      orgId: string,
      endUserId: string,
    ): Promise<InviteSummary> {
      // 与 client getSummary 同结构。如果将来要暴露更多字段再分叉。
      return this.getSummary(orgId, endUserId);
    },

    async adminResetUserCode(orgId: string, endUserId: string) {
      return this.resetCode(orgId, endUserId);
    },

    async adminRevokeRelationship(orgId: string, relationshipId: string) {
      let deleted: { id: string }[];
      try {
        deleted = await db
          .delete(inviteRelationships)
          .where(
            and(
              eq(inviteRelationships.id, relationshipId),
              eq(inviteRelationships.organizationId, orgId),
            ),
          )
          .returning({ id: inviteRelationships.id });
      } catch (err) {
        // id 列是 uuid —— 格式非法时 Postgres 抛 22P02
        if (isInvalidUuid(err)) throw new InviteRelationshipNotFound(relationshipId);
        throw err;
      }
      if (deleted.length === 0) {
        throw new InviteRelationshipNotFound(relationshipId);
      }
    },
```

并在文件尾 `export type InviteService` 之前新增 helper：

```ts
function isInvalidUuid(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { cause?: { code?: unknown } };
  if (e.cause && typeof e.cause === "object" && e.cause.code === "22P02") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("22P02");
}
```

- [ ] **Step 9.4: 跑测试确认通过**

```bash
pnpm --filter=server test src/modules/invite/service.test.ts
```

Expected: PASS — 29 个 test（新增 7 个 queries）

- [ ] **Step 9.5: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 9.6: Commit**

```bash
git add apps/server/src/modules/invite/service.ts apps/server/src/modules/invite/service.test.ts
git commit -m "feat(invite): service 查询方法 — summary/list/admin-stats/admin-revoke/admin-reset"
```

---

## Task 10: Admin Router

**Files:**
- Create: `apps/server/src/modules/invite/routes.ts`
- Create: `apps/server/src/modules/invite/routes.test.ts`

- [ ] **Step 10.1: 写 routes.ts**

创建 `apps/server/src/modules/invite/routes.ts`：

```ts
/**
 * Admin-facing routes for the invite module.
 *
 * Mounted at /api/invite in src/index.ts. Session cookie required;
 * organizationId is read from session.activeOrganizationId.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import { inviteService } from "./index";
import {
  AdminListRelationshipsQuerySchema,
  EndUserIdParamSchema,
  ErrorResponseSchema,
  InviteCodeViewSchema,
  InviteRelationshipListSchema,
  InviteRelationshipViewSchema,
  InviteSettingsViewSchema,
  InviteSummaryViewSchema,
  RelationshipIdParamSchema,
  UpsertInviteSettingsSchema,
} from "./validators";

const TAG = "Invite (Admin)";

function serializeSettings(row: {
  organizationId: string;
  enabled: boolean;
  codeLength: number;
  allowSelfInvite: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    organizationId: row.organizationId,
    enabled: row.enabled,
    codeLength: row.codeLength,
    allowSelfInvite: row.allowSelfInvite,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRelationship(row: {
  id: string;
  organizationId: string;
  inviterEndUserId: string;
  inviteeEndUserId: string;
  inviterCodeSnapshot: string;
  boundAt: Date;
  qualifiedAt: Date | null;
  qualifiedReason: string | null;
  metadata: unknown;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inviterEndUserId: row.inviterEndUserId,
    inviteeEndUserId: row.inviteeEndUserId,
    inviterCodeSnapshot: row.inviterCodeSnapshot,
    boundAt: row.boundAt.toISOString(),
    qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    qualifiedReason: row.qualifiedReason,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  };
}

function serializeSummary(s: {
  myCode: string;
  myCodeRotatedAt: Date | null;
  boundCount: number;
  qualifiedCount: number;
  invitedBy: { inviterEndUserId: string; boundAt: Date; qualifiedAt: Date | null } | null;
}) {
  return {
    myCode: s.myCode,
    myCodeRotatedAt: s.myCodeRotatedAt?.toISOString() ?? null,
    boundCount: s.boundCount,
    qualifiedCount: s.qualifiedCount,
    invitedBy: s.invitedBy
      ? {
          inviterEndUserId: s.invitedBy.inviterEndUserId,
          boundAt: s.invitedBy.boundAt.toISOString(),
          qualifiedAt: s.invitedBy.qualifiedAt?.toISOString() ?? null,
        }
      : null,
  };
}

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  403: {
    description: "Forbidden",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const inviteRouter = new OpenAPIHono<HonoEnv>();

inviteRouter.use("*", requireAuth);

inviteRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

/* ── GET /settings ────────────────────────────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    responses: {
      200: {
        description: "Current invite settings (or defaults if never upserted).",
        content: {
          "application/json": {
            schema: InviteSettingsViewSchema.nullable(),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await inviteService.getSettings(orgId);
    return c.json(row ? serializeSettings(row) : null, 200);
  },
);

/* ── PUT /settings ────────────────────────────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    request: {
      body: {
        content: { "application/json": { schema: UpsertInviteSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "Updated settings row.",
        content: {
          "application/json": { schema: InviteSettingsViewSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const row = await inviteService.upsertSettings(orgId, body);
    return c.json(serializeSettings(row), 200);
  },
);

/* ── GET /relationships ──────────────────────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "get",
    path: "/relationships",
    tags: [TAG],
    request: { query: AdminListRelationshipsQuerySchema },
    responses: {
      200: {
        description: "Paged invite relationships.",
        content: {
          "application/json": { schema: InviteRelationshipListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const query = c.req.valid("query");
    const { items, total } = await inviteService.adminListRelationships(orgId, {
      limit: query.limit,
      offset: query.offset,
      inviterEndUserId: query.inviterEndUserId,
      qualifiedOnly: query.qualifiedOnly,
    });
    return c.json(
      { items: items.map(serializeRelationship), total },
      200,
    );
  },
);

/* ── DELETE /relationships/:id ───────────────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "delete",
    path: "/relationships/{id}",
    tags: [TAG],
    request: { params: RelationshipIdParamSchema },
    responses: {
      204: { description: "Deleted." },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await inviteService.adminRevokeRelationship(orgId, id);
    return c.body(null, 204);
  },
);

/* ── GET /users/:endUserId/stats ─────────────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/stats",
    tags: [TAG],
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Summary for an end user.",
        content: { "application/json": { schema: InviteSummaryViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const summary = await inviteService.adminGetUserStats(orgId, endUserId);
    return c.json(serializeSummary(summary), 200);
  },
);

/* ── POST /users/:endUserId/reset-code ───────────────────── */

inviteRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/reset-code",
    tags: [TAG],
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "New code generated.",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const result = await inviteService.adminResetUserCode(orgId, endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt.toISOString(),
      },
      200,
    );
  },
);

// Suppress unused-import warning if `z` ends up not being referenced here.
void z;
```

- [ ] **Step 10.2: 写 routes.test.ts**

创建 `apps/server/src/modules/invite/routes.test.ts`。先参照现有 [apps/server/src/modules/friend/routes.test.ts](../../../apps/server/src/modules/friend/routes.test.ts) 的 pattern 拷 cookie-sign-up 的 bootstrap（或参照 [check-in/routes.test.ts](../../../apps/server/src/modules/check-in/routes.test.ts)）。写一个 happy path + 一个 401 + 一个 400：

```ts
/**
 * Route-layer tests for invite admin router.
 *
 * Thin: only covers HTTP edges — requireAuth 401, Zod 400, one happy path.
 * Business logic is exhaustively tested at service layer.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg, cleanupTestUser } from "../../testing/fixtures";

describe("invite admin routes", () => {
  const testEmail = `invite-routes-${crypto.randomUUID()}@example.com`;
  const testPassword = "test-password-123";
  let cookie = "";
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-routes");
    // sign up via Better Auth HTTP surface to get a real cookie
    const signupResp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Invite Routes Test",
      }),
    });
    if (signupResp.status !== 200) {
      throw new Error(
        `sign-up returned ${signupResp.status}: ${await signupResp.text()}`,
      );
    }
    const setCookie = signupResp.headers.get("set-cookie");
    if (!setCookie) throw new Error("sign-up did not set cookie");
    cookie = setCookie.split(";")[0]!;

    // Associate the freshly-created user to our test org via member row
    const { user, member } = await import("../../schema/auth");
    const { eq } = await import("drizzle-orm");
    const [u] = await db.select().from(user).where(eq(user.email, testEmail));
    if (!u) throw new Error("user not found after sign-up");
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: u.id,
      role: "owner",
      createdAt: new Date(),
    });
    // set active org on session
    const { session } = await import("../../schema/auth");
    await db
      .update(session)
      .set({ activeOrganizationId: orgId })
      .where(eq(session.userId, u.id));
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
    await cleanupTestUser(testEmail);
  });

  test("401 without cookie", async () => {
    const res = await app.request("/api/invite/settings");
    expect(res.status).toBe(401);
  });

  test("PUT /settings happy path", async () => {
    const res = await app.request("/api/invite/settings", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, codeLength: 8 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codeLength).toBe(8);
    expect(body.enabled).toBe(true);
  });

  test("PUT /settings 400 on invalid codeLength", async () => {
    const res = await app.request("/api/invite/settings", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ codeLength: 5 }),
    });
    expect(res.status).toBe(400);
  });
});
```

> **注**：上面 test 对 `app` 的 import 依赖 Task 12 的 mount。可以先把 `inviteRouter` mount 到 index.ts（Task 12 的工作提前一步），或把这部分 test 放到 Task 12 之后跑。取**提前 mount**方案——在实现 Task 12 前，先在 index.ts 里只加 import 和 `app.route("/api/invite", inviteRouter)` 这一行（两行），让 routes test 能跑。完整 barrel + registerEvent 依然在 Task 12 里做。

- [ ] **Step 10.3: index.ts 提前 mount admin router**

临时编辑 `apps/server/src/index.ts`：

1. 顶部 import 区加：

```ts
import { inviteRouter } from "./modules/invite/routes";
```

但此时 `routes.ts` 依赖 `./index` 的 `inviteService` singleton，**还没造**。先写一个 **最小 barrel** 让它能 compile：

创建 **临时** `apps/server/src/modules/invite/index.ts`（Task 12 会再扩展）：

```ts
import { deps } from "../../deps";
import { createInviteService } from "./service";

export { createInviteService };
export type { InviteService } from "./service";
export const inviteService = createInviteService(deps);
export { inviteRouter } from "./routes";
```

2. 编辑 `apps/server/src/index.ts`：

换一种 import 路径，避免两次改：

```ts
import { inviteRouter } from "./modules/invite";
```

并在现有 `app.route(...)` 堆里加一行：

```ts
app.route("/api/invite", inviteRouter);
```

（具体插入位置参考 `friend` / `check-in` 的 mount 顺序，按字母序或模块字母序排。）

- [ ] **Step 10.4: 跑 routes test**

```bash
pnpm --filter=server test src/modules/invite/routes.test.ts
```

Expected: PASS — 3 个 test

- [ ] **Step 10.5: 跑所有 invite test 做回归**

```bash
pnpm --filter=server test src/modules/invite/
```

Expected: 所有 test PASS（code 9 + service 29 + routes 3 = 41）

- [ ] **Step 10.6: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 10.7: Commit**

```bash
git add apps/server/src/modules/invite/routes.ts apps/server/src/modules/invite/routes.test.ts apps/server/src/modules/invite/index.ts apps/server/src/index.ts
git commit -m "feat(invite): admin router + minimal barrel + mount /api/invite"
```

---

## Task 11: Client Router（HMAC + Server-secret 混合认证）

**Files:**
- Create: `apps/server/src/modules/invite/client-routes.ts`
- Create: `apps/server/src/modules/invite/client-routes.test.ts`

- [ ] **Step 11.1: 写 client-routes.ts**

创建 `apps/server/src/modules/invite/client-routes.ts`：

```ts
/**
 * C-end client routes for the invite module.
 *
 * Mounted at /api/invite/client. Two auth flavors share the same
 * requireClientCredential middleware (which only validates publishable
 * key existence / enabled / expired) — each handler then calls the
 * appropriate verification method:
 *
 *   - HMAC flow  (my-code, summary, invitees, reset-my-code):
 *     handler calls clientCredentialService.verifyRequest(pk, endUserId, userHash).
 *     Used by the end user's client (browser / game client) proving its
 *     identity = endUserId via HMAC(endUserId, clientSecret).
 *
 *   - Server flow (bind, qualify):
 *     handler reads x-api-secret header and calls
 *     clientCredentialService.verifyServerRequest(pk, providedSecret).
 *     Used by the customer's own game server (it has the secret).
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { InvalidSecret } from "../client-credentials/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { inviteService } from "./index";
import {
  ClientBindBodySchema,
  ClientMyCodeQuerySchema,
  ClientQualifyBodySchema,
  ClientResetCodeBodySchema,
  ErrorResponseSchema,
  InviteCodeViewSchema,
  InviteRelationshipListSchema,
  InviteRelationshipViewSchema,
  InviteSummaryViewSchema,
  PaginationQuerySchema,
} from "./validators";

const TAG = "Invite (Client)";

function serializeRelationship(row: {
  id: string;
  organizationId: string;
  inviterEndUserId: string;
  inviteeEndUserId: string;
  inviterCodeSnapshot: string;
  boundAt: Date;
  qualifiedAt: Date | null;
  qualifiedReason: string | null;
  metadata: unknown;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inviterEndUserId: row.inviterEndUserId,
    inviteeEndUserId: row.inviteeEndUserId,
    inviterCodeSnapshot: row.inviterCodeSnapshot,
    boundAt: row.boundAt.toISOString(),
    qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    qualifiedReason: row.qualifiedReason,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  };
}

function serializeSummary(s: {
  myCode: string;
  myCodeRotatedAt: Date | null;
  boundCount: number;
  qualifiedCount: number;
  invitedBy: { inviterEndUserId: string; boundAt: Date; qualifiedAt: Date | null } | null;
}) {
  return {
    myCode: s.myCode,
    myCodeRotatedAt: s.myCodeRotatedAt?.toISOString() ?? null,
    boundCount: s.boundCount,
    qualifiedCount: s.qualifiedCount,
    invitedBy: s.invitedBy
      ? {
          inviterEndUserId: s.invitedBy.inviterEndUserId,
          boundAt: s.invitedBy.boundAt.toISOString(),
          qualifiedAt: s.invitedBy.qualifiedAt?.toISOString() ?? null,
        }
      : null,
  };
}

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  403: {
    description: "Forbidden",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const inviteClientRouter = new OpenAPIHono<HonoEnv>();

inviteClientRouter.use("*", requireClientCredential);

inviteClientRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

/* ── GET /my-code (HMAC flow) ─────────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/my-code",
    tags: [TAG],
    request: { query: ClientMyCodeQuerySchema },
    responses: {
      200: {
        description: "Current invite code (generated on first call).",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const orgId = cred.organizationId;
    const result = await inviteService.getOrCreateMyCode(orgId, endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt?.toISOString() ?? null,
      },
      200,
    );
  },
);

/* ── POST /reset-my-code (HMAC flow) ─────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/reset-my-code",
    tags: [TAG],
    request: {
      body: {
        content: { "application/json": { schema: ClientResetCodeBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Rotated invite code.",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const body = c.req.valid("json");
    await clientCredentialService.verifyRequest(cred.publishableKey, body.endUserId, body.userHash);
    const result = await inviteService.resetCode(cred.organizationId, body.endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt.toISOString(),
      },
      200,
    );
  },
);

/* ── GET /summary (HMAC flow) ─────────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/summary",
    tags: [TAG],
    request: { query: ClientMyCodeQuerySchema },
    responses: {
      200: {
        description: "Summary for the end user.",
        content: { "application/json": { schema: InviteSummaryViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const summary = await inviteService.getSummary(cred.organizationId, endUserId);
    return c.json(serializeSummary(summary), 200);
  },
);

/* ── GET /invitees (HMAC flow) ────────────────────────────── */

const InviteesQuerySchema = ClientMyCodeQuerySchema.merge(PaginationQuerySchema);

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/invitees",
    tags: [TAG],
    request: { query: InviteesQuerySchema },
    responses: {
      200: {
        description: "Paged list of users this end user has invited.",
        content: { "application/json": { schema: InviteRelationshipListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash, limit, offset } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const { items, total } = await inviteService.listMyInvitees(
      cred.organizationId,
      endUserId,
      { limit, offset },
    );
    return c.json({ items: items.map(serializeRelationship), total }, 200);
  },
);

/* ── POST /bind (Server flow) ─────────────────────────────── */

async function requireServerSecret(c: Parameters<Parameters<typeof inviteClientRouter.openapi>[1]>[0]) {
  const cred = c.get("clientCredential")!;
  const providedSecret = c.req.header("x-api-secret");
  if (!providedSecret) throw new InvalidSecret();
  await clientCredentialService.verifyServerRequest(cred.publishableKey, providedSecret);
  return cred.organizationId;
}

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/bind",
    tags: [TAG],
    request: {
      headers: z.object({
        "x-api-secret": z.string().openapi({
          description: "Client secret (csk_...). Required for server-to-server calls.",
        }),
      }),
      body: {
        content: { "application/json": { schema: ClientBindBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Relationship bound (or existing for idempotent bind).",
        content: {
          "application/json": {
            schema: z
              .object({
                relationship: InviteRelationshipViewSchema,
                alreadyBound: z.boolean(),
              })
              .openapi("BindResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = await requireServerSecret(c);
    const body = c.req.valid("json");
    const { relationship, alreadyBound } = await inviteService.bind(orgId, body);
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyBound },
      200,
    );
  },
);

/* ── POST /qualify (Server flow) ──────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/qualify",
    tags: [TAG],
    request: {
      headers: z.object({
        "x-api-secret": z.string().openapi({
          description: "Client secret (csk_...). Required for server-to-server calls.",
        }),
      }),
      body: {
        content: { "application/json": { schema: ClientQualifyBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Relationship qualified (or existing for idempotent qualify).",
        content: {
          "application/json": {
            schema: z
              .object({
                relationship: InviteRelationshipViewSchema,
                alreadyQualified: z.boolean(),
              })
              .openapi("QualifyResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = await requireServerSecret(c);
    const body = c.req.valid("json");
    const { relationship, alreadyQualified } = await inviteService.qualify(orgId, body);
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyQualified },
      200,
    );
  },
);
```

- [ ] **Step 11.2: 更新 barrel 导出 client router**

编辑 `apps/server/src/modules/invite/index.ts`：

```ts
import { deps } from "../../deps";
import { createInviteService } from "./service";

export { createInviteService };
export type { InviteService } from "./service";
export const inviteService = createInviteService(deps);
export { inviteRouter } from "./routes";
export { inviteClientRouter } from "./client-routes";
```

- [ ] **Step 11.3: mount client router**

编辑 `apps/server/src/index.ts` — import 和 mount：

```ts
// 顶部 import 区（或合并到 Task 10 那行）
import { inviteRouter, inviteClientRouter } from "./modules/invite";

// app.route 堆里增加
app.route("/api/invite", inviteRouter);
app.route("/api/invite/client", inviteClientRouter);
```

> 如果 Task 10 已经写了 `import { inviteRouter } from "./modules/invite"` 和 `app.route("/api/invite", ...)`，这里改成 **合并 import** + **新增一行** mount client。

- [ ] **Step 11.4: 写 client-routes.test.ts**

创建 `apps/server/src/modules/invite/client-routes.test.ts`：

```ts
/**
 * Route-layer tests for invite client router.
 *
 * Covers:
 *  - 401 missing x-api-key
 *  - HMAC happy path for /my-code
 *  - Server-secret happy path for /bind
 *  - 400 Zod for /bind
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { clientCredentialService } from "../client-credentials";

describe("invite client routes", () => {
  let orgId: string;
  let publishableKey: string;
  let secret: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-client-routes");
    // devMode=true so we don't have to compute HMAC in tests
    const created = await clientCredentialService.create(orgId, {
      name: "invite-client-test",
    });
    publishableKey = created.publishableKey;
    secret = created.secret;
    await clientCredentialService.updateDevMode(orgId, created.id, true);
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("401 without x-api-key", async () => {
    const res = await app.request(
      "/api/invite/client/my-code?endUserId=u1",
    );
    expect(res.status).toBe(401);
  });

  test("GET /my-code in devMode returns code", async () => {
    const res = await app.request(
      "/api/invite/client/my-code?endUserId=u1",
      { headers: { "x-api-key": publishableKey } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(
      /^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/,
    );
  });

  test("POST /bind with correct secret returns relationship", async () => {
    // Get an inviter code first
    const codeRes = await app.request(
      "/api/invite/client/my-code?endUserId=inviter-1",
      { headers: { "x-api-key": publishableKey } },
    );
    const { code } = await codeRes.json();

    const bindRes = await app.request("/api/invite/client/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-api-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code, inviteeEndUserId: "invitee-1" }),
    });
    expect(bindRes.status).toBe(200);
    const body = await bindRes.json();
    expect(body.alreadyBound).toBe(false);
    expect(body.relationship.inviterEndUserId).toBe("inviter-1");
  });

  test("POST /bind 400 on missing code", async () => {
    const res = await app.request("/api/invite/client/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-api-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ inviteeEndUserId: "invitee-2" }),
    });
    expect(res.status).toBe(400);
  });

  // Note: devMode bypasses HMAC and server-secret both. Testing the real
  // verification paths (HMAC mismatch → 401, secret mismatch → 401) is
  // covered in service-layer tests. Here we only care about HTTP wiring.
});

// Suppress unused-import warning if we don't need db directly.
void db;
```

- [ ] **Step 11.5: 跑测试**

```bash
pnpm --filter=server test src/modules/invite/client-routes.test.ts
```

Expected: PASS — 4 个 test

- [ ] **Step 11.6: 全模块回归**

```bash
pnpm --filter=server test src/modules/invite/
```

Expected: 所有 test PASS（code 9 + service 29 + routes 3 + client-routes 4 = 45）

- [ ] **Step 11.7: lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 11.8: Commit**

```bash
git add apps/server/src/modules/invite/client-routes.ts apps/server/src/modules/invite/client-routes.test.ts apps/server/src/modules/invite/index.ts apps/server/src/index.ts
git commit -m "feat(invite): client router — HMAC(my-code/reset/summary/invitees) + Server(bind/qualify)"
```

---

## Task 12: Barrel — registerEvent + 完整 integration

**Files:**
- Modify: `apps/server/src/modules/invite/index.ts`

- [ ] **Step 12.1: 检查 event-registry 使用模式**

查看任一已登记事件的模块 barrel（例如 `apps/server/src/modules/check-in/index.ts` 或 `apps/server/src/modules/friend/index.ts`）确认 `registerEvent` 的调用格式。

- [ ] **Step 12.2: 扩展 barrel 加 registerEvent**

编辑 `apps/server/src/modules/invite/index.ts`，改为：

```ts
import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { createInviteService } from "./service";

// ─── 事件登记（运行时 schema，给 admin 查看 + task forwarder 使用）───
// 必须在 barrel 顶部执行，因为 task barrel 会在我们之后 import
// 并扫描 registry。
registerEvent({
  name: "invite.bound",
  owner: "invite",
  description: "邀请关系建立：B 注册并提交 inviter 码。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    {
      path: "endUserId",
      type: "string",
      required: true,
      description: "inviter 的 endUserId（task 进度归属）",
    },
    { path: "inviterEndUserId", type: "string", required: true },
    { path: "inviteeEndUserId", type: "string", required: true },
    { path: "code", type: "string", required: true, description: "人类可读形式 ABCD-EFGH" },
    { path: "boundAt", type: "string", required: true },
  ],
  forwardToTask: true,
});

registerEvent({
  name: "invite.qualified",
  owner: "invite",
  description: "邀请关系被客户方认定算数：B 达到里程碑 / 付费 / 留存 …",
  fields: [
    { path: "organizationId", type: "string", required: true },
    {
      path: "endUserId",
      type: "string",
      required: true,
      description: "inviter 的 endUserId（task 进度归属）",
    },
    { path: "inviterEndUserId", type: "string", required: true },
    { path: "inviteeEndUserId", type: "string", required: true },
    { path: "qualifiedReason", type: "string", required: false, description: "客户方上报的原因（例 first_purchase）" },
    { path: "qualifiedAt", type: "string", required: true },
    { path: "boundAt", type: "string", required: true },
  ],
  forwardToTask: true,
});

export { createInviteService };
export type { InviteService } from "./service";
export const inviteService = createInviteService(deps);
export { inviteRouter } from "./routes";
export { inviteClientRouter } from "./client-routes";
```

- [ ] **Step 12.3: 确认 index.ts 的 import 顺序**

检查 `apps/server/src/index.ts` —— **invite barrel 必须在 task barrel 之前 import**，否则 task 的 event-forwarder 扫描 registry 时看不到 invite 事件。

打开 [apps/server/src/index.ts](../../../apps/server/src/index.ts)，找到 `./modules/task` 的 import 行，确认 `./modules/invite` 的 import 在它**之前**。如果不是，调整顺序。

（参考 [apps/server/src/modules/task/event-forwarder.ts](../../../apps/server/src/modules/task/event-forwarder.ts) 头部的注释说明了这个排序要求。）

- [ ] **Step 12.4: 冒烟集成测试 — 启动 dev server**

```bash
pnpm --filter=server dev &
sleep 5
curl -s http://localhost:8787/openapi.json | grep -o '"/api/invite[^"]*"' | sort -u
```

Expected: 看到以下路径（顺序不重要）：

```
"/api/invite/client/bind"
"/api/invite/client/invitees"
"/api/invite/client/my-code"
"/api/invite/client/qualify"
"/api/invite/client/reset-my-code"
"/api/invite/client/summary"
"/api/invite/relationships"
"/api/invite/relationships/{id}"
"/api/invite/settings"
"/api/invite/users/{endUserId}/reset-code"
"/api/invite/users/{endUserId}/stats"
```

Kill dev server：

```bash
pkill -f "wrangler dev"
```

- [ ] **Step 12.5: 全项目回归**

```bash
pnpm --filter=server test
```

Expected: 所有 test PASS（含 invite 45 个 + 其他模块原有测试）

- [ ] **Step 12.6: 全项目 lint + typecheck**

```bash
pnpm --filter=server lint && pnpm --filter=server check-types
```

Expected: 0 error

- [ ] **Step 12.7: 手工验证 event-registry 已登记**

```bash
pnpm --filter=server test -t "event-catalog"
```

Expected: 原有 event-catalog tests 仍 PASS。若有"invite.bound / invite.qualified 必须被登记"类的 assertion，它们会因新事件出现而通过/调整。

（如果 event-catalog test 对 registry 内容做了硬编码断言，可能需要按模块增列表更新。对这种情况，就在同一个 commit 里一起改 test 期望。）

- [ ] **Step 12.8: Commit**

```bash
git add apps/server/src/modules/invite/index.ts apps/server/src/index.ts
git commit -m "feat(invite): 完整 barrel + registerEvent invite.bound/qualified"
```

---

## Self-Review（完成后跑一遍）

这是 plan 作者完成 plan 后自查用的——执行时不必重跑。

### 1. Spec 覆盖审计

| Spec 章节 | Plan 位置 |
|---|---|
| §3 数据模型 (3.1/3.2/3.3) | Task 2 |
| §4 邀请码生成 | Task 1 |
| §5.1 bind 原子写 + 幂等 | Task 7 |
| §5.2 qualify 原子推进 + 幂等 | Task 8 |
| §5.3 Settings / 禁用态 | Task 5 + bind/qualify 内部检查 (Task 7/8) |
| §6.1 invite.bound 事件 | Task 7 (emit) + Task 12 (register) |
| §6.2 invite.qualified 事件 | Task 8 (emit) + Task 12 (register) |
| §7.1 Admin Router | Task 10 |
| §7.2 Client Router (HMAC + Server 双模式) | Task 11 |
| §7.3 client-credentials 扩展 verifyServerRequest | Task 4 |
| §8 Zod validators | Task 3 |
| §9 错误矩阵 | Task 3 (errors.ts) |
| §10 测试策略 | 各 Task 内的 test step |
| §12 迁移流程 | Task 2 |

**无遗漏。**

### 2. Placeholder 扫描

- 无 "TBD" / "TODO" / "implement later"
- 无 "add appropriate error handling"
- 所有 test step 都有具体 expect 断言
- 所有 implementation step 都有完整代码块
- 无 "similar to Task N" 占位

### 3. 类型一致性

- `getOrCreateMyCode` 返回 `{ code: string; rotatedAt: Date | null }` — 在 code.ts 测试、service.ts 实现、routes.ts 序列化、client-routes.ts 序列化里一致
- `bind` 返回 `{ relationship, alreadyBound }` —— service test + client-routes test + client-routes.ts 序列化一致
- `InviteSummary.invitedBy.qualifiedAt` 是 `Date | null`，HTTP 层都用 `?.toISOString() ?? null` 统一
- event payload schema 在 service.ts 的 `declare module` 和 barrel 的 `registerEvent` 的 field 列表一致（`organizationId / endUserId / inviterEndUserId / inviteeEndUserId / code / boundAt` vs 加 `qualifiedReason / qualifiedAt`）

### 4. 其他

- 所有 commit 信息用中文（符合项目最近提交风格和用户偏好）
- Task 9 引入的 `isInvalidUuid` helper 放在 service.ts 尾部；Task 10 的 `adminRevokeRelationship` HTTP 层期望 `RelationshipIdParamSchema` 用了 `z.string().uuid()` 做前置校验 → 多数非法 uuid 在 Zod 阶段 400 掉，service 的 22P02 fallback 只是兜底。一致。

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-19-invite-system.md](../plans/2026-04-19-invite-system.md). Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
