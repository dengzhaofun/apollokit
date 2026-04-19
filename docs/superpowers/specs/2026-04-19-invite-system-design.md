# 邀请系统（referral）设计 — 2026-04-19

> 模块路径：`apps/server/src/modules/invite/`  
> Schema 路径：`apps/server/src/schema/invite.ts`  
> 表前缀：`invite_*`

---

## 1. 目标与非目标

### 目标

- 老玩家 A 在客户方游戏里拿到一个唯一、人类可读的 **邀请码**；分享给新玩家 B。
- B 在客户方游戏完成注册时把码填进去，客户方游戏服务器调我们的 **`POST /bind`** → 落邀请关系 + 发事件 `invite.bound`。
- 客户方服务器在它自己认定"这个邀请算数了"（付费 / 等级 / 留存 …）时调 **`POST /qualify`** → 幂等推进 `qualified_at` + 发事件 `invite.qualified`。
- 奖励发放 **不在本模块内**；由租户在 `task` 模块订阅 `invite.*` 事件配置阶梯奖励（邀 1/3/10 人分别给什么 item/entity/currency）。

### 非目标

- 不做注册 / 登录本身——apollokit 不托管终端用户身份。
- 不做归因分析 / 多渠道（Twitter vs 微信）——客户方要做自己挂 analytics。
- 不做奖励配置——统一走 `task` 模块，本模块只发事件。
- 不做 IP / 设备指纹 / qualify 超时冻结——客户方风控自理，他们在 qualify 之前自己判断。
- 不做跨模块"邀请加入公会/队伍"——那些是 `guild` / `team` 各自的 pending-request 语义，不抽象。
- 不做邀请码的审计历史——符合项目 "event history 归统一行为日志" 的约定；本模块只存**当前状态**。

---

## 2. 架构总览

```
客户方游戏 UI
    │ 显示 A 的码
    │
    ▼
客户方游戏服务器 ──(x-api-key + x-api-secret, server-to-server)──►  POST /api/invite/client/bind
                                                                      POST /api/invite/client/qualify

B 的游戏客户端  ──(x-api-key + userHash(endUserId, secret))────────►  GET  /api/invite/client/my-code
                                                                      GET  /api/invite/client/summary
                                                                      POST /api/invite/client/reset-my-code

apollokit admin ──(session cookie + org)────────────────────────────►  /api/invite/settings
                                                                       /api/invite/relationships
                                                                       /api/invite/users/:id/stats
                                                                       /api/invite/users/:id/reset-code
                                                                       DELETE /api/invite/relationships/:id
```

**依赖关系（单向 pub/sub）**：

```
invite.service  ─► events.emit("invite.bound" | "invite.qualified")
invite/index.ts ─► registerEvent(...)   (event-registry)

                                    (event-bus)

task/event-forwarder  ◄─ 自动订阅 registry 里 forwardToTask !== false 的事件
                         → taskService.processEvent(...)
```

invite **不 import task**。删掉 task 模块，invite 仍能独立运行（只是没有自动奖励）。

---

## 3. 数据模型

### 3.1 `invite_settings`（租户级配置）

| 列 | 类型 | 约束 |
|---|---|---|
| `organization_id` | text | **PK**，FK → `organization.id` ON DELETE CASCADE |
| `enabled` | boolean | NOT NULL DEFAULT true |
| `code_length` | integer | NOT NULL DEFAULT 8（必须是 4 的倍数 + ≥ 4 + ≤ 24；service 层校验） |
| `allow_self_invite` | boolean | NOT NULL DEFAULT false |
| `metadata` | jsonb | nullable |
| `created_at` / `updated_at` | timestamp | 标准 |

租户没 upsert 过 → service 层返回默认值（不落行）。符合 check-in / friend 的 `getSettingsOrDefaults` 模式。

### 3.2 `invite_codes`（一人一码，仅存当前 active）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | text (uuid) | PK, default `crypto.randomUUID()` |
| `organization_id` | text | NOT NULL, FK → `organization.id` ON DELETE CASCADE |
| `end_user_id` | text | NOT NULL |
| `code` | text | NOT NULL，**normalized 大写、不含分隔符**（API 层返回时再加 `-`） |
| `rotated_at` | timestamp | nullable（首次生成 = null，每次 reset 更新） |
| `created_at` / `updated_at` | timestamp | 标准 |

