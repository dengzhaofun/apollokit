import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  function toggleMode() {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  const display = !mounted ? null : theme === 'system' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label="Toggle theme"
      title="Toggle theme"
      className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5"
    >
      {display}
    </button>
  )
}
