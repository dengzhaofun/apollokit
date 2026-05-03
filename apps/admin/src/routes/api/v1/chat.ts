/**
 * `/api/v1/chat` — Fumadocs Ask-AI backend.
 *
 * 客户端 (`components/ai/search.tsx`) 通过 `@ai-sdk/react` 的 `useChat`
 * 把每条用户消息 POST 到这里。我们用 OpenRouter 跑 LLM,通过 ai SDK 的
 * tool calling 把 fumadocs 的 Orama 搜索引擎 (`/api/v1/search` 同一份索引)
 * 暴露给模型,让它先检索再答题。
 *
 * 区别于 fumadocs CLI 默认生成 (Next.js + flexsearch + process.env):
 *   - flexsearch 在 Workers 里启动慢且每个 isolate 都要重建,这里改用
 *     fumadocs-core 自带的 createFromSource(Orama),按 locale 分片;
 *   - process.env 在 Workers 里是空的,改用 cloudflare:workers `env`,
 *     dev (Node SSR) 通过 dotenv 把 `.dev.vars` 注入 process.env 做兜底;
 *   - Next.js route handler 直接 export POST,这里是 TanStack Start 的
 *     `createFileRoute` + `server.handlers.POST`(同 routes/api/v1/search.ts)。
 */
import { createFileRoute } from '@tanstack/react-router'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { createFromSource } from 'fumadocs-core/search/server'
import { createTokenizer as createMandarinTokenizer } from '@orama/tokenizers/mandarin'
import { source } from '#/lib/source-server'
import { i18n } from '#/lib/source'

// 跟 routes/api/v1/search.ts 用同一份 Orama 索引(loader 里的 search.url 字段
// 与 page.url 等价),工具调用直接走它就行,免得再起一份内存索引。
const searchAPI = createFromSource(source, {
  localeMap: {
    zh: { components: { tokenizer: createMandarinTokenizer() } },
    en: 'english',
  },
})

// `data-locale` part 由前端 useChat sendMessage 时塞进去,让模型知道用户
// 当前在哪种语言的 docs 里——影响搜索分片和回答语种。
export type ChatUIMessage = UIMessage<
  never,
  {
    locale: { locale: string; pathname?: string }
  }
>

const SearchToolInput = z.object({
  query: z.string().min(1).max(200),
  locale: z.enum(['zh', 'en']).optional(),
  limit: z.number().int().min(1).max(20).default(8),
})

type EnvShape = {
  OPENROUTER_API_KEY?: string
  OPENROUTER_DOCS_AGENT_MODEL?: string
  OPENROUTER_ADMIN_AGENT_MODEL?: string
}

// dev 路径(vite Node SSR)`cloudflare:workers` 不可解析,vite.config.ts
// 把它 external 掉,这里 catch 后回退到 process.env。.dev.vars 由
// `@cloudflare/vite-plugin` 在 build 模式下自动注入,dev 模式下 (Node)
// 不会自动加载,所以本地跑 chat 需要手动 source 一下,或者把
// OPENROUTER_API_KEY 也塞到 shell env 里。
async function readEnv(): Promise<EnvShape> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: EnvShape }
    if (mod.env && (mod.env.OPENROUTER_API_KEY || mod.env.OPENROUTER_DOCS_AGENT_MODEL)) {
      return mod.env
    }
  } catch {
    // fallthrough
  }
  return {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_DOCS_AGENT_MODEL: process.env.OPENROUTER_DOCS_AGENT_MODEL,
    OPENROUTER_ADMIN_AGENT_MODEL: process.env.OPENROUTER_ADMIN_AGENT_MODEL,
  }
}

const DEFAULT_MODEL = 'moonshotai/kimi-k2-thinking'

