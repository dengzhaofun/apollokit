/**
 * Event catalog service.
 *
 * 职责：
 *   1. 记录外部事件（自动字段推断 + upsert，带 TTL 去重）。
 *   2. 合并内部 registry 与外部 DB 行，输出统一 view 给 admin。
 *   3. 接受 admin 的 PATCH 把外部事件升级为 canonical。
 *
 * 不做：
 *   - 不处理内部事件的注册 —— 那是各 module barrel 的职责（见
 *     `src/lib/event-registry.ts`）。
 *   - 不做 filter 表达式校验 —— 那是 task 模块的职责。
 */

import { and, desc, eq } from "drizzle-orm";

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
  type EventCatalogEntry,
  externalToView,
  internalToView,
} from "./types";
import type { EventFieldRow } from "../../schema/event-catalog";

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
      const existing = rows[0] as EventCatalogEntry | undefined;

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
      const nextFields: EventFieldRow[] =
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
      fields?: EventFieldRow[];
    },
  ): Promise<CatalogEventView> {
    if (getInternalEvent(eventName)) {
      throw new EventCatalogReadOnly(
        "internal event, edit source code instead",
      );
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
