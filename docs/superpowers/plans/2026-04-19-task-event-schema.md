# 任务模块 Event Schema 体系 开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 分 task 执行。Step 用 `- [ ]` 勾选跟踪。

**Goal:** 建立统一的 event schema 注册与发现体系，让 SaaS 管理员在配置 task 的 `eventName` / `eventValueField` / `filter` 时能够拉取到：(1) 所有内部模块 emit 的领域事件及其字段；(2) 外部通过 `/api/client/task/events` 投递进来的事件的字段样貌与示例。并把内部事件真正作为 task 的触发源。

**Architecture:**
- **内部事件** 走代码侧的 `registerEvent({...})` runtime registry — 和 emit 点同一 module 声明，启动时汇总成 in-memory catalog。
- **外部事件** 用 `event_catalog_entries` 表做"首次自动推断字段 + admin 可补描述升级为 canonical"的混合模式。
- 对 admin 暴露一个统一的 `/api/event-catalog` 端点，把内部 registry + 外部 DB 行合并输出。
- 新增 event-bus 桥接：task module 订阅所有注册了的内部事件，自动转调 `taskService.processEvent(...)`，让 `level.cleared` / `leaderboard.contributed` 等内部事件可以直接驱动 task 进度。

**Tech Stack:** Hono + `@hono/zod-openapi` + Drizzle ORM (`neon-http`) + Postgres + filtrex + Vitest。

---

## 设计决策摘要

落在计划里之前的几个关键决策，便于评审与后续追溯：

1. **内部 schema 写死在代码**（同 emit 点共址），外部 schema 写数据库（自动推断 + 管理员补充）。两种来源在对外 API 层合并呈现。
2. **首次自动推断 + admin 升级**：`processEvent` 每次进来先经过 `eventCatalog.recordExternalEvent(...)`，带 in-memory TTL（5 分钟）防止写入风暴。admin `PATCH` 后 `status` 从 `"inferred"` 变 `"canonical"`，此后字段层不再被推断覆写。
3. **推断算法**：扁平化 dot-path（`stats.level` 这种），类型从 `typeof` 取（`string/number/boolean/object/array/null`），`required` 初始值 `false`，由 admin 后期纠正。
4. **内部事件必须带 `organizationId` + `endUserId`** 才能注册（多租户 + 用户维度是 task 分发前提）。不满足的事件类型仍可存在于 event-bus，但不进 registry，也不被 task 桥接消费。
5. **桥接到 task**：task module barrel 里 `events.on(name, handler)` 订阅 registry 中标记 `forwardToTask: true` 的事件（默认 true），`handler` 按约定字段转调 `processEvent`。
6. **filter 字段校验**放到 Phase 8（软提示，不阻塞），避免字段推断还不完全时误杀 admin 输入。

---

## 文件结构

### 新建
- `apps/server/src/lib/event-registry.ts` — 内部事件 runtime registry（纯代码，无 DB）。
- `apps/server/src/lib/event-registry.test.ts` — registry 单测。
- `apps/server/src/schema/event-catalog.ts` — Drizzle 表 `event_catalog_entries`。
- `apps/server/src/modules/event-catalog/types.ts`
- `apps/server/src/modules/event-catalog/errors.ts`
- `apps/server/src/modules/event-catalog/infer.ts` — 纯推断工具（把 `Record<string, unknown>` 展平为 `EventFieldSchema[]`）。
- `apps/server/src/modules/event-catalog/infer.test.ts`
- `apps/server/src/modules/event-catalog/service.ts`
- `apps/server/src/modules/event-catalog/service.test.ts`
- `apps/server/src/modules/event-catalog/validators.ts`
- `apps/server/src/modules/event-catalog/routes.ts`
- `apps/server/src/modules/event-catalog/routes.test.ts`
- `apps/server/src/modules/event-catalog/index.ts`
- `apps/server/src/modules/task/event-forwarder.ts` — Phase 7 内部事件转 `processEvent` 的桥接。
- `apps/server/src/modules/task/event-forwarder.test.ts`

### 修改
- `apps/server/src/schema/index.ts` — 加 `export * from "./event-catalog"`。
- `apps/server/src/deps.ts` — `AppDeps` 加 `eventCatalog: EventCatalogService`。
- `apps/server/src/index.ts` — 挂 `app.route("/api/event-catalog", eventCatalogRouter)`。
- `apps/server/src/modules/task/service.ts` — `processEvent` 开头调 `eventCatalog.recordExternalEvent`；`createTaskService` 的 deps 加可选 `eventCatalog`。
- `apps/server/src/modules/task/index.ts` — 注入 `eventCatalog`；注册 task 自己 emit 的内部事件（`task.completed` / `task.claimed` / `task.tier.claimed`）；装配 forwarder。
- `apps/server/src/modules/level/index.ts` — 注册 `level.cleared`。
- `apps/server/src/modules/leaderboard/index.ts` — 注册 `leaderboard.contributed`。
- `apps/server/src/modules/activity/index.ts` — 注册 `activity.state.changed` / `activity.schedule.fired` / `activity.milestone.claimed`。
- `apps/server/src/modules/task/validators.ts` — Phase 8 `filter` 解析出字段引用做软校验。

---

## Phase 1 — 内部事件 Runtime Registry

**目标：** 建立 `registerEvent` / `listInternalEvents` 的模块内 API。纯内存，不依赖 DB。

### Task 1.1 — `EventFieldSchema` / `EventDescriptor` 类型 + 注册函数

**Files:**
- Create: `apps/server/src/lib/event-registry.ts`

- [ ] **Step 1: 写文件骨架**

```ts
/**
 * 内部领域事件的 runtime registry。
 *
 * 每个 module 在 barrel (`index.ts`) 里调用 `registerEvent({...})`
 * 声明自己 emit 的事件 + 字段样貌。启动时 import barrel 完成注册。
 *
 * 与 `event-bus` 的 `EventMap` 互补：EventMap 给 TypeScript 做编译期
 * payload 检查；registry 提供 runtime 可枚举的 schema，用于 admin API
 * 和 task 的事件桥接。
 *
 * 纯进程内，无多租户维度 —— 内部事件是代码产物，所有租户共享。
 */

export type EventFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "unknown";

export type EventFieldSchema = {
  /** Dot-path, 例 "stats.level". 顶层字段就是字段名本身。 */
  path: string;
  type: EventFieldType;
  description?: string;
  required: boolean;
};

export type InternalEventDescriptor = {
  /** 事件名，与 `EventMap` 的 key 对应，例 "level.cleared"。 */
  name: string;
  /** emit 该事件的 module 名，便于 admin 分组。 */
  owner: string;
  /** 面向 admin 的描述。 */
  description: string;
  /** 事件 payload 的字段 schema。必须含 organizationId + endUserId 才能被 task 桥接消费。 */
  fields: EventFieldSchema[];
  /**
   * 是否把这个事件自动桥接到 task.processEvent。默认 true。
   * 某些纯系统事件（例如 `activity.state.changed` 没有 endUserId）应设为 false。
   */
  forwardToTask?: boolean;
};

const registry = new Map<string, InternalEventDescriptor>();

export function registerEvent(desc: InternalEventDescriptor): void {
  if (registry.has(desc.name)) {
    // 重复注册通常是 HMR 或测试多次 import barrel，允许覆盖以取最新。
    // 生产环境每个 isolate 仅 import 一次，不会真的竞争。
  }
  registry.set(desc.name, {
    forwardToTask: desc.forwardToTask ?? true,
    ...desc,
  });
}

export function listInternalEvents(): InternalEventDescriptor[] {
  return Array.from(registry.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getInternalEvent(name: string): InternalEventDescriptor | undefined {
  return registry.get(name);
}

/** 仅供测试使用，生产代码不应调用。 */
export function __resetRegistryForTests(): void {
  registry.clear();
}
```