const SYSTEM_PROMPT = [
  'You are the ApolloKit documentation assistant.',
  'ApolloKit is a multi-tenant SaaS toolkit for game backends — modules cover check-in, currency, lottery, mail, leaderboards, item, exchange, dialogue, etc. The admin app is the operator dashboard, the server is a Cloudflare Worker on Hono + Drizzle + Neon.',
  'Workflow:',
  '  1. Always call the `search_docs` tool first with a focused query before answering anything substantive.',
  '  2. Pass the user-provided `locale` (zh|en) into `search_docs` so results match the language of the docs they are reading; if the user explicitly switches languages, use that instead.',
  '  3. Ground every claim in the returned snippets — do not invent field names, env vars, route paths, or response shapes that are not in the search results. If the docs do not cover a question, say so plainly and suggest a more specific query.',
  '  4. Cite sources inline as Markdown links. Use the EXACT `url` value from each search result verbatim — it already starts with `/docs/<locale>/<slug>` and may include a `#hash`. NEVER prepend a hostname, NEVER guess a different domain, NEVER rewrite the path. Use a short descriptive phrase from the doc as the link text (e.g. `[签到配置](/docs/zh/check-in#...)`), not just an arrow or "↗".',
  '  5. Prefer 1-3 citations per answer.',
  '  6. Reply in the same language the user wrote in. If the user is on a `zh` page and writes Chinese, reply in Chinese; same for English.',
  'Style: concise, technical, code-first. Use fenced code blocks for snippets. Do not chit-chat.',
].join('\n')

export const Route = createFileRoute('/api/v1/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = await readEnv()
        if (!env.OPENROUTER_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'OPENROUTER_API_KEY is not configured' }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          )
        }

        // 在 TanStack Start dev 路径上,Sentry 的 cloudflare wrapper 会
        // 顺手把 Request body 读一次用于错误上报,导致 `request.json()`
        // 抛 "Body is unusable: Body has already been read"。
        // clone() 返回一个独立的可读副本,绕过这个状态。
        const body = (await request.clone().json()) as {
          messages?: ChatUIMessage[]
        }
        const messages = body.messages ?? []

        // useChat 把当前页 locale 作为一个 data part 塞进 user 消息里。
        // 我们读最近一条 user 消息的 locale,用作 search 工具的默认值。
        const lastLocale = pickLastLocale(messages) ?? i18n.defaultLanguage

        const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
        const modelId =
          env.OPENROUTER_DOCS_AGENT_MODEL ??
          env.OPENROUTER_ADMIN_AGENT_MODEL ??
          DEFAULT_MODEL

        const searchDocs = tool({
          description:
            'Search ApolloKit documentation. Returns ranked snippets with `id`, `url`, `content`. Always call this before answering.',
          inputSchema: SearchToolInput,
          async execute({ query, locale, limit }) {
            const targetLocale = locale ?? lastLocale
            const url = new URL('http://internal/api/v1/search')
            url.searchParams.set('query', query)
            url.searchParams.set('locale', targetLocale)
            const fakeReq = new Request(url.toString())
            const res = await searchAPI.GET(fakeReq)
            if (!res.ok) {
              return { error: `search failed (${res.status})`, results: [] }
            }
            const raw = (await res.json()) as Array<{
              id: string
              url: string
              content: string
              type?: string
            }>
            return { locale: targetLocale, results: raw.slice(0, limit) }
          },
        })

        const result = streamText({
          model: openrouter.chat(modelId),
          stopWhen: stepCountIs(5),
          tools: { search_docs: searchDocs },
          toolChoice: 'auto',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            // ai v6 的 convertToModelMessages 返回 Promise(因为 data part
            // 转换器允许 async),展开前必须 await,否则 TS 会报
            // “Promise 不可迭代”,运行时也会拿到一个 Promise 对象。
            ...(await convertToModelMessages<ChatUIMessage>(messages, {
              convertDataPart(part) {
                if (part.type === 'data-locale') {
                  return {
                    type: 'text',
                    text: `[Reader is on ${(part.data as { locale: string }).locale} docs]`,
                  }
                }
              },
            })),
          ],
        })

        return result.toUIMessageStreamResponse()
      },
    },
  },
})

// 给客户端 (`components/ai/search.tsx`) 拿来打类型用。
// 实际 execute 在 handler 里被替换成真实实现,这个 stub 仅供 typeof 推断。
const searchDocsToolType = tool({
  description: '',
  inputSchema: SearchToolInput,
  async execute(): Promise<{
    locale: string
    results: Array<{ id: string; url: string; content: string }>
    error?: string
  }> {
    return { locale: 'zh', results: [] }
  },
})
export type SearchDocsTool = typeof searchDocsToolType

function pickLastLocale(messages: ChatUIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    for (const part of m.parts ?? []) {
      if (part.type === 'data-locale') {
        const data = (part as { data?: { locale?: string } }).data
        if (data?.locale) return data.locale
      }
    }
  }
}
