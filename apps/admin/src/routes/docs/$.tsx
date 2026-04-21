import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsPage, DocsBody } from 'fumadocs-ui/page'
import { MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { Root as PageTreeRoot } from 'fumadocs-core/page-tree'
import { source, i18n } from '#/lib/source'
import { baseOptions } from '#/lib/layout.shared'
import browserCollections from 'collections/browser'

const REPO_OWNER = 'dengzhaofun'
const REPO_NAME = 'apollokit'
const REPO_BRANCH = 'main'
const CONTENT_ROOT = 'apps/admin/content/docs'

const getPageData = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: rawSlugs }) => {
    const [first, ...rest] = rawSlugs
    const hasLocale = first && i18n.languages.includes(first)

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
    }

    return {
      kind: 'page' as const,
      path: page.path,
      tree: source.getPageTree(locale) as object,
      locale,
      title: data.title ?? '',
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
    return <MDX components={defaultMdxComponents} />
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
  const data = Route.useLoaderData()
  if (!('tree' in data)) return null
  return (
    <DocsLayout {...baseOptions} tree={data.tree as PageTreeRoot}>
      <DocsPage
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