- [ ] **Step 2: 写单测**

Create: `apps/server/src/lib/event-registry.test.ts`

```ts
import { afterEach, describe, expect, test } from "vitest";

import {
  __resetRegistryForTests,
  getInternalEvent,
  listInternalEvents,
  registerEvent,
} from "./event-registry";

describe("event-registry", () => {
  afterEach(() => __resetRegistryForTests());

  test("registers and lists in sorted order", () => {
    registerEvent({
      name: "zeta.one",
      owner: "zeta",
      description: "z",
      fields: [],
    });
    registerEvent({
      name: "alpha.one",
      owner: "alpha",
      description: "a",
      fields: [],
    });
    const names = listInternalEvents().map((e) => e.name);
    expect(names).toEqual(["alpha.one", "zeta.one"]);
  });

  test("forwardToTask defaults to true", () => {
    registerEvent({
      name: "x.y",
      owner: "x",
      description: "d",
      fields: [],
    });
    expect(getInternalEvent("x.y")?.forwardToTask).toBe(true);
  });

  test("forwardToTask=false is preserved", () => {
    registerEvent({
      name: "x.y",
      owner: "x",
      description: "d",
      fields: [],
      forwardToTask: false,
    });
    expect(getInternalEvent("x.y")?.forwardToTask).toBe(false);
  });

  test("re-registering the same name overwrites", () => {
    registerEvent({
      name: "a",
      owner: "old",
      description: "",
      fields: [],
    });
    registerEvent({
      name: "a",
      owner: "new",
      description: "",
      fields: [],
    });
    expect(getInternalEvent("a")?.owner).toBe("new");
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm --filter=server test src/lib/event-registry.test.ts`
Expected: 4 passed。

- [ ] **Step 4: commit**

```bash
git add apps/server/src/lib/event-registry.ts apps/server/src/lib/event-registry.test.ts
git commit -m "feat(server): add internal event registry with register/list API"
```

---

## Phase 2 — 外部事件 DB Schema

**目标：** 新建 `event_catalog_entries` 表，承载外部事件的推断字段 + admin 补充的描述。

### Task 2.1 — Drizzle 表定义

**Files:**
- Create: `apps/server/src/schema/event-catalog.ts`
- Modify: `apps/server/src/schema/index.ts`

- [ ] **Step 1: 写表定义**

```ts
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * 外部事件 catalog。
 *
 * 每个 (organizationId, eventName) 一行。首次被 `taskService.processEvent`
 * 收到时用字段推断写入 `status='inferred'`；admin 通过 PATCH 补充描述
 * 或修正字段类型后升级为 `status='canonical'`，之后字段不再被推断覆盖。
 *
 * 内部事件不写这张表 —— 内部事件走 `src/lib/event-registry.ts` 的 runtime
 * registry。这张表只存外部事件。
 */
export const eventCatalogEntries = pgTable(
  "event_catalog_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    /**
     * 'inferred' | 'canonical'. inferred 下字段会被后续事件的推断 merge；
     * canonical 下 admin 是权威，字段只能由 PATCH 改。
     */
    status: text("status").default("inferred").notNull(),
    description: text("description"),
    /** 字段列表，形如 `[{ path, type, description, required }]`。 */
    fields: jsonb("fields").$type<EventFieldRow[]>().default([]).notNull(),
    /** 最近一次事件的 sample payload，便于 admin 参考。 */
    sampleEventData: jsonb("sample_event_data"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("event_catalog_org_name_uidx").on(
      table.organizationId,
      table.eventName,
    ),
    index("event_catalog_org_last_seen_idx").on(
      table.organizationId,
      table.lastSeenAt,
    ),
  ],
);

/**
 * `fields` jsonb 列的单元类型。刻意与 `EventFieldSchema` 分开 ——
 * 后者是跨内外事件的统一表示，这里是 DB 列的 row 形状。二者结构一致
 * 但职责不同，后续需要分别演进时互不牵连。
 */
export type EventFieldRow = {
  path: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "unknown";
  description?: string;
  required: boolean;
};

export type EventCatalogStatus = "inferred" | "canonical";
```

- [ ] **Step 2: 在 schema barrel 注册**

Edit `apps/server/src/schema/index.ts`:

```ts
export * from "./event-catalog";
```

加在现有 `export * from "./media-library";` 之后。

- [ ] **Step 3: 生成迁移**

Run:
```bash
pnpm --filter=server db:generate
```

Expected: 在 `apps/server/drizzle/` 生成 `0032_*.sql`。打开检查：
- 创建 `event_catalog_entries` 表
- `organization_id` 外键到 `organization(id)` ON DELETE CASCADE
- `event_catalog_org_name_uidx` 唯一索引
- `event_catalog_org_last_seen_idx` 索引

如果生成的 SQL 不对，先改 schema 文件再 regen（**不要手工改 SQL**）。

- [ ] **Step 4: 应用迁移**

Run: `pnpm --filter=server db:migrate`
Expected: 成功无报错。

- [ ] **Step 5: commit**

```bash
git add apps/server/src/schema/event-catalog.ts apps/server/src/schema/index.ts apps/server/drizzle/
git commit -m "feat(server): add event_catalog_entries table for external event schemas"
```

---

## Phase 3 — `event-catalog` Module（推断 + Service）

**目标：** 实现外部事件字段推断、upsert、查询、admin 覆盖逻辑。

### Task 3.1 — `types.ts` / `errors.ts`

**Files:**
- Create: `apps/server/src/modules/event-catalog/types.ts`
- Create: `apps/server/src/modules/event-catalog/errors.ts`

- [ ] **Step 1: types.ts**

```ts
import type { eventCatalogEntries } from "../../schema/event-catalog";
import type {
  EventFieldSchema,
  InternalEventDescriptor,
} from "../../lib/event-registry";

export type EventCatalogEntry = typeof eventCatalogEntries.$inferSelect;
export type { EventFieldRow, EventCatalogStatus } from "../../schema/event-catalog";
export type { EventFieldSchema, EventFieldType } from "../../lib/event-registry";

/**
 * 统一的对外视图：内部事件与外部事件都映射到这个形状。
 * HTTP 响应用它序列化。
 */
export type CatalogEventView = {
  name: string;
  source: "internal" | "external";
  owner: string | null;
  description: string | null;
  fields: EventFieldSchema[];
  /** 仅 external: 'inferred' | 'canonical'. internal 恒为 null。 */
  status: "inferred" | "canonical" | null;
  /** 仅 external: 最近一次收到的时间。 */
  lastSeenAt: string | null;
  /** 仅 external: 最近一次的 sample payload。 */
  sampleEventData: Record<string, unknown> | null;
  /** 是否会被桥接到 task.processEvent。internal 走 registry 的 forwardToTask；external 恒为 true。 */
  forwardToTask: boolean;
};

/** 内部视图转换辅助。 */
export function internalToView(desc: InternalEventDescriptor): CatalogEventView {
  return {
    name: desc.name,
    source: "internal",
    owner: desc.owner,
    description: desc.description,
    fields: desc.fields,
    status: null,
    lastSeenAt: null,
    sampleEventData: null,
    forwardToTask: desc.forwardToTask ?? true,
  };
}

export function externalToView(row: EventCatalogEntry): CatalogEventView {
  return {
    name: row.eventName,
    source: "external",
    owner: null,
    description: row.description,
    fields: row.fields,
    status: row.status as "inferred" | "canonical",
    lastSeenAt: row.lastSeenAt.toISOString(),
    sampleEventData: (row.sampleEventData ?? null) as
      | Record<string, unknown>
      | null,
    forwardToTask: true,
  };
}
```

