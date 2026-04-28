import {
  applyMdxPreset,
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import lastModified from 'fumadocs-mdx/plugins/last-modified';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      // 侧栏/首页 Card 图标(lucide 名称,如 "Rocket"、"Coins"),由
      // lib/source.ts 的 IconResolver 映射到 React 组件。
      icon: z.string().optional(),
      // 首页展示用的预览图路径。
      preview: z.string().optional(),
      // 标记 beta / planned / deprecated / new,渲染在标题旁。
      tag: z.enum(['beta', 'planned', 'deprecated', 'new']).optional(),
      // full: true 时不显示右侧 TOC(用于 landing 类页面)。
      full: z.boolean().optional(),
    }),
    // 让 fumadocs-mdx 编译期把 MDX stringify 回纯 markdown,注入
    // page.data._markdown,驱动 /llms.txt、/llms-full.txt、/docs-md/... 三个
    // LLM 端点。这是官方推荐入口,内部会自动挂 remarkLLMs,不要再手动往
    // mdxOptions.remarkPlugins 里塞——手塞会和默认 preset 顺序冲突导致
    // _markdown 为空 / 默认 remark 链(gfm、shiki)被整个覆盖。
    postprocess: {
      includeProcessedMarkdown: {},
    },
    // Build-time MDX option overrides.
    //
    // CRITICAL: must return `applyMdxPreset({...})(environment)`,
    // not raw ProcessorOptions. Returning raw options bypasses fumadocs'
    // default plugin chain — remarkGfm (markdown tables), remarkHeading
    // (heading ids + toc), rehypeCode (shiki syntax highlighting),
    // remarkStructure (search index) all silently disappear, leaving
    // tables unparsed and code blocks colorless. `applyMdxPreset` merges
    // user plugins INTO the default chain instead of replacing it.
    //
    // - `transformerTwoslash` annotates TS/JS code blocks with type info;
    //   `fumadocs-twoslash/twoslash.css` is imported from
    //   `routes/docs/$.tsx` so hover popovers render. Cache lives under
    //   `node_modules/.cache/fumadocs-twoslash`.
    //
    // (Two integrations were tried and rolled back to keep the dev
    // preview stable in TanStack Start (RSC-less Vite SSR):
    //  - `remarkAutoTypeTable` / `<AutoTypeTable>` — its runtime UI is a
    //    Next.js Server Component which can't hydrate without RSC.
    //  - `remarkMdxMermaid` / `<Mermaid>` — mermaid 11 syntax errors on
    //    diagrams with `<…>` placeholders crashed the page; revisit when
    //    we have a more forgiving renderer or move to Next.)
    async mdxOptions(environment) {
      const { rehypeCodeDefaultOptions } = await import(
        'fumadocs-core/mdx-plugins/rehype-code'
      );
      const { transformerTwoslash } = await import('fumadocs-twoslash');
      const { createFileSystemTypesCache } = await import(
        'fumadocs-twoslash/cache-fs'
      );

      return applyMdxPreset({
        rehypeCodeOptions: {
          ...rehypeCodeDefaultOptions,
          transformers: [
            ...(rehypeCodeDefaultOptions.transformers ?? []),
            transformerTwoslash({
              typesCache: createFileSystemTypesCache({
                dir: 'node_modules/.cache/fumadocs-twoslash',
              }),
            }),
          ],
        },
      })(environment);
    },
  },
  meta: {
    schema: metaSchema.extend({
      icon: z.string().optional(),
    }),
  },
});

// lastModified 插件在构建期跑 git log 取每页最后修改时间,注入到
// page.data.lastModified,驱动 DocsPage 页脚的「最后更新于 …」。
// 需要 Cloudflare Pages / Vercel 上开启 deep clone(否则 git 历史不全)。
export default defineConfig({
  plugins: [lastModified()],
});
