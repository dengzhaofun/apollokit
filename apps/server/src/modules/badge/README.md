# Badge (Red Dot) Module

游戏红点系统。完全独立,不依赖 mail / task / battle-pass 等任何业务模块的 schema。

## 30 秒概念

```
 badge_nodes       树结构 (organization 级模板)
      │
      ├── signalKey        (exact) — 指向一个具体 signal
      │   OR
      ├── signalKeyPrefix  (prefix) — 聚合所有前缀匹配的动态 signal
      │   OR
      └── (none)           — 纯聚合节点,count 从子节点来

 badge_signals     计数表 (per-(endUser, signalKey))
                   由客户的游戏服务端通过 SDK/HTTP UPSERT

 badge_dismissals  玩家消除记录 (per-(endUser, nodeKey))
                   auto 模式不写这张表

 badge_signal_registry  可选的 signalKey 元数据目录 (仅给 Admin UI 用)
```

**关键理念**:

1. **SaaS 客户自定义 signalKey 规范**。`mail.inbox.abc123` / `quest.daily.001` / `combat.stamina.full` 都合法,红点模块不 hardcode 任何业务语义。
2. **三表足以**。`badge_signals` 是权威数据源,所有计数来自它;`badge_nodes` 是 UI 映射;`badge_dismissals` 是玩家行为。不 JOIN 业务表。
3. **6 种 dismissMode**:`auto` / `manual` / `version` / `daily` / `session` / `cooldown`,覆盖 95% 游戏场景。
4. **Redis 缓存** + 每用户 cacheVersion 戳,写入时自动失效,避免 Upstash 不支持前缀删除的坑。

---

## 客户集成(5 分钟上手)

### Step 1 — Admin 后台建节点

```bash
# 建根节点 "home"(纯聚合父)
curl -X POST https://api.example.com/api/badge/nodes \
  -H "x-api-key: ak_..." \
  -H "Content-Type: application/json" \
  -d '{
    "key": "home",
    "displayType": "dot",
    "signalMatchMode": "none",
    "aggregation": "any"
  }'

# 建叶子节点 "home.mail" 绑定 mail.inbox.* 前缀
curl -X POST https://api.example.com/api/badge/nodes \
  -H "x-api-key: ak_..." \
  -H "Content-Type: application/json" \
  -d '{
    "key": "home.mail",
    "parentKey": "home",
    "displayType": "number",
    "signalMatchMode": "prefix",
    "signalKeyPrefix": "mail.inbox.",
    "aggregation": "sum"
  }'
```

或用模板一键生成:

```bash
curl -X GET https://api.example.com/api/badge/templates \
  -H "x-api-key: ak_..."

curl -X POST https://api.example.com/api/badge/nodes/from-template \
  -H "x-api-key: ak_..." \
  -d '{
    "templateId": "dynamic_list_number",
    "key": "home.mail",
    "parentKey": "home",
    "signalKeyPrefix": "mail.inbox."
  }'
```

### Step 2 — 客户游戏服务端推 signal

```bash
# 新邮件到达 → 推 signal,count=1
curl -X POST https://api.example.com/api/badge/signal \
  -H "x-api-key: ak_..." \
  -d '{
    "endUserId": "player_42",
    "signalKey": "mail.inbox.msg_abc123",
    "mode": "set",
    "count": 1,
    "meta": { "title": "维护补偿" }
  }'

# 玩家读邮件 → clear
curl -X POST https://api.example.com/api/badge/signal \
  -H "x-api-key: ak_..." \
  -d '{
    "endUserId": "player_42",
    "signalKey": "mail.inbox.msg_abc123",
    "mode": "clear"
  }'
```

### Step 3 — 玩家客户端查红点树

```bash
curl https://api.example.com/api/client/badge/tree?rootKey=home \
  -H "x-api-key: cpk_..." \
  -H "x-end-user-id: player_42" \
  -H "x-user-hash: ..."
```

返回:
```json
{
  "code": "ok",
  "data": {
    "rootKey": "home",
    "serverTimestamp": "2026-04-23T...",
    "nodes": [
      {
        "key": "home",
        "displayType": "dot",
        "count": 1,
        "children": [
          {
            "key": "home.mail",
            "displayType": "number",
            "count": 1,
            "meta": { "title": "维护补偿" },
            "children": []
          }
        ]
      }
    ]
  }
}
```

