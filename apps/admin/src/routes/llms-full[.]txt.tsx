/**
 * `/llms-full.txt` — 全库 Markdown 拼接,供 LLM 做全文 QA。
 *
 * fumadocs-mdx 的 postprocess.includeProcessedMarkdown 在编译期把每页
 * stringify 回纯 markdown,运行时通过 page.data.getText('processed') 取,
 * 驱动这个端点(以及 /llms.txt、/docs-md/...)。
 */
import { createFileRoute } from '@tanstack/react-router'
import { i18n } from '#/lib/source'
import { source } from '#/lib/source-server'

type DocData = { title?: string; getText?: (k: string) => Promise<string> | string }

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
            const data = page.data as DocData
            const title = data.title ?? page.slugs.join('/')
            const md = data.getText ? await data.getText('processed') : ''
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
