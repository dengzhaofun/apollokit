import { HeadContent, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { RootProvider } from 'fumadocs-ui/provider/tanstack'
import { Providers } from '../providers'
import { getLocale } from '../paraglide/runtime.js'
import { i18n as docsI18n, i18nUI } from '../lib/source'

import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var e=localStorage.getItem("theme")||"system",t="system"===e?window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light":e,r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t);r.style.colorScheme=t}catch(e){}})();`

// /docs/{locale}/... 里抽出 locale,不是 docs 路径或第二段不是已注册 locale
// 都返回 null。独立出来方便 RootDocument 里跟 pathname 一起响应式用。
function resolveDocsLocale(pathname: string): string | null {
  const m = pathname.match(/^\/docs\/([^/]+)(?:\/|$)/)
  if (!m) return null
  return docsI18n.languages.includes(m[1]!) ? m[1]! : null
}

// 切语言时要跳的目标 URL。docs 页保留剩余 slug,非 docs 页保持原路径(仅
// 靠 paraglide cookie 生效)。独立出来是因为要在 window.location.assign 里
// 一次性算清楚,避免跳完再算出错。
function buildLocaleUrl(pathname: string, next: string): string {
  const docsMatch = pathname.match(/^\/docs(?:\/([^/]+))?(\/.*)?$/)
  if (docsMatch) {
    const [, cur, rest = ''] = docsMatch
    if (cur && docsI18n.languages.includes(cur)) return `/docs/${next}${rest}`
    return `/docs/${next}${pathname.slice('/docs'.length)}`
  }
  return pathname
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'ApolloKit Admin',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // 两种 i18n 互相隔离:
  //  - paraglide(getLocale/setLocale,cookie 驱动):管整站 UI 文案(登录、
  //    dashboard 按钮等),跨页面粘性的"我是谁"。
  //  - fumadocs docsLocale(从 /docs/{locale}/... 路径取):只管文档正文 +
  //    文档侧栏 + 文档搜索索引,离开 /docs 就没有意义。
  //
  // 切换其中一个不应影响另一个:读英文文档的人,后台 UI 照样可以是中文。
  // 所以 docsLocale 完全由 pathname 决定,不 fallback 到 paraglide;非 docs
  // 页拿 i18n.defaultLanguage 兜底,让 fumadocs RootProvider 有个合法值
  // (非 docs 页 DocsLayout 不会渲染,context 值其实也用不到)。
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const docsLocale = resolveDocsLocale(pathname)
  const fumadocsLocale = docsLocale ?? docsI18n.defaultLanguage
  // <html lang> 写给屏幕阅读器/搜索引擎看的,应当等于"当前视觉内容"的语言:
  //  - docs 页 → 文档 locale
  //  - 其它页 → paraglide UI locale
  const htmlLang = docsLocale ?? getLocale()

  // 这里的 onLocaleChange 只负责 docs locale 切换,不碰 paraglide cookie;
  // 走 window.location.assign 硬跳,三重作用:
  //  1. Radix Popover 没有自动关闭逻辑,点完 item 下拉框会一直开着——硬跳
  //     整页卸载,popover 跟着 portal 一起销毁,UX 更像官方文档。
  //  2. 避开 i18n context / useRouterState 在新旧 locale 之间的短暂抖动。
  //  3. 如果不在 docs 路径上(理论上不会走到,LanguageSelect 只在 DocsLayout
  //     里出现),降级成原地刷新。
  const onLocaleChange = (next: string) => {
    const target = buildLocaleUrl(pathname, next)
    if (target !== pathname) {
      window.location.assign(target)
    }
  }

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]">
        <RootProvider
          search={{
            options: { api: '/api/search' },
          }}
          i18n={{
            ...i18nUI.provider(fumadocsLocale),
            onLocaleChange,
          }}
        >
          <Providers>
            {children}
          </Providers>
        </RootProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
