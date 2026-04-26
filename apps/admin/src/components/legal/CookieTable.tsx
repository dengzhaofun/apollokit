import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

type Row = {
  name: string
  purpose: { zh: string; en: string }
  duration: { zh: string; en: string }
  category: "necessary" | "functionality"
  storage: "cookie" | "localStorage"
}

/*
 * 当前实际设置的 4 个 cookie / localStorage 项。
 * 字段直接照实写,不要美化 — 这就是法务披露的正确做法。
 */
const ROWS: Row[] = [
  {
    name: "better-auth.session_token",
    purpose: {
      zh: "登录会话凭证,识别已登录用户。",
      en: "Auth session token used to identify the logged-in user.",
    },
    duration: { zh: "7 天(滑动续期)", en: "7 days (sliding)" },
    category: "necessary",
    storage: "cookie",
  },
  {
    name: "PARAGLIDE_LOCALE",
    purpose: {
      zh: "记住界面语言偏好(中文 / 英文)。",
      en: "Remembers UI language preference (zh / en).",
    },
    duration: { zh: "持久(直到清除)", en: "Persistent (until cleared)" },
    category: "functionality",
    storage: "cookie",
  },
  {
    name: "sidebar_state",
    purpose: {
      zh: "记住后台侧边栏展开 / 收起状态。",
      en: "Remembers dashboard sidebar collapsed state.",
    },
    duration: { zh: "7 天", en: "7 days" },
    category: "functionality",
    storage: "cookie",
  },
  {
    name: "theme",
    purpose: {
      zh: "记住浅色 / 深色 / 跟随系统主题选择。",
      en: "Remembers light / dark / system theme choice.",
    },
    duration: { zh: "持久(直到清除)", en: "Persistent (until cleared)" },
    category: "functionality",
    storage: "localStorage",
  },
]

export default function CookieTable() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">{t("名称", "Name")}</th>
            <th className="px-4 py-3">{t("用途", "Purpose")}</th>
            <th className="px-4 py-3">{t("时长", "Duration")}</th>
            <th className="px-4 py-3">{t("类别", "Category")}</th>
            <th className="px-4 py-3">{t("存储", "Storage")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {ROWS.map((row) => (
            <tr key={row.name} className="align-top">
              <td className="px-4 py-3 font-mono text-xs">{row.name}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {t(row.purpose.zh, row.purpose.en)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {t(row.duration.zh, row.duration.en)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full border border-border/60 px-2 py-0.5 text-xs">
                  {row.category === "necessary"
                    ? t("严格必要", "Strictly necessary")
                    : t("功能性", "Functionality")}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {row.storage}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