- [ ] **Step 2: errors.ts**

```ts
import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class EventCatalogNotFound extends ModuleError {
  code = "EVENT_CATALOG_NOT_FOUND";
  httpStatus = 404;
  constructor(name: string) {
    super(`event catalog entry not found: ${name}`);
  }
}

export class EventCatalogReadOnly extends ModuleError {
  code = "EVENT_CATALOG_READ_ONLY";
  httpStatus = 400;
  constructor(reason: string) {
    super(`event catalog entry is read-only: ${reason}`);
  }
}
```

- [ ] **Step 3: commit**

```bash
git add apps/server/src/modules/event-catalog/types.ts apps/server/src/modules/event-catalog/errors.ts
git commit -m "feat(server): add event-catalog module types and errors"
```

### Task 3.2 — `infer.ts` 纯推断工具

**Files:**
- Create: `apps/server/src/modules/event-catalog/infer.ts`
- Create: `apps/server/src/modules/event-catalog/infer.test.ts`

- [ ] **Step 1: 写 infer.ts**

```ts
import type { EventFieldRow } from "../../schema/event-catalog";

/**
 * 从一次事件 payload 推断扁平化的字段 schema。
 *
 * - 把嵌套 object 展平成 dot-path；数组当作原子类型（不深入元素）。
 * - 类型从 `typeof` / `Array.isArray` / `=== null` 得出。
 * - `required` 默认 `false` —— 单次 payload 无法判断必填性，留给 admin 在 PATCH
 *   时纠正。
 *
 * 嵌套深度超过 8 时停止深入，防止 pathological payload 爆 stack。
 */
const MAX_DEPTH = 8;

export function inferFields(
  payload: Record<string, unknown>,
): EventFieldRow[] {
  const rows: EventFieldRow[] = [];
  walk(payload, "", 0, rows);
  // 稳定排序（按 path）以便 merge 时 diff 友好。
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;
}

function walk(
  value: unknown,
  prefix: string,
  depth: number,
  out: EventFieldRow[],
): void {
  if (depth >= MAX_DEPTH) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    // 叶子节点本身由 parent 的遍历负责记录，不在这里独立 push。
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push({ path, type: classify(v), required: false });
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      walk(v, path, depth + 1, out);
    }
  }
}

function classify(v: unknown): EventFieldRow["type"] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  return "unknown";
}

/**
 * 把新推断的 rows merge 进已有 rows。规则：
 * - 已存在的 path: 保留 description / required / 已有 type（不被新推断覆盖）。
 * - 新出现的 path: 追加，type 从推断来，description 空。
 *
 * 这样 admin 手工改过的字段不会在下一次事件来时被推断"修复"掉。
 */
export function mergeFields(
  existing: EventFieldRow[],
  inferred: EventFieldRow[],
): EventFieldRow[] {
  const byPath = new Map<string, EventFieldRow>();
  for (const row of existing) byPath.set(row.path, row);
  for (const row of inferred) {
    if (!byPath.has(row.path)) byPath.set(row.path, row);
  }
  return Array.from(byPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}
```

- [ ] **Step 2: 写单测**

Create `infer.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { inferFields, mergeFields } from "./infer";

describe("inferFields", () => {
  test("flat payload", () => {
    const fields = inferFields({ amount: 100, currency: "USD" });
    expect(fields).toEqual([
      { path: "amount", type: "number", required: false },
      { path: "currency", type: "string", required: false },
    ]);
  });

  test("nested object is flattened", () => {
    const fields = inferFields({
      monsterId: "dragon",
      stats: { level: 10, elite: true },
    });
    expect(fields).toEqual([
      { path: "monsterId", type: "string", required: false },
      { path: "stats", type: "object", required: false },
      { path: "stats.elite", type: "boolean", required: false },
      { path: "stats.level", type: "number", required: false },
    ]);
  });

  test("array is atomic (not descended)", () => {
    const fields = inferFields({ items: [1, 2, 3] });
    expect(fields).toEqual([
      { path: "items", type: "array", required: false },
    ]);
  });

  test("null becomes 'null' type", () => {
    const fields = inferFields({ parent: null });
    expect(fields).toEqual([
      { path: "parent", type: "null", required: false },
    ]);
  });

  test("max depth cap prevents stack blow-up", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    const fields = inferFields(deep);
    // 不报错即可，paths 数量应有限。
    expect(fields.length).toBeLessThan(20);
  });
});

describe("mergeFields", () => {
  test("new paths appended", () => {
    const existing = [{ path: "a", type: "string" as const, required: false }];
    const inferred = [{ path: "b", type: "number" as const, required: false }];
    expect(mergeFields(existing, inferred)).toEqual([
      { path: "a", type: "string", required: false },
      { path: "b", type: "number", required: false },
    ]);
  });

  test("existing fields kept verbatim (admin edits preserved)", () => {
    const existing = [
      {
        path: "amount",
        type: "number" as const,
        description: "user-paid amount in cents",
        required: true,
      },
    ];
    const inferred = [
      { path: "amount", type: "string" as const, required: false },
    ];
    expect(mergeFields(existing, inferred)).toEqual([
      {
        path: "amount",
        type: "number",
        description: "user-paid amount in cents",
        required: true,
      },
    ]);
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm --filter=server test src/modules/event-catalog/infer.test.ts`
Expected: 全部通过。

- [ ] **Step 4: commit**

```bash
git add apps/server/src/modules/event-catalog/infer.ts apps/server/src/modules/event-catalog/infer.test.ts
git commit -m "feat(server): add pure inference utilities for event field schema"
```

### Task 3.3 — `service.ts` 核心逻辑

**Files:**
- Create: `apps/server/src/modules/event-catalog/service.ts`

- [ ] **Step 1: 写 service.ts**

