// server-only — 任何 Worker / createServerFn handler / server: { handlers }
// 里需要查文档树、拿页面元数据、生成 llms.txt 的地方,都从这里 import。
//
// 为什么单独拆:`fumadocs-core/source` 在模块初始化时会用 `node:path`,
// 被 Vite 打进客户端 bundle 会在浏览器里静默爆掉(node:path externalize
// → loader() 执行时 path.join 失败),让整棵 React 树连 hydrate 都没跑,
// 外部表现就是 DocsLayout 侧栏、主题开关、语言切换点了全无反应。
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { i18n, resolveIcon } from './source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  i18n,
  icon: resolveIcon,
  // fumadocs 默认 URL 模板是 `/{locale}/{baseUrl}/{slug}`(即 /zh/docs/foo),
  // 跟我们 routes/docs/$.tsx 选的 `/docs/{locale}/{slug}` 路由对不上,会让
  // 侧栏 Link 全走错、footer 的 isActive 匹配不到当前页导致 prev/next 空白。
  // 这里显式把 locale 放到 baseUrl 之后,跟实际路由一致。
  url(slugs, locale) {
    const parts = ['docs']
    if (locale) parts.push(locale)
    parts.push(...slugs)
    return '/' + parts.join('/')
  },
});
