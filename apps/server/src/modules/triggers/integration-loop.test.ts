/**
 * 完整 fan-out 闭环集成测 ——
 *   events.emit("task.completed")
 *     → event-dispatcher 订阅
 *     → 经 EventQueueStub 替代 EVENTS_QUEUE
 *     → createQueueHandler 处理 batch
 *     → webhooksService.dispatch 写 webhooks_deliveries pending 行
 *     → ctx.waitUntil 触发 deliverPending
 *     → 通过注入的 fetchImpl 完成 HTTP POST(本测试拦截后断言)
 *
 * 这是 plan M2 / M3 的 e2e 验证,等价于 wrangler dev 真闭环,但用真本地 pg
 * + stub queue + stub fetch,跑测速度上百倍。
 */

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { eq } from "drizzle-orm"

import { db } from "../../db"
import { createEventBus } from "../../lib/event-bus"
import { __resetRegistryForTests, registerEvent } from "../../lib/event-registry"
import { handleEnvelope } from "../../queue"
import { webhooksDeliveries, webhooksEndpoints } from "../../schema/webhooks"
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures"
import { createEventQueueStub } from "../../testing/event-queue-stub"
import { createWebhooksService } from "../webhooks/service"
import { installEventDispatcher } from "../../lib/event-dispatcher"

const APP_SECRET = "test-app-secret-32-bytes-minimum-xxxxxxxxx"

describe("trigger-loop integration — emit → queue → dispatch → HTTP POST", () => {
  let orgId: string

  beforeAll(async () => {
    orgId = await createTestOrg("trigger-loop")
    // task.completed 在生产 registry 里已经声明带 webhook capability,
    // 但单测里 registry 是模块级 isolate 共享。显式注册一遍以保证可见。
    __resetRegistryForTests()
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "test",
      fields: [],
      capabilities: ["analytics", "webhook"],
    })
  })

  afterAll(async () => {
    await db
      .delete(webhooksDeliveries)
      .where(eq(webhooksDeliveries.organizationId, orgId))
    await db
      .delete(webhooksEndpoints)
      .where(eq(webhooksEndpoints.organizationId, orgId))
    await deleteTestOrg(orgId)
  })

  test("full loop: subscribe endpoint → emit event → POST delivered", async () => {
    // 1. fetchImpl stub —— 拦截真实 HTTP 出去,断言 receiver 收到 POST
    const receivedRequests: Array<{
      url: string
      method?: string
      headers: Record<string, string>
      body: unknown
    }> = []
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      const headers: Record<string, string> = {}
      if (init?.headers) {
        for (const [k, v] of Object.entries(
          init.headers as Record<string, string>,
        )) {
          headers[k.toLowerCase()] = v
        }
      }
      const body = init?.body
        ? JSON.parse(init.body.toString())
        : undefined
      receivedRequests.push({ url, method: init?.method, headers, body })
      return new Response("ok", { status: 200 })
    }) as unknown as typeof fetch

    // 2. webhooks service —— 真 db,真 crypto,但 fetchImpl 拦截
    const webhooks = createWebhooksService(
      { db, appSecret: APP_SECRET },
      { fetchImpl: fakeFetch },
    )
    const { endpoint } = await webhooks.createEndpoint(orgId, {
      name: "test-receiver",
      url: "https://receiver.test/hook",
      eventTypes: ["task.completed"],
    })
    expect(endpoint.id).toBeDefined()

    // 3. event-bus + bridge + queue stub
    const events = createEventBus()
    const queueStub = createEventQueueStub()
    installEventDispatcher(
      events,
      async ({ eventName, orgId: o, payload, capabilities }) => {
        await queueStub.send({
          name: eventName,
          orgId: o,
          payload,
          capabilities,
          traceId: "test-trace",
          emittedAt: Date.now(),
        })
      },
    )

    // 4. emit ——> bridge ——> stub queue
    await events.emit("task.completed" as never, {
      organizationId: orgId,
      endUserId: "u-1",
      taskId: "t-1",
      taskAlias: "daily-1",
      progressValue: 1,
      completedAt: new Date().toISOString(),
    } as never)

    expect(queueStub.sent).toHaveLength(1)
    expect(queueStub.sent[0]?.name).toBe("task.completed")
    expect(queueStub.sent[0]?.orgId).toBe(orgId)

    // 5. consumer 处理消息 ——> dispatch + deliverPending
    const ctxWaitUntil: Promise<unknown>[] = []
    const fakeCtx = {
      waitUntil: (p: Promise<unknown>) => ctxWaitUntil.push(p),
      passThroughOnException: () => {},
    } as unknown as ExecutionContext

    const fakeTriggers = { evaluate: vi.fn(async () => []) }
    for (const msg of queueStub.sent) {
      await handleEnvelope(
        msg,
        { webhooks, triggers: fakeTriggers },
        fakeCtx,
      )
    }
    // ctx.waitUntil(deliverPending()) 注册的 promise — 等它跑完
    await Promise.all(ctxWaitUntil)

    // 6. 断言 deliveries 表写入了 1 行 + status='success'
    const deliveries = await db
      .select()
      .from(webhooksDeliveries)
      .where(eq(webhooksDeliveries.organizationId, orgId))
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.eventType).toBe("task.completed")
    expect(deliveries[0]?.status).toBe("success")

    // 7. 断言 fakeFetch 收到了正确的 POST + HMAC 签名 header
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    expect(receivedRequests).toHaveLength(1)
    const req = receivedRequests[0]!
    expect(req.url).toBe("https://receiver.test/hook")
    expect(req.method).toBe("POST")
    expect(req.headers["x-apollokit-event-type"]).toBe("task.completed")
    expect(req.headers["x-apollokit-signature"]).toMatch(/^v1=[a-f0-9]{64}$/)
    expect(req.headers["x-apollokit-timestamp"]).toMatch(/^\d+$/)
    expect(req.headers["content-type"]).toBe("application/json")
    expect(req.body).toMatchObject({
      type: "task.completed",
      organization_id: orgId,
      data: expect.objectContaining({
        organizationId: orgId,
        endUserId: "u-1",
        taskId: "t-1",
      }),
    })
  })
})