---

## 5 个典型场景

### 场景 1 — 未读邮件数(动态 signal + 聚合)

客户游戏每发一封邮件推 `mail.inbox.{msgId}`,每次读邮件 clear。
节点 `home.mail` 用 `prefix` + `aggregation: sum` + `dismissMode: auto`。
新邮件来 → 数字 +1;读邮件 → 数字 -1;清零 → 红点自动灭。

### 场景 2 — 可领取奖励(精确 signal + 礼盒)

客户服务端计算出"当前可领奖励数",推 `reward.claimable` signal `mode: set, count: N`。
节点配 `exact` + `displayType: gift` + `dismissMode: auto`。
领奖后客户再推 `set count: 0`,红点灭。

### 场景 3 — 日常任务(每日重置)

日常任务完成待领:推 `quest.daily.{questId}` signal。
节点配 `prefix: "quest.daily."` + `dismissMode: daily`。
玩家点击红点 dismiss,今日内不亮;次日 0 点自动重亮。

### 场景 4 — 新功能/HOT 活动(版本门控)

每次版本迭代,客户推新 `version` 字段的 signal:
```json
{ "signalKey": "home.new-feature", "mode": "set", "count": 1, "version": "v2.3" }
```
节点配 `dismissMode: version` / `manual`。玩家点击消除该版本,新版本 `v2.4` 推来时自动重亮。

### 场景 5 — 系统警告(冷却重亮)

推 `warning.low-stamina` signal。节点配 `dismissMode: cooldown`,`dismissConfig: { cooldownSec: 3600 }`。
玩家点击后 1 小时内不亮,1 小时后自动重亮。

---

## Debug — Inspector 面板

```bash
curl -X POST https://api.example.com/api/badge/preview \
  -H "x-api-key: ak_..." \
  -d '{ "endUserId": "player_42", "rootKey": "home", "explain": true }'
```

返回**带解释**的 tree —— 每个节点注明 `reason`(为什么亮/灭)、匹配的 signalKey、起作用的 dismissal、是否 stale 等。给运营和研发 debug "这个红点为什么不消"用。

---

## 架构要点

- **零业务耦合**:不 `import` mail/task/battle-pass 任何东西,纯粹是"徽章计数器 + 节点树 + 消除规则"基础设施
- **可水平拆分**:三表都是 (orgId, endUserId) 前缀主键,未来可按 orgId 分片
- **无事务依赖**:所有写操作是单原子 UPSERT with `ON CONFLICT`,neon-http 无事务约束
- **Redis cacheVersion**:MAX(updatedAt) 戳嵌入 KV key,写入自动失效,不需要 prefix delete
- **Webhook 可选集成**:apollokit 平台已有 `webhooks_endpoints` / `webhooks_deliveries` 表(见 `src/modules/webhooks/`),客户可订阅业务事件并自己决定是否调 `POST /api/badge/signal` —— **不属于本模块**

## 路由总览

### 写 signal(SDK / 服务端,admin 凭证)

- `POST /api/badge/signal` — 单条
- `POST /api/badge/signal/batch` — 批量(max 500)

### Admin 节点管理(admin 凭证)

- `GET    /api/badge/nodes`
- `POST   /api/badge/nodes`
- `PATCH  /api/badge/nodes/:id`
- `DELETE /api/badge/nodes/:id` — 软删 + 级联子树
- `POST   /api/badge/nodes/validate-tree`
- `GET    /api/badge/templates`
- `POST   /api/badge/nodes/from-template`
- `POST   /api/badge/preview` — Inspector 调试
- `GET    /api/badge/signal-registry`
- `PUT    /api/badge/signal-registry`
- `DELETE /api/badge/signal-registry/:keyPattern`

### 玩家客户端(cpk_ + endUser)

- `GET  /api/client/badge/tree?rootKey=...`
- `POST /api/client/badge/dismiss`
- `POST /api/client/badge/reset-session` — 登录时调,清 session 模式 dismissal