索引：

- `UNIQUE (organization_id, end_user_id)` — 一人一码
- `UNIQUE (organization_id, code)` — 同租户码不重
- 跨租户码可以相同（不放 `UNIQUE (code)`）

**reset 语义 = UPDATE 该行的 `code` 和 `rotated_at`**，不保留历史。需要审计历史请等统一行为日志。

**reset 后旧码立即失效**：`lookupByCode` 只查当前 active 码，旧码的 `bind` 请求会返回 `InviteCodeNotFound`。已存在的关系不受影响（因为 `inviter_code_snapshot` 快照了绑定时的码）。这是 reset 的安全语义——A 的码被撒到公网，reset 后薅羊毛者拿旧码已无法 bind。

### 3.3 `invite_relationships`（邀请关系）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | text (uuid) | PK |
| `organization_id` | text | NOT NULL, FK CASCADE |
| `inviter_end_user_id` | text | NOT NULL |
| `invitee_end_user_id` | text | NOT NULL |
| `inviter_code_snapshot` | text | NOT NULL — 绑定瞬间把 inviter 当时的 code 拷进来；后续 inviter reset 不影响该行 |
| `bound_at` | timestamp | NOT NULL DEFAULT now() |
| `qualified_at` | timestamp | nullable |
| `qualified_reason` | text | nullable — 客户方在 qualify 调用时传的字符串（例 `"first_purchase"`, `"level_10"`） |
| `metadata` | jsonb | nullable |
| `created_at` / `updated_at` | timestamp | 标准 |

索引 / 约束：

- `UNIQUE (organization_id, invitee_end_user_id)` — **强约束，一个 invitee 全租户只能被邀一次**
- `INDEX (organization_id, inviter_end_user_id, bound_at DESC)` — 查某个 inviter 邀了哪些人
- `CHECK (inviter_end_user_id <> invitee_end_user_id)` — DB 层兜底防自邀

> **设计决策：`inviter_code_snapshot` 为什么不用 FK 指回 `invite_codes.code`？**  
> 因为 `invite_codes.code` 会因 reset 而变。FK 意味着 reset 时要么级联改所有历史行、要么 reset 被阻断。两者都不合理——历史关系是不可变的事实，**存快照**是最干净的做法。`invite_codes` 只表达"当前 active 码"，关系表自己记录"当时用的哪个码"。

---

## 4. 邀请码生成

**自己实现，不引入 `nanoid`。** 项目 CLAUDE.md 明令 *"IDs — `crypto.randomUUID()`, nothing else. Do NOT add `uuid` or `nanoid`"*。

放在 `modules/invite/code.ts`，参照 [apps/server/src/lib/cdkey-code.ts](apps/server/src/lib/cdkey-code.ts) 的形状（但不复用——两个模块的默认长度和未来演进方向不一定一样，过早抽象反而耦合）：

```ts
// 32 字符字母表，去掉歧义字符 0 / 1 / I / L / O
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 生成 `length` 位的 normalized 码（无分隔符），要求 length 是 4 的倍数。*/
export function generateInviteCode(length = 8): string;

/** 人类展示用，按 4 位一段加 `-`: ABCDEFGH -> ABCD-EFGH */
export function formatInviteCode(normalized: string): string;

/** 用户输入归一化：去空白、大写、去 `-`。*/
export function normalizeInviteCode(raw: string): string;

/** 合法性检查（仅看字符集和长度），不查 DB。*/
export function isWellFormedInviteCode(raw: string): boolean;
```

冲突处理：service 层 `try { insert } catch (uniqueViolation) { retry }`，最多 3 次；超 3 次说明码空间/长度有问题（32^8 ≈ 1.1×10^12，正常不可能）。

**长度**：默认 8。`invite_settings.code_length` 允许租户调整（4–24、4 的倍数）。调整后只对新生成的码生效，已有码不回填。

---

## 5. Service 层（protocol-agnostic）

