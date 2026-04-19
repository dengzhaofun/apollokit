# 客户端认证迁移到 header + middleware

## 目标

将所有 C 端 (游戏终端) 的 `client-routes.ts` 从 body/query 内嵌 `endUserId` + `userHash` 的模式，统一迁移到 **header + middleware** 模式（与 `invite` 模块一致）。

## 评估:middleware 模式是否正确?

**是的。** 相比 body/query 内嵌，header + middleware 模式有以下优势:

1. **集中化**: `requireClientUser` 单点验证 HMAC,handler 不再重复 `clientCredentialService.verifyRequest()` 调用
2. **语义清晰**: 身份 (identity) 走 header,业务载荷 (payload) 走 body — 符合 REST 惯例(类比 `Authorization`)
3. **GET 请求不再把 `endUserId` 拼进 query string** → 不泄漏到日志/代理
4. **handler 只读 `c.var.endUserId!`** — 自文档化,不耦合 `x-user-hash` 机制
5. **path 参数 `/users/{endUserId}/...` 变成冗余** — 可删除,改用 `/me/...` 语义或省略

**唯一的权衡**: GET 请求也必须携带 HMAC header (`x-user-hash`) 来验证 identity — `requireClientUser` 已处理(`devMode` 时跳过)。

## 要点

- 头部: `x-api-key` (cpk_), `x-end-user-id`, `x-user-hash` (optional in devMode)
- 两层 middleware:
  - `requireClientCredential` — 验证 `x-api-key`,populate `c.var.clientCredential`
  - `requireClientUser` — 验证 `x-end-user-id` + `x-user-hash` HMAC,populate `c.var.endUserId`
- handler 内:
  - `const orgId = c.get("clientCredential")!.organizationId`
  - `const endUserId = c.var.endUserId!`
  - body/query/param 里不再出现 `endUserId` 和 `userHash`

## 范围

需要迁移的 21 个模块(已迁移: `invite`):

`activity`, `announcement`, `banner`, `cdkey`, `check-in`, `collection`, `currency`,
`dialogue`, `entity`, `exchange`, `friend`, `friend-gift`, `guild`, `item`,
`leaderboard`, `level`, `lottery`, `mail`, `shop`, `task`, `team`

## 每个模块的改动模板

### `client-routes.ts`
1. `import { requireClientUser } from "../../middleware/require-client-user"`
2. 追加 `router.use("*", requireClientUser)`
3. 移除 `clientCredentialService` import 与所有 `verifyRequest(...)` 调用
4. `c.var.session!.activeOrganizationId!` → `c.get("clientCredential")!.organizationId`(统一)
5. 所有 `c.req.valid("json"/"query"/"param").endUserId` → `c.var.endUserId!`
6. `/users/{endUserId}/...` 这类路径参数若指的是"调用者自身",删除该段(把操作变成"当前用户的")

### `validators.ts`
- 从所有 body/query/param schema 中移除 `endUserId` 与 `userHash` 字段
- 删除只有 `endUserId` + `userHash` 的整表"Action"schema (若存在),转用空 schema 或删掉 body

### `routes`(若是 admin 路由) — 不动

### 测试
- 现有 `client-routes.test.ts` (check-in) 更新为发送 header 而不是 body 字段
- 其它模块无 client-routes 测试,不新增

## 不涉及 / 不改

- `client-credentials` 模块本身 (verifyRequest 方法仍保留,middleware 调用)
- 不做向后兼容(产品未上线)
- admin 面的 `routes.ts` 不动

## 验证

- `pnpm --filter=server check-types` 通过
- `pnpm --filter=server test` 通过(本地 pg,`.dev.vars` 已从 main 拷贝)

## 顺序

一次性改完所有模块 → 单跑 check-types → 修类型错误 → 跑全量测试 → 修 failing 测试。
