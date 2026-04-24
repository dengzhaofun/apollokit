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
import { i18n } from '#/lib/source'
import { source } from '#/lib/source-server'

export const Route = createFileRoute('/docs-md/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // URL 形如 /docs-md/zh/errors —— splat = ['zh', 'errors']。
        // source 是 i18n loader(parser:'dir'),必须把 locale 拆成第二个参数
        // 喂给 getPage,否则 ['zh','errors'] 会被当成 slug 路径找不到页面。
        const raw = params._splat?.split('/').filter(Boolean) ?? []
        const [first, ...rest] = raw
        // 宽化 readonly ('zh'|'en')[] 成 string[] 以便用任意字符串查。
        const langs: readonly string[] = i18n.languages
        const hasLocale = first && langs.includes(first)
        const locale = hasLocale ? first : i18n.defaultLanguage
        const slugs = hasLocale ? rest : raw
        const page = source.getPage(slugs, locale)
        if (!page) throw notFound()
        // postprocess.includeProcessedMarkdown 的访问方式是
        // page.data.getText('processed'),不是直接读 `_markdown`(那是
        // 内部字段名、且 remarkLLMs 只在 MDX 编译管线里手挂时才暴露)。
        const getText = (page.data as { getText?: (k: string) => Promise<string> | string }).getText
        const md = getText ? await getText('processed') : ''
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