```ts
type InviteDeps = Pick<AppDeps, "db" | "events" | "eventCatalog">;

export function createInviteService(d: InviteDeps) {
  return {
    // ── settings ─────────────────────────────────────
    getSettings(orgId): Promise<InviteSettingsRow | null>,
    upsertSettings(orgId, input): Promise<InviteSettingsRow>,

    // ── 邀请码（一人一码） ───────────────────────────
    getOrCreateMyCode(orgId, endUserId): Promise<{ code: string; rotatedAt: Date | null }>,
    resetCode(orgId, endUserId): Promise<{ code: string; rotatedAt: Date }>,
    lookupByCode(orgId, code): Promise<{ endUserId: string } | null>,

    // ── 邀请关系 ─────────────────────────────────────
    bind(orgId, input: {
      code: string;
      inviteeEndUserId: string;
    }): Promise<{ relationship: RelationshipRow; alreadyBound: boolean }>,

    qualify(orgId, input: {
      inviteeEndUserId: string;
      qualifiedReason?: string | null;
    }): Promise<{ relationship: RelationshipRow; alreadyQualified: boolean }>,

    // ── 查询 ─────────────────────────────────────────
    getSummary(orgId, endUserId): Promise<{
      myCode: string;
      myCodeRotatedAt: Date | null;
      boundCount: number;      // 我邀了多少人 (relationship 数)
      qualifiedCount: number;  // 其中多少已 qualified
      invitedBy: { inviterEndUserId: string; boundAt: Date; qualifiedAt: Date | null } | null;
    }>,

    listMyInvitees(orgId, endUserId, opts?: { limit?: number; offset?: number }):
      Promise<{ items: RelationshipRow[]; total: number }>,

    // ── admin ────────────────────────────────────────
    adminListRelationships(orgId, opts?: {
      limit?: number;
      offset?: number;
      inviterEndUserId?: string;
      qualifiedOnly?: boolean;
    }): Promise<{ items: RelationshipRow[]; total: number }>,

    adminGetUserStats(orgId, endUserId): ReturnType<ReturnType<typeof createInviteService>["getSummary"]>,
    adminResetUserCode(orgId, endUserId): Promise<{ code: string; rotatedAt: Date }>,
    adminRevokeRelationship(orgId, relationshipId): Promise<void>,
    // ── 撤销语义：DELETE 行，invitee 的 UNIQUE 释放，可被重新 bind。
    //    不发补偿事件——task 模块已经发过的进度是既成事实，让租户自己决定要不要在 task 里手动回滚。
  };
}
```

### 5.1 关键路径 — `bind` 的原子写

Neon HTTP 驱动无 transaction（CLAUDE.md 约束）。用单条 `INSERT … ON CONFLICT DO NOTHING RETURNING` 搭配事后 SELECT 判定幂等：

```sql
-- 第 1 步：解析 code → inviter_end_user_id（单条 SELECT）
-- 第 2 步：原子插入
INSERT INTO invite_relationships
  (organization_id, inviter_end_user_id, invitee_end_user_id, inviter_code_snapshot)
VALUES ($org, $inviter, $invitee, $codeSnapshot)
ON CONFLICT (organization_id, invitee_end_user_id) DO NOTHING
RETURNING *, (xmax = 0) AS inserted;
```

- 返回 0 行 → invitee 已被某 inviter 绑过。再 SELECT 一次拿到已有行：
  - 若已有 `inviter_end_user_id === $inviter` → **200 幂等**，返回已有行 + `alreadyBound: true`，**不再发事件**。
  - 若已有 `inviter_end_user_id !== $inviter` → 抛 `InviteAlreadyBound`（409）。
- 返回 1 行 `inserted=true` → 新建成功，发 `invite.bound` 事件，`alreadyBound: false`。

**防自邀**：service 在 `lookupByCode` 之后、`insert` 之前做 `if (inviter === invitee && !settings.allowSelfInvite) throw SelfInviteForbidden`；DB 层 `CHECK` 兜底。

> **`allowSelfInvite=true` 的副作用**：A 自邀成功后，invitee=A 这一行占用了 `(org, invitee=A)` 唯一约束。若后续真有 C 想邀请 A，会被挡成 `InviteAlreadyBound`。这个坑交给租户自己评估——默认 `false` 时不会出现。

### 5.2 关键路径 — `qualify` 的原子推进

```sql
UPDATE invite_relationships
SET qualified_at = now(),
    qualified_reason = $reason,
    updated_at = now()
WHERE organization_id = $org
  AND invitee_end_user_id = $invitee
  AND qualified_at IS NULL
RETURNING *;
```