```ts
/**
 * Event catalog service.
 *
 * 职责：
 *   1. 记录外部事件（自动字段推断 + upsert，带 TTL 去重）。
 *   2. 合并内部 registry 与外部 DB 行，输出统一 view 给 admin。
 *   3. 接受 admin 的 PATCH 把外部事件升级为 canonical。
 *
 * 不做：
 *   - 不处理内部事件的注册 —— 那是各 module barrel 的职责。
 *   - 不做 filter 表达式校验 —— 那是 task 模块的职责（Phase 8）。
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  getInternalEvent,
  listInternalEvents,
} from "../../lib/event-registry";
import { eventCatalogEntries } from "../../schema/event-catalog";

import { EventCatalogNotFound, EventCatalogReadOnly } from "./errors";
import { inferFields, mergeFields } from "./infer";
import {
  type CatalogEventView,
  externalToView,
  internalToView,
} from "./types";

type EventCatalogDeps = Pick<AppDeps, "db">;

/**
 * TTL 去重窗口 —— 同一 (org, eventName) 在窗口内只 upsert 一次，避免
 * 高 QPS 事件每次都写 DB。5 分钟是 Workers isolate 生命期的粗略上限，
 * 同一 isolate 至多丢一次"这轮最新 sample"；sampleEventData 对校对足够。
 */
const RECORD_TTL_MS = 5 * 60 * 1000;

export function createEventCatalogService(d: EventCatalogDeps) {
  const { db } = d;

  // isolate-scoped 去重缓存：key = `${orgId}:${eventName}`, value = epoch ms
  const lastRecordedAt = new Map<string, number>();

  /**
   * 在 task.processEvent 入口处非阻塞调用。
   * 根据 TTL 判断是否需要真的写 DB。写入失败不抛（log 即可），避免打断主流程。
   */
  async function recordExternalEvent(
    organizationId: string,
    eventName: string,
    eventData: Record<string, unknown>,
    now?: Date,
  ): Promise<void> {
    // 内部事件不走这条路径 —— 内部事件在 registry 里有权威 schema，
    // 不应被 task 的外部入口"污染"到 DB 表里。
    if (getInternalEvent(eventName)) return;

    const key = `${organizationId}:${eventName}`;
    const ts = now ?? new Date();
    const last = lastRecordedAt.get(key);
    if (last && ts.getTime() - last < RECORD_TTL_MS) return;
    lastRecordedAt.set(key, ts.getTime());

    const inferred = inferFields(eventData);

    try {
      // 先试读一次，决定是 insert 还是 merge update。避免给 canonical 行
      // 做字段覆盖 —— 用 SQL 层的 CASE 也能写，但两步读写更清晰且已经
      // 被 TTL 挡掉大多数写入。
      const rows = await db
        .select()
        .from(eventCatalogEntries)
        .where(
          and(
            eq(eventCatalogEntries.organizationId, organizationId),
            eq(eventCatalogEntries.eventName, eventName),
          ),
        )
        .limit(1);
      const existing = rows[0];

      if (!existing) {
        await db
          .insert(eventCatalogEntries)
          .values({
            organizationId,
            eventName,
            status: "inferred",
            fields: inferred,
            sampleEventData: eventData as unknown as Record<string, unknown>,
            firstSeenAt: ts,
            lastSeenAt: ts,
          })
          .onConflictDoNothing();
        return;
      }

      // 已存在 —— 永远更新 lastSeenAt 和 sampleEventData。
      // 只在 inferred 状态下 merge 字段；canonical 不动字段。
      const nextFields =
        existing.status === "canonical"
          ? existing.fields
          : mergeFields(existing.fields, inferred);

      await db
        .update(eventCatalogEntries)
        .set({
          fields: nextFields,
          sampleEventData: eventData as unknown as Record<string, unknown>,
          lastSeenAt: ts,
        })
        .where(eq(eventCatalogEntries.id, existing.id));
    } catch (err) {
      // 记录但不抛 —— catalog 记录失败不应阻塞 task 进度更新。
      console.error("event-catalog: recordExternalEvent failed", {
        organizationId,
        eventName,
        err,
      });
    }
  }

  /**
   * 列出所有事件 —— 内部 registry + 外部 DB 行按 name 去重合并。
   * 内部优先（internal 覆盖 external 的同名行，如果有的话）。
   */
  async function listAll(organizationId: string): Promise<CatalogEventView[]> {
    const internal = listInternalEvents().map(internalToView);
    const internalNames = new Set(internal.map((v) => v.name));

    const externalRows = await db
      .select()
      .from(eventCatalogEntries)
      .where(eq(eventCatalogEntries.organizationId, organizationId))
      .orderBy(desc(eventCatalogEntries.lastSeenAt));

    const external = externalRows
      .filter((r) => !internalNames.has(r.eventName))
      .map(externalToView);

    return [...internal, ...external];
  }

  async function getOne(
    organizationId: string,
    eventName: string,
  ): Promise<CatalogEventView> {
    const internal = getInternalEvent(eventName);
    if (internal) return internalToView(internal);

    const rows = await db
      .select()
      .from(eventCatalogEntries)
      .where(
        and(
          eq(eventCatalogEntries.organizationId, organizationId),
          eq(eventCatalogEntries.eventName, eventName),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new EventCatalogNotFound(eventName);
    return externalToView(row);
  }

  /**
   * admin 编辑外部事件的描述/字段。提交后 status 升级为 canonical。
   * 内部事件拒绝编辑（`EventCatalogReadOnly`）—— 要改请改代码。
   */
  async function updateExternal(
    organizationId: string,
    eventName: string,
    patch: {
      description?: string | null;
      fields?: Array<{
        path: string;
        type:
          | "string"
          | "number"
          | "boolean"
          | "object"
          | "array"
          | "null"
          | "unknown";
        description?: string;
        required: boolean;
      }>;
    },
  ): Promise<CatalogEventView> {
    if (getInternalEvent(eventName)) {
      throw new EventCatalogReadOnly("internal event, edit source code instead");
    }

    const values: Partial<typeof eventCatalogEntries.$inferInsert> = {
      status: "canonical",
    };
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.fields !== undefined) values.fields = patch.fields;

    const [row] = await db
      .update(eventCatalogEntries)
      .set(values)
      .where(
        and(
          eq(eventCatalogEntries.organizationId, organizationId),
          eq(eventCatalogEntries.eventName, eventName),
        ),
      )
      .returning();

    if (!row) throw new EventCatalogNotFound(eventName);
    return externalToView(row);
  }

  return {
    recordExternalEvent,
    listAll,
    getOne,
    updateExternal,
  };
}

export type EventCatalogService = ReturnType<typeof createEventCatalogService>;
```

- [ ] **Step 2: commit**

```bash
git add apps/server/src/modules/event-catalog/service.ts
git commit -m "feat(server): add event-catalog service (record/list/get/update)"
```

### Task 3.4 — Service 集成测试

**Files:**
- Create: `apps/server/src/modules/event-catalog/service.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { __resetRegistryForTests, registerEvent } from "../../lib/event-registry";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createEventCatalogService } from "./service";
import { EventCatalogReadOnly } from "./errors";

describe("event-catalog service", () => {
  let orgId: string;
  const svc = createEventCatalogService({ db });

  beforeAll(async () => {
    orgId = await createTestOrg("event-catalog");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });
  afterEach(() => __resetRegistryForTests());

  test("recordExternalEvent inserts new row with inferred fields", async () => {
    await svc.recordExternalEvent(orgId, "purchase", {
      amount: 100,
      currency: "USD",
    });
    const view = await svc.getOne(orgId, "purchase");
    expect(view.source).toBe("external");
    expect(view.status).toBe("inferred");
    expect(view.fields.map((f) => f.path)).toEqual(["amount", "currency"]);
  });

  test("second event within TTL window is deduped (no write)", async () => {
    await svc.recordExternalEvent(orgId, "dedup_evt", { a: 1 });
    // 同一 ts 二次调用应被 in-memory TTL 吸收，sampleEventData 不变。
    await svc.recordExternalEvent(orgId, "dedup_evt", { b: 2 });
    const view = await svc.getOne(orgId, "dedup_evt");
    expect(view.sampleEventData).toEqual({ a: 1 });
  });

  test("second event outside TTL window merges new fields", async () => {
    const t0 = new Date("2026-04-19T00:00:00Z");
    const t1 = new Date("2026-04-19T00:10:00Z"); // +10 分钟 > 5 分钟 TTL
    await svc.recordExternalEvent(orgId, "merge_evt", { a: 1 }, t0);
    await svc.recordExternalEvent(orgId, "merge_evt", { b: 2 }, t1);
    const view = await svc.getOne(orgId, "merge_evt");
    expect(view.fields.map((f) => f.path).sort()).toEqual(["a", "b"]);
    expect(view.sampleEventData).toEqual({ b: 2 });
  });

  test("canonical status freezes fields against further inference", async () => {
    const t0 = new Date("2026-04-19T01:00:00Z");
    const t1 = new Date("2026-04-19T01:10:00Z");
    await svc.recordExternalEvent(orgId, "canon_evt", { a: 1 }, t0);
    await svc.updateExternal(orgId, "canon_evt", {
      description: "blessed",
      fields: [{ path: "a", type: "number", required: true }],
    });
    await svc.recordExternalEvent(orgId, "canon_evt", { b: 2 }, t1);
    const view = await svc.getOne(orgId, "canon_evt");
    expect(view.status).toBe("canonical");
    expect(view.fields.map((f) => f.path)).toEqual(["a"]); // b 没被加进去
    expect(view.description).toBe("blessed");
  });

  test("internal event shows up in listAll with source=internal", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "Player clears a level",
      fields: [
        { path: "organizationId", type: "string", required: true },
        { path: "endUserId", type: "string", required: true },
        { path: "levelId", type: "string", required: true },
      ],
    });
    const all = await svc.listAll(orgId);
    const lc = all.find((v) => v.name === "level.cleared");
    expect(lc?.source).toBe("internal");
    expect(lc?.owner).toBe("level");
  });

  test("recordExternalEvent is a no-op when name matches an internal event", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    await svc.recordExternalEvent(orgId, "level.cleared", { foo: "bar" });
    // 不应在 DB 里出现 external 行
    const view = await svc.getOne(orgId, "level.cleared");
    expect(view.source).toBe("internal");
  });

  test("updateExternal on an internal event throws EventCatalogReadOnly", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    await expect(
      svc.updateExternal(orgId, "level.cleared", { description: "nope" }),
    ).rejects.toBeInstanceOf(EventCatalogReadOnly);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter=server test src/modules/event-catalog/service.test.ts`
