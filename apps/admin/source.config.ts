import {
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
    // Build-time MDX option overrides — wires Twoslash, AutoTypeTable
    // and Mermaid remark plugins into the shared shiki/rehype-code chain.
    //
    // - `transformerTwoslash` annotates every TS/JS code block with the
    //   real TypeScript type info; `fumadocs-twoslash/twoslash.css` is
    //   imported from `routes/docs/$.tsx` so hover popovers render.
    //   Cache lives under `node_modules/.cache/fumadocs-twoslash` —
    //   first build is slow (full ts-morph compile), reruns reuse it.
    // - `remarkAutoTypeTable` lets MDX use `<AutoTypeTable file="…"
    //   name="…" />` to extract a TS interface and emit a Type Table at
    //   build time; the runtime `AutoTypeTable` component is also
    //   registered in `routes/docs/$.tsx` for places that prefer the
    //   inline `type="…"` API.
    // - `remarkMdxMermaid` rewrites ` ```mermaid ` fenced code blocks
    //   into `<Mermaid chart="…" />` JSX. The runtime `<Mermaid>`
    //   component (registered in `routes/docs/$.tsx`) is client-only
    //   and reads dark/light from `next-themes`, so SSR yields the
    //   placeholder and the diagram appears after hydration.
    async mdxOptions() {
      const { rehypeCodeDefaultOptions } = await import(
        'fumadocs-core/mdx-plugins/rehype-code'
      );
      const { transformerTwoslash } = await import('fumadocs-twoslash');
      const { createFileSystemTypesCache } = await import(
        'fumadocs-twoslash/cache-fs'
      );
      const {
        remarkAutoTypeTable,
        createGenerator,
        createFileSystemGeneratorCache,
      } = await import('fumadocs-typescript');
      const { remarkMdxMermaid } = await import('fumadocs-mermaid');

      const generator = createGenerator({
        cache: createFileSystemGeneratorCache(
          'node_modules/.cache/fumadocs-typescript',
        ),
      });

      return {
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
        remarkPlugins: [
          [remarkAutoTypeTable, { generator }],
          remarkMdxMermaid,
        ],
      };
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
