/**
 * `/llms-full.txt` — 全库 Markdown 拼接,供 LLM 做全文 QA。
 *
 * remarkLLMs 插件把每页 MDX 编译成纯 markdown 并挂在 page.data._markdown
 * (见 apps/admin/source.config.ts)。本路由遍历所有页面,按 locale
 * 分组、按 URL 排序,用清晰的分隔符拼接。
 */
import { createFileRoute } from '@tanstack/react-router'
import { source, i18n } from '#/lib/source'

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        const chunks: string[] = []

        for (const lang of i18n.languages) {
          const pages = source.getPages(lang)
          const sorted = [...pages].sort((a, b) => a.url.localeCompare(b.url))
          const heading =
            lang === 'zh'
              ? `# ApolloKit 开发者文档 (zh) — 全文\n\n共 ${sorted.length} 页`
              : `# ApolloKit Developer Docs (en) — Full Text\n\n${sorted.length} pages`
          chunks.push(heading)

          for (const page of sorted) {
            const data = page.data as { title?: string; _markdown?: string }
            const title = data.title ?? page.slugs.join('/')
            const md = data._markdown ?? ''
            chunks.push(
              `\n\n---\n\n## ${title}\n\nSource: ${page.url}\n\n${md}`,
            )
          }
        }

        return new Response(chunks.join('\n'), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=600',
          },
        })
      },
    },
  },
})