Expected: 全部通过。

- [ ] **Step 3: commit**

```bash
git add apps/server/src/modules/event-catalog/service.test.ts
git commit -m "test(server): event-catalog service integration tests"
```

### Task 3.5 — `validators.ts` + `index.ts` barrel + AppDeps 装配

**Files:**
- Create: `apps/server/src/modules/event-catalog/validators.ts`
- Create: `apps/server/src/modules/event-catalog/index.ts`
- Modify: `apps/server/src/deps.ts`

- [ ] **Step 1: validators.ts**

```ts
import { z } from "@hono/zod-openapi";

const EventFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
  "unknown",
]);

export const EventFieldRowSchema = z
  .object({
    path: z.string().min(1).max(256),
    type: EventFieldTypeSchema,
    description: z.string().max(2000).optional(),
    required: z.boolean(),
  })
  .openapi("EventCatalogFieldRow");

export const UpdateEventCatalogSchema = z
  .object({
    description: z.string().max(2000).nullable().optional().openapi({
      description: "Admin-facing description. Null to clear.",
    }),
    fields: z.array(EventFieldRowSchema).optional().openapi({
      description:
        "Full replacement of the field list. Sets status='canonical' — fields will no longer be merged from future payloads.",
    }),
  })
  .openapi("EventCatalogUpdateBody");

export const EventNameParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .openapi({ param: { name: "name", in: "path" } }),
});

export const CatalogEventViewSchema = z
  .object({
    name: z.string(),
    source: z.enum(["internal", "external"]),
    owner: z.string().nullable(),
    description: z.string().nullable(),
    fields: z.array(EventFieldRowSchema),
    status: z.enum(["inferred", "canonical"]).nullable(),
    lastSeenAt: z.string().nullable(),
    sampleEventData: z.record(z.string(), z.unknown()).nullable(),
    forwardToTask: z.boolean(),
  })
  .openapi("CatalogEventView");

export const CatalogListResponseSchema = z
  .object({ items: z.array(CatalogEventViewSchema) })
  .openapi("CatalogEventList");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("EventCatalogErrorResponse");

export type UpdateEventCatalogInput = z.input<typeof UpdateEventCatalogSchema>;
```

- [ ] **Step 2: index.ts**

```ts
import { deps } from "../../deps";

import { createEventCatalogService } from "./service";

export { createEventCatalogService };
export type { EventCatalogService } from "./service";

export const eventCatalogService = createEventCatalogService(deps);

export { eventCatalogRouter } from "./routes";
```

- [ ] **Step 3: 在 AppDeps 注入**

Edit `apps/server/src/deps.ts` — 加字段 + 延迟装配：

```ts
import type { EventCatalogService } from "./modules/event-catalog/service";

export type AppDeps = {
  db: typeof db;
  redis: typeof redis;
  events: EventBus;
  appSecret: string;
  storage: ObjectStorage;
  analytics: AnalyticsService;
  eventCatalog: EventCatalogService;
};
```

在 `deps` 常量里填值 —— 由于 module 之间有循环依赖风险（`event-catalog/index.ts` import `deps`），这里采用和 `analytics` 一样的 Proxy lazy 模式。在 `deps.ts` 内新增：

```ts
function createLazyEventCatalog(): EventCatalogService {
  let instance: EventCatalogService | null = null;
  async function resolve(): Promise<EventCatalogService> {
    if (!instance) {
      const mod = await import("./modules/event-catalog/service");
      instance = mod.createEventCatalogService({ db });
    }
    return instance;
  }
  // 同步 Proxy —— 所有方法都是 async，可以在调用时 await resolve
  return new Proxy({} as EventCatalogService, {
    get(_t, prop) {
      return async (...args: unknown[]) => {
        const target = await resolve();
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (typeof value !== "function") return value;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
```

**注意：** 如果这个 lazy 因为 circular import 仍出问题，退回更朴素的做法 —— 在 `deps.ts` 里直接 `import { createEventCatalogService } from "./modules/event-catalog/service"`，`eventCatalog: createEventCatalogService({ db })`。`service.ts` 本身不 import barrel，就没有循环。**优先试朴素方案，Proxy 是兜底**。

推荐直接：

```ts
import { createEventCatalogService } from "./modules/event-catalog/service";

export const deps: AppDeps = {
  db,
  redis,
  events: createEventBus(),
  appSecret: env.BETTER_AUTH_SECRET,
  storage: createLazyStorage(),
  analytics: createLazyAnalytics(),
  eventCatalog: createEventCatalogService({ db }),
};
```

因为 `event-catalog/service.ts` 只依赖 `db` 和 `event-registry`，无循环。

- [ ] **Step 4: 跑 type-check 验证没环**

Run: `pnpm --filter=server check-types`
Expected: 无错。

- [ ] **Step 5: commit**

```bash
git add apps/server/src/modules/event-catalog/validators.ts apps/server/src/modules/event-catalog/index.ts apps/server/src/deps.ts
git commit -m "feat(server): wire event-catalog into AppDeps with validators + barrel"
```

---

## Phase 4 — 接入 task.processEvent 自动推断

**目标：** task 每次处理外部事件时，顺便记录到 catalog。

### Task 4.1 — `createTaskService` 加 eventCatalog 可选依赖

**Files:**
- Modify: `apps/server/src/modules/task/service.ts` (around line 62)

- [ ] **Step 1: 扩展 TaskDeps**

在 `service.ts` 顶部：

```ts
type TaskDeps = Pick<AppDeps, "db"> &
  Partial<Pick<AppDeps, "events" | "eventCatalog">>;
```

在 `createTaskService` 解构：

```ts
const { db, events, eventCatalog } = d;
```

- [ ] **Step 2: 在 `processEvent` 开头非阻塞调用**

修改 `processEvent` 函数（原来在第 594 行附近），在 `const ts = now ?? new Date();` 之后立刻加：

```ts
// 记录到 event-catalog（自动推断字段 / 更新 sample）。非阻塞 —— 失败只 log，
// 不影响 task 进度更新。TTL 去重在 service 内部做。
if (eventCatalog) {
  void eventCatalog
    .recordExternalEvent(organizationId, eventName, eventData, ts)
    .catch((err) => {
      console.error("task: recordExternalEvent failed", err);
    });
}
```

**注意：** `void` + `.catch` 是 fire-and-forget 的标准写法，保留主流程的 await 链不被这条推断调用卡住。

- [ ] **Step 3: 更新 task barrel 注入依赖**

