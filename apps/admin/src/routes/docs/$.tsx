import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsPage, DocsBody } from 'fumadocs-ui/page'
import type { Root as PageTreeRoot } from 'fumadocs-core/page-tree'
import { source, i18n } from '#/lib/source'
import { baseOptions } from '#/lib/layout.shared'
import browserCollections from 'collections/browser'

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
    return {
      kind: 'page' as const,
      path: page.path,
      tree: source.getPageTree(locale) as object,
      locale,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, default: MDX }) {
    return (
      <DocsBody>
        <h1>{frontmatter.title}</h1>
        <MDX />
      </DocsBody>
    )
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
      <DocsPage>{clientLoader.useContent(data.path)}</DocsPage>
    </DocsLayout>
  )
}
