import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsPage, DocsBody } from 'fumadocs-ui/page'
import { source } from '#/lib/source'
import { baseOptions } from '#/lib/layout.shared'
import browserCollections from 'collections/browser'

const getPageData = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()
    return {
      path: page.path,
      tree: source.pageTree as object,
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
    const data = await getPageData({ data: params._splat?.split('/') ?? [] })
    await clientLoader.preload(data.path)
    return data
  },
})

function Page() {
  const data = Route.useLoaderData()
  return (
    <DocsLayout {...baseOptions} tree={data.tree}>
      <DocsPage>
        {clientLoader.useContent(data.path)}
      </DocsPage>
    </DocsLayout>
  )
}