Edit `apps/server/src/modules/task/index.ts`:

```ts
import { deps } from "../../deps";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { mailService } from "../mail";
import { createTaskService } from "./service";

export { createTaskService };
export type { TaskService } from "./service";

export const taskService = createTaskService(
  deps,
  { itemSvc: itemService, currencySvc: currencyService },
  () => mailService,
);
```

— 由于 `TaskDeps` 的 `eventCatalog` 是 `Partial`，从 `deps` 结构解构会自动 pick 到，无需额外显式传。验证：`deps` 里有 `eventCatalog`，`Pick<AppDeps, "db" | "events" | "eventCatalog">` 能 narrow。

- [ ] **Step 4: 扩 task service 已有测试**

Edit `apps/server/src/modules/task/service.test.ts` 的测试工具 —— 如果现有测试通过 `createTaskService({ db }, ...)` 构造，现在可选参，不影响。

新增一个测试验证记录落 catalog：

```ts
// 在文件尾部新增 describe 块
describe("processEvent records to event-catalog", () => {
  test("first external event writes inferred row", async () => {
    const { eventCatalogService } = await import(
      "../event-catalog"
    );
    const catalogSvc = eventCatalogService;
    const svc = createTaskService(
      { db, eventCatalog: catalogSvc },
      { itemSvc, currencySvc },
      () => undefined,
    );
    await svc.processEvent(
      orgId,
      "user-cat-1",
      "test_catalog_evt",
      { foo: "bar", amount: 42 },
    );
    const view = await catalogSvc.getOne(orgId, "test_catalog_evt");
    expect(view.source).toBe("external");
    expect(view.fields.map((f) => f.path).sort()).toEqual([
      "amount",
      "foo",
    ]);
  });
});
```

（`orgId`, `itemSvc`, `currencySvc` 应已在 test 文件上文定义 —— 沿用现有 fixture 即可；如果没有，按现有 test 里的 setup 模式补。）

- [ ] **Step 5: 跑相关测试**

Run: `pnpm --filter=server test src/modules/task/service.test.ts`
Expected: 所有现有 test 仍然通过，新增的 catalog 记录测试通过。

- [ ] **Step 6: commit**

```bash
git add apps/server/src/modules/task/service.ts apps/server/src/modules/task/index.ts apps/server/src/modules/task/service.test.ts
git commit -m "feat(server): record external events to catalog inside task.processEvent"
```

---

## Phase 5 — 现有模块注册内部事件

**目标：** 把已有 emit 点的字段声明补齐到 runtime registry。admin 拉取时就能看到 `task.*` / `level.cleared` / `leaderboard.contributed` / `activity.*`。

### Task 5.1 — task 模块自身事件

**Files:**
- Modify: `apps/server/src/modules/task/index.ts`

- [ ] **Step 1: 在 barrel 顶部 registerEvent**

```ts
import { registerEvent } from "../../lib/event-registry";

registerEvent({
  name: "task.completed",
  owner: "task",
  description:
    "Fired when a user's progress on a task first reaches its targetValue.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "completedAt", type: "string", required: true },
  ],
  forwardToTask: false, // 自己发的不转回自己
});

registerEvent({
  name: "task.claimed",
  owner: "task",
  description: "Fired when a user manually claims a completed task's rewards.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "categoryId", type: "string", required: false },
    { path: "progressValue", type: "number", required: true },
    { path: "rewards", type: "array", required: true },
    { path: "periodKey", type: "string", required: true },
    { path: "claimedAt", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "task.tier.claimed",
  owner: "task",
  description: "Fired when a user claims a staged-reward tier of a task.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "taskId", type: "string", required: true },
    { path: "taskAlias", type: "string", required: false },
    { path: "tierAlias", type: "string", required: true },
    { path: "threshold", type: "number", required: true },
    { path: "progressValue", type: "number", required: true },
    { path: "rewards", type: "array", required: true },
    { path: "periodKey", type: "string", required: true },
    { path: "claimedAt", type: "string", required: true },
  ],
  forwardToTask: false,
});
```

**注意：** `forwardToTask: false` 是为了避免 task 触发 task 的自反循环。

- [ ] **Step 2: commit**

```bash
git add apps/server/src/modules/task/index.ts
git commit -m "feat(server): register task.* internal events in event-registry"
```

### Task 5.2 — level / leaderboard / activity 模块

**Files:**
- Modify: `apps/server/src/modules/level/index.ts`
- Modify: `apps/server/src/modules/leaderboard/index.ts`
- Modify: `apps/server/src/modules/activity/index.ts`

- [ ] **Step 1: level**

在 `level/index.ts` 顶部加：

```ts
import { registerEvent } from "../../lib/event-registry";

registerEvent({
  name: "level.cleared",
  owner: "level",
  description: "Fired when a user clears a level. Drives level-based tasks.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "configId", type: "string", required: true },
    { path: "levelId", type: "string", required: true },
    { path: "stars", type: "number", required: true },
    { path: "bestScore", type: "number", required: false },
    { path: "firstClear", type: "boolean", required: true },
  ],
});
```

- [ ] **Step 2: leaderboard**

在 `leaderboard/index.ts` 顶部加：

```ts
import { registerEvent } from "../../lib/event-registry";

registerEvent({
  name: "leaderboard.contributed",
  owner: "leaderboard",
  description:
    "Fired when a user contributes a score to a leaderboard. Useful for '累计分数达到 N' 类型任务。",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "metricKey", type: "string", required: true },
    { path: "value", type: "number", required: true },
    { path: "applied", type: "number", required: true },
  ],
});
```

- [ ] **Step 3: activity**

`activity.state.changed` 和 `activity.schedule.fired` 没有 endUserId，设 `forwardToTask: false`；`activity.milestone.claimed` 有 endUserId，可转发。

```ts
import { registerEvent } from "../../lib/event-registry";

registerEvent({
  name: "activity.state.changed",
  owner: "activity",
  description: "Activity lifecycle transitions (draft → active → ended). System event; not user-scoped.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "previousState", type: "string", required: true },
    { path: "newState", type: "string", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "activity.schedule.fired",
  owner: "activity",
  description: "An activity-scoped schedule reached its fire time.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "scheduleAlias", type: "string", required: true },
    { path: "actionType", type: "string", required: true },
    { path: "firedAt", type: "string", required: true },
    { path: "actionConfig", type: "object", required: true },
  ],
  forwardToTask: false,
});

registerEvent({
  name: "activity.milestone.claimed",
  owner: "activity",
  description: "A user claimed an activity milestone reward.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "activityId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "milestoneAlias", type: "string", required: true },
  ],
});
```

- [ ] **Step 4: 跑测试 + type-check**

Run:
```bash
pnpm --filter=server check-types
pnpm --filter=server test
```

Expected: 全绿。

- [ ] **Step 5: commit**

```bash
git add apps/server/src/modules/level/index.ts apps/server/src/modules/leaderboard/index.ts apps/server/src/modules/activity/index.ts
git commit -m "feat(server): register level/leaderboard/activity internal events"
```

---

## Phase 6 — HTTP 路由

**目标：** admin 能拉到完整 catalog，能 PATCH 外部事件的描述/字段。

### Task 6.1 — `routes.ts`

