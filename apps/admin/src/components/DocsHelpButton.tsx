import { useLocation } from "@tanstack/react-router"
import { BookOpen } from "lucide-react"

import { Button } from "#/components/ui/button"
import { resolveDocsLink } from "#/lib/docs-mapping"
import { getLocale } from "../paraglide/runtime.js"
import * as m from "../paraglide/messages.js"

interface Props {
  slug?: string
}

export function DocsHelpButton({ slug }: Props) {
  const { pathname } = useLocation()
  const locale = getLocale()
  const resolved = slug
    ? { href: `/docs/${locale}/${slug}`, hasDoc: true, slug }
    : resolveDocsLink(pathname, locale)

  const label = resolved.hasDoc
    ? m.docs_help_view_docs()
    : m.docs_help_browse_docs()

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={resolved.hasDoc ? undefined : "text-muted-foreground"}
      title={label}
    >
      <a href={resolved.href} target="_blank" rel="noopener noreferrer">
        <BookOpen className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </a>
    </Button>
  )
}
