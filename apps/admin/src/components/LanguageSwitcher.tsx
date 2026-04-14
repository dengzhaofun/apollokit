import { getLocale, setLocale } from '../paraglide/runtime.js'
import type { Locale } from '../paraglide/runtime.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
}

export function LanguageSwitcher() {
  return (
    <Select value={getLocale()} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger className="w-[100px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LOCALE_LABELS).map(([locale, label]) => (
          <SelectItem key={locale} value={locale}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