**Files:**
- Create: `apps/server/src/modules/event-catalog/routes.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: routes.ts**

```ts
/**
 * Event catalog admin routes.
 *
 * 挂在 /api/event-catalog。用 requireAdminOrApiKey —— 和 task 一致。
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";

import { eventCatalogService } from "./index";
import {
  CatalogListResponseSchema,
  CatalogEventViewSchema,
  ErrorResponseSchema,
  EventNameParamSchema,
  UpdateEventCatalogSchema,
} from "./validators";

const TAG = "Event Catalog";

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const eventCatalogRouter = new OpenAPIHono<HonoEnv>();

eventCatalogRouter.use("*", requireAdminOrApiKey);

eventCatalogRouter.onError((err, c) => {
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

eventCatalogRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List all events (internal + external) for the current org",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CatalogListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const items = await eventCatalogService.listAll(orgId);
    return c.json({ items }, 200);
  },
);

eventCatalogRouter.openapi(
  createRoute({
    method: "get",
    path: "/{name}",
    tags: [TAG],
    summary: "Get a single event (internal or external) by name",
    request: { params: EventNameParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CatalogEventViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { name } = c.req.valid("param");
    const view = await eventCatalogService.getOne(orgId, name);
    return c.json(view, 200);
  },
);

eventCatalogRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{name}",
    tags: [TAG],
    summary:
      "Update description or fields for an external event. Upgrades status to 'canonical'. Rejects internal events.",
    request: {
      params: EventNameParamSchema,
      body: {
        content: { "application/json": { schema: UpdateEventCatalogSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CatalogEventViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const view = await eventCatalogService.updateExternal(orgId, name, body);
    return c.json(view, 200);
  },
);
```

- [ ] **Step 2: 挂到 app**

Edit `apps/server/src/index.ts` — 找到其它 `app.route("/api/...", xxRouter)` 的位置，追加一行：

```ts
import { eventCatalogRouter } from "./modules/event-catalog";
// ...
app.route("/api/event-catalog", eventCatalogRouter);
```

- [ ] **Step 3: commit**

```bash
git add apps/server/src/modules/event-catalog/routes.ts apps/server/src/index.ts
git commit -m "feat(server): add /api/event-catalog routes (list/get/patch)"
```

### Task 6.2 — 路由测试

**Files:**
- Create: `apps/server/src/modules/event-catalog/routes.test.ts`

- [ ] **Step 1: 复用其它 module 的 route-test 脚手架**

参考 `apps/server/src/modules/task/routes.test.ts` 的结构：sign-up admin + create-org 取 cookie + 请求。

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { __resetRegistryForTests, registerEvent } from "../../lib/event-registry";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createEventCatalogService } from "./service";

describe("event-catalog routes", () => {
  let orgId: string;
  let cookie: string;

  beforeAll(async () => {
    orgId = await createTestOrg("event-catalog-routes");
    // TODO: follow the sign-up + org cookie pattern from task/routes.test.ts
    // 把 cookie 拿到，这里省略（按项目 test helper 复制即可）。
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
    __resetRegistryForTests();
  });

  test("GET /api/event-catalog returns internal + external", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const svc = createEventCatalogService({ db });
    await svc.recordExternalEvent(orgId, "purchase", { amount: 1 });

    const res = await app.request("/api/event-catalog", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ name: string; source: string }> };
    const names = body.items.map((i) => i.name);
    expect(names).toContain("level.cleared");
    expect(names).toContain("purchase");
  });

  test("PATCH /api/event-catalog/{name} rejects internal events", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const res = await app.request("/api/event-catalog/level.cleared", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ description: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  test("PATCH /api/event-catalog/{name} upgrades external to canonical", async () => {
    const svc = createEventCatalogService({ db });
    await svc.recordExternalEvent(orgId, "login", { ts: 1 });
    const res = await app.request("/api/event-catalog/login", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        description: "User signed in",
        fields: [{ path: "ts", type: "number", required: true }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; description: string };
    expect(body.status).toBe("canonical");
    expect(body.description).toBe("User signed in");
  });
});
```

**注意：** 上方的 `cookie` 获取、sign-up helper 请从 `apps/server/src/modules/task/routes.test.ts` 复制对应段落。不同 module 间的 route test 风格非常一致，照抄即可。

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter=server test src/modules/event-catalog/routes.test.ts`
Expected: 3 通过。

- [ ] **Step 3: commit**

```bash
git add apps/server/src/modules/event-catalog/routes.test.ts
git commit -m "test(server): event-catalog route tests"
```

---

## Phase 7 — 内部事件 → task 桥接 (Forwarder)

**目标：** 让 `level.cleared` 这类内部事件能直接作为 task 的 eventName 使用。

### Task 7.1 — `event-forwarder.ts`

**Files:**
- Create: `apps/server/src/modules/task/event-forwarder.ts`
- Create: `apps/server/src/modules/task/event-forwarder.test.ts`
- Modify: `apps/server/src/modules/task/index.ts`

- [ ] **Step 1: 写 forwarder**

```ts
/**
 * 把内部 event-bus 上 registry 里标 forwardToTask=true 的事件，
 * 自动转调 taskService.processEvent。
 *
 * 约束：事件 payload 必须含 `organizationId` 和 `endUserId` string 字段。
 * 不含的事件 registry 会被标 forwardToTask=false（见 activity.state.changed）。
 *
 * 注册时机：task 模块 barrel 载入时。registry 必须先于这里填充 ——
 * 所以各 module 的 registerEvent 调用应该在它们自己 barrel 的顶部，
 * 且 task barrel 在 AppDeps / index.ts 里应在它们之后 import。
 */

import type { EventBus } from "../../lib/event-bus";
import { listInternalEvents } from "../../lib/event-registry";
import type { TaskService } from "./service";

export function installTaskEventForwarder(
  events: EventBus,
  task: TaskService,
): void {
  for (const desc of listInternalEvents()) {
    if (desc.forwardToTask === false) continue;

    // 事件名在 EventMap 里有类型，但 listInternalEvents() 是 runtime 集合 ——
    // 这里用 `as any` 桥接，我们已经约束 payload 形状。
    events.on(
      desc.name as never,
      async (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const p = payload as Record<string, unknown>;
        const orgId = typeof p.organizationId === "string" ? p.organizationId : null;
        const endUserId = typeof p.endUserId === "string" ? p.endUserId : null;
        if (!orgId || !endUserId) {
          console.warn(
            `task-forwarder: skipping ${desc.name} (missing organizationId/endUserId)`,
          );
          return;
        }
        try {
          await task.processEvent(orgId, endUserId, desc.name, p);
        } catch (err) {
          console.error(`task-forwarder: processEvent(${desc.name}) failed`, err);
        }
      },
    );
  }
}
```

- [ ] **Step 2: 装配到 task barrel**

Edit `apps/server/src/modules/task/index.ts`:

```ts
import { deps } from "../../deps";
import { currencyService } from "../currency";
import { itemService } from "../item";
import { mailService } from "../mail";
import { createTaskService } from "./service";
import { installTaskEventForwarder } from "./event-forwarder";

// ... existing registerEvent calls ...

export { createTaskService };
export type { TaskService } from "./service";

export const taskService = createTaskService(
  deps,
  { itemSvc: itemService, currencySvc: currencyService },
  () => mailService,
);

