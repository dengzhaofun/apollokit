import { getLocale, setLocale } from '../paraglide/runtime.js'
import type { Locale } from '../paraglide/runtime.js'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'zh', label: '中' },
]

export function LanguageSwitcher() {
  const current = getLocale()
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 text-sm">
      {LOCALES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setLocale(value)}
          className={[
            'rounded-md px-2.5 py-1 font-medium transition-colors whitespace-nowrap',
            current === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