- 返回 1 行 → 第一次 qualify 成功，发 `invite.qualified` 事件。
- 返回 0 行 → 再 SELECT 一次：
  - 行存在、`qualified_at` 非 null → **200 幂等**，`alreadyQualified: true`，不发事件。
  - 行不存在 → 抛 `InviteeNotBound`（404）。

### 5.3 Settings / 禁用态

每次 `bind` 前 `getSettingsOrDefaults(orgId)`；`settings.enabled === false` → 抛 `InviteDisabled`（403），不落关系、不发事件。`qualify` 同样检查——禁用后不能追发奖励。

---

## 6. 事件（event-bus / event-registry）

两个事件都在 `modules/invite/index.ts` 用 `registerEvent` 登记，`forwardToTask: true`。

### 6.1 `invite.bound`

```ts
"invite.bound": {
  organizationId: string;
  endUserId: string;           // = inviterEndUserId（task 以 endUserId 做进度归属）
  inviterEndUserId: string;
  inviteeEndUserId: string;
  code: string;                // 人类可读形式（带 `-`）
  boundAt: Date;
}
```

用途：task 规则可订阅 `invite.bound` 做 "每邀 1 人注册送 10 金币"（无门槛立刻发）。

### 6.2 `invite.qualified`

```ts
"invite.qualified": {
  organizationId: string;
  endUserId: string;           // = inviterEndUserId
  inviterEndUserId: string;
  inviteeEndUserId: string;
  qualifiedReason: string | null;
  qualifiedAt: Date;
  boundAt: Date;
}
```

用途（主流）：task 规则订阅 `invite.qualified` 做阶梯奖励（邀 1/3/10 人有效送不同礼包）。租户可以用 task filter 表达式二次过滤：

```
filter: qualifiedReason == "first_purchase"
```

### 6.3 event-registry 字段 schema

```ts
registerEvent({
  name: "invite.bound",
  owner: "invite",
  description: "邀请关系建立（B 注册并提交 inviter 码）",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId",      type: "string", required: true, description: "inviter 的 endUserId（task 进度归属）" },
    { path: "inviterEndUserId", type: "string", required: true },
    { path: "inviteeEndUserId", type: "string", required: true },
    { path: "code", type: "string", required: true },
    { path: "boundAt", type: "string", required: true },
  ],
  forwardToTask: true,
});
// invite.qualified 类似
```

---

## 7. HTTP 层

### 7.1 Admin Router（`/api/invite`，`requireAuth`）

| Method | Path | Handler |
|---|---|---|
| GET | `/settings` | `svc.getSettings(orgId)` |
| PUT | `/settings` | `svc.upsertSettings(orgId, body)` |
| GET | `/relationships?limit&offset&inviterEndUserId&qualifiedOnly` | `svc.adminListRelationships(...)` |
| DELETE | `/relationships/:id` | `svc.adminRevokeRelationship(orgId, id)` |
| GET | `/users/:endUserId/stats` | `svc.adminGetUserStats(orgId, endUserId)` |
| POST | `/users/:endUserId/reset-code` | `svc.adminResetUserCode(orgId, endUserId)` |

### 7.2 Client Router（`/api/invite/client`，`requireClientCredential`）

两种 handler-level 验证模式共存（参照 client-credential service 已有能力）：

- **HMAC 模式**（client-to-server，B 的浏览器 / 游戏客户端直接调）：handler 里 `await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash)` → devMode 绕过。
- **Server 模式**（client-to-server 真的是客户方游戏服务器调）：handler 要求额外 header `x-api-secret: csk_...`，通过一个新增的 `clientCredentialService.verifyServerRequest(publishableKey, providedSecret)` 做 constant-time 明文比对。devMode 同样绕过。

| Method | Path | 认证 | Handler |
|---|---|---|---|
| GET | `/my-code?endUserId&userHash` | HMAC | `svc.getOrCreateMyCode(orgId, endUserId)` |
| POST | `/reset-my-code` body `{endUserId, userHash}` | HMAC | `svc.resetCode(orgId, endUserId)` |
| GET | `/summary?endUserId&userHash` | HMAC | `svc.getSummary(orgId, endUserId)` |
| GET | `/invitees?endUserId&userHash&limit&offset` | HMAC | `svc.listMyInvitees(...)` |
| POST | `/bind` body `{code, inviteeEndUserId}` + header `x-api-secret` | Server | `svc.bind(orgId, body)` |
| POST | `/qualify` body `{inviteeEndUserId, qualifiedReason?}` + header `x-api-secret` | Server | `svc.qualify(orgId, body)` |