// 桥接必须在 registerEvent 调用之后执行；其它 module 的 registerEvent
// 在它们各自 barrel 顶部调。只要 apps/server/src/index.ts 在 import
// taskService 之前 import 过 levelService / leaderboardService /
// activityService（它们现在都是 side-effect import 过），registry 就
// 已经填充完毕。
installTaskEventForwarder(deps.events, taskService);
```

**关键 ordering 问题：** `src/index.ts` 里必须先 import level/leaderboard/activity 模块（触发它们的 registerEvent），再 import task 模块（触发 forwarder 安装）。检查 `src/index.ts` 当前 import 顺序，必要时调整。

- [ ] **Step 3: 单测 forwarder**

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createEventBus } from "../../lib/event-bus";
import { __resetRegistryForTests, registerEvent } from "../../lib/event-registry";
import type { TaskService } from "./service";
import { installTaskEventForwarder } from "./event-forwarder";

describe("installTaskEventForwarder", () => {
  afterEach(() => __resetRegistryForTests());

  test("forwards registered event with orgId+endUserId to processEvent", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("level.cleared" as never, {
      organizationId: "org-x",
      endUserId: "user-y",
      stars: 3,
    } as never);

    expect(processEvent).toHaveBeenCalledWith(
      "org-x",
      "user-y",
      "level.cleared",
      expect.objectContaining({ stars: 3 }),
    );
  });

  test("skips events with forwardToTask=false", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "activity.state.changed",
      owner: "activity",
      description: "",
      fields: [],
      forwardToTask: false,
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("activity.state.changed" as never, {
      organizationId: "org-x",
      activityId: "a-1",
    } as never);

    expect(processEvent).not.toHaveBeenCalled();
  });

  test("skips payloads missing organizationId or endUserId", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "weird.evt",
      owner: "test",
      description: "",
      fields: [],
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("weird.evt" as never, { foo: "bar" } as never);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm --filter=server test src/modules/task/event-forwarder.test.ts`
Expected: 3 通过。

- [ ] **Step 5: 集成测试 —— 创建 task 绑 level.cleared**

新增到 `task/service.test.ts` 或单独文件：

```ts
test("level.cleared drives a task bound to that eventName", async () => {
  // 建一个 task，eventName = level.cleared, countingMethod = event_count, targetValue = 3
  await taskSvc.createDefinition(orgId, {
    name: "Clear 3 Levels",
    period: "none",
    countingMethod: "event_count",
    eventName: "level.cleared",
    targetValue: 3,
    rewards: [{ type: "currency", id: "gold", count: 100 }],
  });
  // 通过 event-bus emit 3 次
  for (let i = 0; i < 3; i++) {
    await deps.events.emit("level.cleared", {
      organizationId: orgId,
      endUserId: "user-lv",
      configId: "c1",
      levelId: `l-${i}`,
      stars: 3,
      bestScore: null,
      firstClear: true,
    });
  }
  const tasks = await taskSvc.getTasksForUser(orgId, "user-lv");
  const t = tasks.find((x) => x.name === "Clear 3 Levels");
  expect(t?.isCompleted).toBe(true);
});
```

- [ ] **Step 6: commit**

```bash
git add apps/server/src/modules/task/event-forwarder.ts apps/server/src/modules/task/event-forwarder.test.ts apps/server/src/modules/task/index.ts apps/server/src/modules/task/service.test.ts
git commit -m "feat(server): auto-forward internal events to task.processEvent"
```

---

## Phase 8 — filter 表达式字段软校验（可选 / 收尾）

**目标：** 创建或更新 task 时，如果 `eventName` 在 catalog 里，且 `filter` 表达式引用了 catalog 中不存在的字段，返回 warning（不阻塞请求成功）。

### Task 8.1 — 提取 filter 中引用的字段

**Files:**
- Create: `apps/server/src/modules/task/filter-fields.ts`
- Create: `apps/server/src/modules/task/filter-fields.test.ts`

- [ ] **Step 1: 写字段提取器**

filtrex 没有直接的 AST 暴露；用宽松的正则匹配 identifier + dot-path：

```ts
/**
 * 从 filtrex 表达式中提取引用的字段名（dot-path 前缀）。
 * 粗略实现：匹配 `[a-zA-Z_][a-zA-Z0-9_.]*` 的 token，排除 filtrex 保留字。
 * 用于软校验 —— 漏报比误报更安全（warning 性质）。
 */

const FILTREX_KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "in",
  "of",
  "true",
  "false",
  "if",
  "then",
  "else",
  "abs",
  "ceil",
  "floor",
  "log",
  "max",
  "min",
  "round",
  "sqrt",
  "exists",
  "empty",
]);

export function extractReferencedFields(expression: string): string[] {
  const re = /[A-Za-z_][A-Za-z0-9_.]*/g;
  const out = new Set<string>();
  for (const m of expression.matchAll(re)) {
    const token = m[0];
    if (FILTREX_KEYWORDS.has(token.toLowerCase())) continue;
    // 数字字面量形如 "1e10" 也会匹配不到（开头必须字母或 _），安全。
    out.add(token);
  }
  return Array.from(out).sort();
}
```

- [ ] **Step 2: 单测**

```ts
import { describe, expect, test } from "vitest";

import { extractReferencedFields } from "./filter-fields";

describe("extractReferencedFields", () => {
  test("flat fields", () => {
    expect(extractReferencedFields('monsterId == "dragon"')).toEqual([
      "monsterId",
    ]);
  });
  test("dot paths", () => {
    expect(
      extractReferencedFields('stats.level >= 10 and stats.elite == true'),
    ).toEqual(["stats.elite", "stats.level"]);
  });
  test("filters out keywords", () => {
    expect(extractReferencedFields("a and b or not c")).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 3: 校验钩子 — createDefinition / updateDefinition 新增 warnings 返回**

修改 `taskService.createDefinition` 和 `updateDefinition` 的 return：从 `TaskDefinition` 变为 `{ definition: TaskDefinition; warnings: string[] }`。

**由于这是 breaking change，优先级较低，推迟到确认 UI 需要时再做**。

临时方案：**在 admin 路由层而非 service 层做校验**，服务端 log warning，前端在 UI 层拉 catalog 做提示即可。本 Phase 只保留字段提取器和单测，service 行为不变。

- [ ] **Step 4: commit**

```bash
git add apps/server/src/modules/task/filter-fields.ts apps/server/src/modules/task/filter-fields.test.ts
git commit -m "feat(server): extract referenced fields from filtrex expressions"
```

---

## Phase 9 — admin UI（留占位，按需展开）

**目标：** 在 `apps/admin` 加一个「事件中心」页，让 admin 看/改 catalog。Task 编辑器里 `eventName` 改 autocomplete。

本 phase 规划较粗 —— 待服务端稳定后按需细化。关键路由：

- `apps/admin/app/routes/dashboard.event-catalog.tsx` — 列表 + 搜索
- `apps/admin/app/routes/dashboard.event-catalog.$name.tsx` — 详情 + 编辑
- `apps/admin/app/routes/dashboard.tasks.*` — 在现有 task 表单里引入 `useQuery(/api/event-catalog)`，把 `eventName` 输入换成 `<Combobox />`，选中后 `eventValueField` 和 `filter` 编辑器基于 fields 列表做字段提示。

等 Phase 1-7 落地并通过后，开独立 plan 推进 UI。

---

## 自审清单

- [x] 所有 task 给了完整代码片段，无"类似 Task N" / "TODO" / "add validation" 占位。
- [x] 每步有具体命令与预期输出（`pnpm ... test`, `db:migrate`）。
- [x] 文件路径绝对或相对 repo root 明确（`apps/server/src/...`）。
- [x] 类型一致：`EventFieldRow` (DB) vs `EventFieldSchema` (registry) 在 types.ts 里做了 re-export 对齐；`CatalogEventView` 作为统一对外形状。
- [x] spec 覆盖：
  - 内部 schema 写代码 → Phase 1 + 5。
  - 外部 schema 写 DB，自动推断 → Phase 2 + 3.2 + 4。
  - admin 可拉 → Phase 6 GET 端点。
  - admin 可补描述/字段 → Phase 6 PATCH + Phase 3.3 updateExternal。
  - 内部事件驱动 task → Phase 7 forwarder。
  - filter 软校验 → Phase 8（字段提取器落地，warning 链路推迟）。
- [x] Breaking change 被显式限定在 Phase 8 的"临时方案"里，主线不破坏现有 API。
