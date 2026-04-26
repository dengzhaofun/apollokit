import MarketingShell from "#/components/landing/MarketingShell"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

/*
 * 法律页通用容器 —— 营销 chrome + 居中 prose 排版。
 *
 * 不抽 ToC 侧栏:法律文本节数有限,锚点足够;真要读全文的人也不会用侧栏跳。
 * 节省一个 sticky 布局的复杂度。
 */
export default function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <MarketingShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-10 border-b border-border/60 pb-6">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("最近更新:", "Last updated: ")}
            {lastUpdated}
          </p>
        </header>
        <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-xl prose-h3:text-base prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          {children}
        </div>
      </article>
    </MarketingShell>
  )
}
