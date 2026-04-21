/**
 * `/docs-md/<locale>/<...slug>` — 返回单页的纯 markdown(由
 * source.config.ts 里的 remarkLLMs 插件编译期注入到
 * page.data._markdown)。
 *
 * 用途:
 * 1. MarkdownCopyButton 的 markdownUrl 指向此端点,让读者一键复制
 *    本页 markdown 喂给 LLM。
 * 2. 直接 curl 也能拿到单页 markdown,方便脚本化抓取。
 */
import { createFileRoute, notFound } from '@tanstack/react-router'
import { source } from '#/lib/source'

export const Route = createFileRoute('/docs-md/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = params._splat?.split('/') ?? []
        const page = source.getPage(slugs)
        if (!page) throw notFound()
        const md = (page.data as { _markdown?: string })._markdown ?? ''
        return new Response(md, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'public, max-age=600',
          },
        })
      },
    },
  },
})