> **为什么 bind / qualify 用 secret 而不是 HMAC？**  
> HMAC 的身份含义是 "我证明我就是 endUserId 这个终端用户"，需要 endUserId + secret 混算。但 bind 调用时 **B 还没有任何与我们的上下文**，他的游戏客户端不知道 secret；而 bind 的事实发起方是**客户方游戏服务器**（它既有 secret，也是整个邀请关系的信任锚）。对"服务器级"调用要求明文 secret 比"伪装成某个 endUserId 的 HMAC"语义清晰。

### 7.3 需要扩展 `clientCredentialService`

在 `modules/client-credentials/service.ts` 加一个方法（不是 invite 模块内的，是给 invite 复用）：

```ts
async verifyServerRequest(
  publishableKey: string,
  providedSecret: string,
): Promise<VerifyResult> {
  // 查 cred、检查 enabled/expired
  // devMode → return ok
  // decrypt stored secret → timingSafeEqual(stored, providedSecret)
  // 不等 → throw InvalidSecret
}
```

`lib/crypto.ts` 现有 `verifyHmac`；加一个 `constantTimeEqual(a: string, b: string): boolean`。

这是 invite 带出来的一个跨模块小改动——不是 invite 内部的事，但是 invite 设计决策要求的配套工作，放在本 spec 范围内声明。

### 7.4 Mount

`apps/server/src/index.ts`：

```ts
app.route("/api/invite", inviteAdminRouter);
app.route("/api/invite/client", inviteClientRouter);
```

---

## 8. Zod schema（validators.ts 关键条目）

- `UpsertInviteSettingsInput` — `{ enabled?: boolean, codeLength?: int, allowSelfInvite?: boolean, metadata?: record }`，`codeLength` 校验 `int().multipleOf(4).min(4).max(24)`
- `ClientBindInput` — `{ code: string.min(1), inviteeEndUserId: string.min(1).max(256) }`；handler 层对 code 先 `normalizeInviteCode` 再 `isWellFormedInviteCode` 校验
- `ClientQualifyInput` — `{ inviteeEndUserId: string.min(1).max(256), qualifiedReason?: string.max(128) | null }`
- OpenAPI 响应 schema：`RelationshipView`、`CodeView`、`SummaryView`、`SettingsView`、`ErrorResponseSchema`

---

## 9. 错误矩阵

| 错误 | httpStatus | 语义 |
|---|---|---|
| `InviteDisabled` | 403 | 租户 `enabled=false` |
| `InviteCodeNotFound` | 404 | `lookupByCode` 找不到或 code 不合法 |
| `SelfInviteForbidden` | 400 | `inviter === invitee && !allowSelfInvite` |
| `InviteAlreadyBound` | 409 | invitee 已被**不同** inviter 绑定 |
| `InviteeNotBound` | 404 | `qualify` 时 relationship 不存在 |
| `InviteRelationshipNotFound` | 404 | admin revoke 时 id 不存在 |
| `InviteCodeConflict` | 500 | 连续 3 次码冲突（不可能发生；真发生了说明有 bug） |
| `InvalidSecret` | 401 | `verifyServerRequest` 里 secret 不等（client-credentials 模块新增） |

**幂等不是错误**：`bind` 同 inviter 再调 → 200 `{ alreadyBound: true }`；`qualify` 再调 → 200 `{ alreadyQualified: true }`。都不发重复事件。

路由 `onError` 复用现有 ModuleError 映射模式（见 check-in / friend 的 `onError`）。

---

## 10. 测试策略

延用项目 [apps/server/CLAUDE.md](apps/server/CLAUDE.md) 规定的两层测试：

### 10.1 `service.test.ts`（主战场）
直接 `createInviteService({ db, events: fakeEventBus, eventCatalog: fakeCatalog })`，用 `createTestOrg` 建真 org、真 Neon dev 分支落数据、结束 `deleteTestOrg` 级联清理。

核心用例：

