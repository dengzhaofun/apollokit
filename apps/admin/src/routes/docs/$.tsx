import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsPage, DocsBody } from 'fumadocs-ui/page'
import { MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import { useFumadocsLoader } from 'fumadocs-core/source/client'
import type { TOCItemType } from 'fumadocs-core/toc'
import { i18n } from '#/lib/source'
import { source } from '#/lib/source-server'
import { getBaseOptions } from '#/lib/layout.shared'
import { APIPage } from '#/lib/openapi'
import browserCollections from 'collections/browser'

// Generated API-reference MDX (under content/docs/{locale}/api/) embeds
// `<APIPage document="apollokit" operations={[...]} />`. We ship our
// configured `APIPage` factory through the MDX `components` map so the
// generated pages render with our shiki theme + our schema registry.
const mdxComponents = { ...defaultMdxComponents, APIPage }

const REPO_OWNER = 'dengzhaofun'
const REPO_NAME = 'apollokit'
const REPO_BRANCH = 'main'
const CONTENT_ROOT = 'apps/admin/content/docs'

// 递归把 ReactNode 拍扁成纯字符串,专用于 loader 序列化前把 toc.title 处理成
// seroval 吃得下的形状。MDX heading 里混入 `<code>` / emoji 等 JSX 时,这里
// 会保留文字丢弃标签——对右侧 "On this page" 列表的视觉损失可以忽略。
function reactNodeToText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeToText).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    const props = (node as { props?: { children?: unknown } }).props
    return reactNodeToText(props?.children)
  }
  return ''
}

const getPageData = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: rawSlugs }) => {
    const [first, ...rest] = rawSlugs
    // 宽化 readonly ('zh'|'en')[] 成 string[] 以便用任意字符串查。
    const langs: readonly string[] = i18n.languages
    const hasLocale = first && langs.includes(first)

    if (!hasLocale) {
      // 兼容旧链接 /docs/foo → /docs/zh/foo
      return {
        redirectTo: `/docs/${i18n.defaultLanguage}${rawSlugs.length ? '/' + rawSlugs.join('/') : ''}`,
      } as const
    }

    const locale = first
    const slugs = rest
    const page = source.getPage(slugs, locale)
    if (!page) throw notFound()

    const data = page.data as {
      title?: string
      lastModified?: Date | string | number
      // fumadocs-mdx 编译期从 MDX headings 生成 toc,挂在 page.data.toc;
      // DocsPage 拿到后渲染右侧 "On this page"。
      toc?: TOCItemType[]
    }

    // page tree 含 React 元素图标,直接返回会让 seroval 炸;走 fumadocs
      // 官方的 serializePageTree(server) + useFumadocsLoader(client) 组合,
      // 客户端 hook 会把 SerializedPageTree 再 deserialize 成可渲染的 tree。
    const tree = await source.serializePageTree(source.getPageTree(locale))

    // toc 项里 `title` 的类型是 ReactNode(MDX heading 可能夹 inline code 等
    // JSX),直接回传又会让 seroval 炸 Symbol(react.element)。文档 heading
    // 99% 是纯文本,这里把 title 展平成字符串再走过去,丢失一点格式能换整
    // 条 loader 不崩——DocsPage 拿到 string title 照样渲染。
    const tocFlat = (data.toc ?? []).map((item) => ({
      url: item.url,
      depth: item.depth,
      title: reactNodeToText(item.title),
    }))

    return {
      kind: 'page' as const,
      path: page.path,
      tree,
      locale,
      title: data.title ?? '',
      toc: tocFlat,
      // page.url 形如 /docs/zh/quickstart;同路径的 plain markdown 走
      // /docs-md/zh/quickstart(由 routes/docs-md/$.tsx 提供)。
      markdownUrl: page.url.replace(/^\/docs\//, '/docs-md/'),
      githubPath: `${CONTENT_ROOT}/${page.path}`,
      // fumadocs-mdx last-modified 插件构建期跑 git log 注入 Date;
      // 序列化成毫秒数喂给客户端,避开 Date 在 JSON 上的坑。
      lastModified:
        data.lastModified instanceof Date
          ? data.lastModified.getTime()
          : typeof data.lastModified === 'number'
            ? data.lastModified
            : typeof data.lastModified === 'string'
              ? new Date(data.lastModified).getTime()
              : null,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  // 只渲染 MDX 主体,标题与页头操作交给 Page 组件统一布置,
  // 方便把 MarkdownCopyButton 摆在标题右侧。
  component({ default: MDX }) {
    return <MDX components={mdxComponents} />
  },
})

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const raw = params._splat?.split('/').filter(Boolean) ?? []
    const data = await getPageData({ data: raw })
    if ('redirectTo' in data) {
      throw redirect({ href: data.redirectTo })
    }
    await clientLoader.preload(data.path)
    return data
  },
})

function Page() {
  // useFumadocsLoader 会扫 loader 返回值,把 SerializedPageTree 字段
  // 自动 deserialize 成 PageTree。客户端就不需要再跑 source.getPageTree,
  // 从而也避开 node:path 被 Vite externalize 的浏览器告警。
  const data = useFumadocsLoader(Route.useLoaderData())
  if (!('locale' in data)) return null
  // 顶部 nav 链接(OpenAPI / 控制台 / 首页)按当前 locale 渲染,
  // 避免英文站点击 OpenAPI 跳到中文目录。
  const layoutOptions = getBaseOptions(data.locale as 'zh' | 'en')
  return (
    <DocsLayout {...layoutOptions} tree={data.tree}>
      <DocsPage
        // toc 驱动右侧 "On this page";footer(prev/next)默认 enabled=true,
        // 它读 DocsLayout 的 pageTree 再匹配当前 pathname 自动算邻居,不需要
        // 显式传 items。
        toc={data.toc as TOCItemType[]}
        editOnGithub={{
          owner: REPO_OWNER,
          repo: REPO_NAME,
          sha: REPO_BRANCH,
          path: data.githubPath,
        }}
        lastUpdate={data.lastModified ?? undefined}
      >
        <DocsBody>
          <div className="not-prose mb-6 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {data.title}
            </h1>
            <MarkdownCopyButton markdownUrl={data.markdownUrl} />
          </div>
          {clientLoader.useContent(data.path)}
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  )
}
