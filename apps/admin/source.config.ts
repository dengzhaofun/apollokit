import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { remarkLLMs } from 'fumadocs-core/mdx-plugins/remark-llms';
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
    // remarkLLMs 把 MDX 编译后的纯 markdown 导出到 page.data._markdown,
    // 驱动 /llms.txt、/llms-full.txt、每页 /docs-md/... 三个 LLM 端点。
    mdxOptions: {
      remarkPlugins: [remarkLLMs],
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