- `getOrCreateMyCode` 首次生成 + 二次调用返回同一码
- `resetCode` 生成不同码、`rotated_at` 推进、旧码 `lookupByCode` 返回 null
- `bind` 成功 → 事件发射（断言 fakeEventBus.emitted）
- `bind` 幂等：同 inviter 二次调 → `alreadyBound: true`，**事件只发一次**
- `bind` 冲突：不同 inviter 二次调 → 抛 `InviteAlreadyBound`
- `bind` 自邀：`allowSelfInvite=false` 抛 `SelfInviteForbidden`；`true` 允许
- `bind` 码不合法 / 码不存在 / 码被 reset 后 → `InviteCodeNotFound`
- `bind` 禁用租户 → `InviteDisabled`
- `qualify` 基础 → 事件发射、`qualified_at` 推进、`qualified_reason` 落库
- `qualify` 幂等：二次调 → `alreadyQualified: true`，事件只发一次
- `qualify` 对未 bind 的 invitee → `InviteeNotBound`
- `getSummary` / `listMyInvitees` / admin list 的分页与过滤

### 10.2 `routes.test.ts`（薄）
- 401：client-routes 缺 `x-api-key` / HMAC 不对 / secret 不对（bind / qualify 走 secret 路径）
- 400：Zod 校验失败
- 409：`bind` 冲突映射
- admin 走 session cookie 的一个 happy path（参照 check-in / friend 的模式）

### 10.3 `code.test.ts`（纯函数）
- 字母表不含 0 / 1 / I / L / O
- 长度 = 请求长度；`formatInviteCode(generated)` 长度 = 请求长度 + floor((len-1)/4) 个 `-`
- `normalizeInviteCode("abcd-efgh ")` === `"ABCDEFGH"`
- `isWellFormedInviteCode` 拒 `"abcd-0000"`（含 0）

---

## 11. 模块文件清单

```
apps/server/src/
├── schema/
│   └── invite.ts              # 3 张表 + 关系 + index + CHECK constraint
├── schema/index.ts            # re-export invite 表
└── modules/invite/
    ├── types.ts               # Row 类型 $inferSelect、事件 payload 类型 re-export
    ├── errors.ts              # 9 个 ModuleError 子类
    ├── validators.ts          # Zod + .openapi(), 含 body/query/param/response schema
    ├── code.ts                # 生成/格式化/归一化邀请码
    ├── service.ts             # 业务逻辑，仅依赖 Pick<AppDeps, "db" | "events" | "eventCatalog">
    ├── service.test.ts
    ├── code.test.ts
    ├── routes.ts              # admin router
    ├── routes.test.ts
    ├── client-routes.ts       # client router（HMAC + server 混合）
    └── index.ts               # barrel: factory + singleton + registerEvent × 2 + 两个 router 导出
```

跨模块改动（spec 内范围）：

- `apps/server/src/modules/client-credentials/service.ts` — 加 `verifyServerRequest`
- `apps/server/src/modules/client-credentials/errors.ts` — 加 `InvalidSecret`
- `apps/server/src/lib/crypto.ts` — 加 `constantTimeEqual`
- `apps/server/src/index.ts` — mount 两个 router
- `apps/server/src/lib/event-bus.ts` — 通过 `declare module` 扩展 `EventMap`（在 `service.ts` 头部就地扩，参考 task 模块做法）

---

## 12. 迁移与部署

1. 编辑/新增 `src/schema/invite.ts`，在 `src/schema/index.ts` 里 re-export。
2. `pnpm --filter=server db:generate` → 生成 SQL 到 `drizzle/`。
3. **人工 review 生成的 SQL**：确认两张 partial/composite unique index、CHECK 约束、CASCADE 都进去了。
4. `pnpm --filter=server db:migrate` 应用到 Neon dev 分支（记忆里有强约束："走 generate+migrate，禁止 db:push"）。
5. schema 文件 + 生成的迁移文件**同一个 commit** 提交。

---

## 13. 显式不做（YAGNI 清单）

- 多码 / channel 标签 / 分渠道归因
- 邀请码过期时间
- qualify 过期窗口（"B 注册 N 天内不 qualify 就作废"）
- IP / 设备指纹冷却
- 邀请码审计历史（等统一行为日志）
- 邀请黑名单
- 手动补救 qualify（admin 可以通过撤销再让客户方重新调，不做专用 endpoint）
- 客户方 webhook 通知"你的码被使用了"（靠客户方主动查 `/summary` 或由 admin 后台看）
- 多层分销 / 二级邀请（A 邀 B，B 再邀 C，A 也分成）——明确不做，一对一关系
