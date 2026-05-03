/**
 * `/api/v1/search` — fumadocs 默认 Orama 搜索端点。
 *
 * createFromSource 自动根据 loader 的 i18n 配置构建双语索引
 * (zh / en 各一份,按 request 的 ?locale= 分发)。
 * RootProvider 的 search.options.api 指向本端点即可启用顶栏 ⌘K。
 *
 * Orama 内置分词器只认一批英语系 + 欧洲语系语言,"zh" 会直接抛
 * LANGUAGE_NOT_SUPPORTED。`localeMap` 把 zh 映射到 @orama/tokenizers
 * 的 mandarin 分词器,en 留空走默认英语 tokenizer。
 */
import { createFileRoute } from '@tanstack/react-router'
import { createFromSource } from 'fumadocs-core/search/server'
import { createTokenizer as createMandarinTokenizer } from '@orama/tokenizers/mandarin'
import { source } from '#/lib/source-server'

const searchAPI = createFromSource(source, {
  localeMap: {
    zh: { components: { tokenizer: createMandarinTokenizer() } },
    en: 'english',
  },
})

export const Route = createFileRoute('/api/v1/search')({
  server: {
    handlers: {
      GET: async ({ request }) => searchAPI.GET(request),
    },
  },
})
