/**
 * `/llms.txt` — 短索引,按 llms.txt 约定 (https://llmstxt.org) 供 LLM
 * 发现本站内容结构。fumadocs-core 的 `llms(source)` 基于 page tree
 * 自动生成 Markdown 索引,标题 + 描述 + 链接,每个 locale 一段。
 */
import { createFileRoute } from '@tanstack/react-router'
import { llms } from 'fumadocs-core/source'
import { i18n } from '#/lib/source'
import { source } from '#/lib/source-server'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const builder = llms(source)
        const parts = i18n.languages.map((lang) => {
          const heading = lang === 'zh' ? '# ApolloKit 开发者文档' : '# ApolloKit Developer Docs'
          return `${heading}\n\n${builder.index(lang)}`
        })
        const body = parts.join('\n\n---\n\n')
        return new Response(body, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=600',
          },
        })
      },
    },
  },
})
