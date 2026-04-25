import { json } from "@codemirror/lang-json"
import { oneDark } from "@codemirror/theme-one-dark"
import CodeMirror from "@uiw/react-codemirror"
import { Wand2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

/*
 * JsonEditor —— 替代 Phase 5 之前 admin 里那种"用 Textarea 让用户裸写 JSON"
 * 的反 pattern。CodeMirror 6 + lang-json 提供:
 *   - 语法高亮(key/string/number/null)
 *   - 行号 + indent guide
 *   - 自动闭合括号/引号
 *   - 选中找匹配等
 * 比 Monaco 轻得多(~500KB 增量 vs ~2MB),Cloudflare Workers bundle 安全。
 *
 * 使用上是 controlled 组件:value/onChange 跟 react-hook-form / TanStack Form
 * 集成。失焦时尝试 parse,错误展示在下方。
 *
 * theme:
 *   - 读 :root.dark class 决定走 oneDark 还是 default light theme
 *   - 因为 React Hook 在外层切换 theme 时不会自动 re-render,这里用 useEffect
 *     监听 documentElement.className 变化触发 setMode。
 */

export interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  /** 失焦时的回调,parse 成功传 parsed 对象,失败传错误信息 */
  onBlur?: (result: { parsed?: unknown; error?: string }) => void
  placeholder?: string
  /** 编辑区高度,默认 200px */
  height?: number | string
  /** 只读模式,例如 readonly preview */
  readOnly?: boolean
  /** 不显示 Format 按钮(嵌入小卡时省空间) */
  hideFormat?: boolean
  className?: string
  "aria-label"?: string
}

/** 检测当前文档是不是 dark mode —— 走 :root.dark 这条 class */
function useDocumentDark(): boolean {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false
    return document.documentElement.classList.contains("dark")
  })
  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains("dark"))
    sync()
    // 监听 class 变化(ThemeToggle 切换时会改 root class)
    const ob = new MutationObserver(sync)
    ob.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => ob.disconnect()
  }, [])
  return dark
}

export function JsonEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  height = 200,
  readOnly,
  hideFormat,
  className,
  ...rest
}: JsonEditorProps) {
  const dark = useDocumentDark()
  const [error, setError] = useState<string | null>(null)

  const handleBlur = () => {
    if (!value.trim()) {
      setError(null)
      onBlur?.({ parsed: undefined })
      return
    }
    try {
      const parsed = JSON.parse(value)
      setError(null)
      onBlur?.({ parsed })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onBlur?.({ error: msg })
    }
  }

  const handleFormat = () => {
    if (!value.trim()) return
    try {
      const parsed = JSON.parse(value)
      onChange(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-md border bg-card transition-colors",
          error && "border-destructive/60",
        )}
      >
        <CodeMirror
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          theme={dark ? oneDark : "light"}
          extensions={[json()]}
          readOnly={readOnly}
          height={
            typeof height === "number" ? `${height}px` : height
          }
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: !readOnly,
            highlightActiveLineGutter: !readOnly,
            autocompletion: !readOnly,
            bracketMatching: true,
            closeBrackets: !readOnly,
            indentOnInput: !readOnly,
          }}
          aria-label={rest["aria-label"]}
        />
        {!hideFormat && !readOnly && value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            className="absolute right-1.5 top-1.5 h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Wand2Icon />
            Format
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive font-mono">{error}</p>
      )}
    </div>
  )
}
