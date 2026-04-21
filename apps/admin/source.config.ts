import { defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      // 侧栏图标(lucide 名称),用于分组与重点页面
      icon: z.string().optional(),
      // 首页展示页面用的预览图路径
      preview: z.string().optional(),
      // 标记 beta / planned / deprecated,渲染在标题旁
      tag: z.enum(['beta', 'planned', 'deprecated', 'new']).optional(),
      // full:true 时不显示右侧 TOC(用于 landing 类页面)
      full: z.boolean().optional(),
    }),
  },
  meta: {
    schema: metaSchema.extend({
      // 允许 meta.json 里给分组/目录加 icon
      icon: z.string().optional(),
    }),
  },
});
