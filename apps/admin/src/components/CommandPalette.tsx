import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "#/components/ui/command"
import { getNavGroups, type NavItem } from "./AppSidebar"
import { useCommandPalette } from "./command-palette-context"
import { FavoriteStarButton } from "./FavoriteStarButton"
import { getLocale, locales, setLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"

type Locale = (typeof locales)[number]

/**
 * Build a search-matchable token string for an item. Concatenates the
 * title in EVERY locale + the route path so users can find a route
 * regardless of which language the UI is currently set to (e.g. typing
 * "shop categories" works on a Chinese UI; typing "用户分析" works on
 * an English UI).
 */
function buildSearchValue(item: NavItem, parentTitle?: NavItem): string {
  const titles = locales.flatMap((l) => {
    const own = item.title({}, { locale: l })
    if (!parentTitle) return [own]
    return [parentTitle.title({}, { locale: l }), own]
  })
  return [...titles, item.to].join(" ")
}

/**
 * Global cmd+k command palette. Mounted once in the dashboard shell.
 * Open state is shared with the sidebar's search button via
 * `CommandPaletteProvider` — the keyboard shortcut here just toggles
 * that same state.
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const groups = getNavGroups()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  function go(to: string) {
    setOpen(false)
    navigate({ to: to as never })
  }

  function switchLocale(next: Locale) {
    setOpen(false)
    setLocale(next)
  }

  const currentLocale = getLocale()

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={m.command_palette_title()}
      description={m.command_palette_description()}
    >
      <CommandInput placeholder={m.command_palette_search_placeholder()} />
      <CommandList>
        <CommandEmpty>{m.command_palette_no_results()}</CommandEmpty>

        {groups.map((group) => (
          <CommandGroup key={group.key} heading={group.label()}>
            {group.items.flatMap((item) => {
              const Icon = item.icon
              const rows = [
                <CommandItem
                  key={item.to}
                  value={buildSearchValue(item)}
                  onSelect={() => go(item.to)}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.title()}</span>
                  <CommandShortcut>
                    <FavoriteStarButton routePath={item.to} />
                  </CommandShortcut>
                </CommandItem>,
              ]
              if (item.children) {
                for (const child of item.children) {
                  const ChildIcon = child.icon
                  rows.push(
                    <CommandItem
                      key={child.to}
                      value={buildSearchValue(child, item)}
                      onSelect={() => go(child.to)}
                    >
                      <ChildIcon className="size-4" />
                      <span className="truncate">
                        <span className="text-muted-foreground">
                          {item.title()} ›{" "}
                        </span>
                        {child.title()}
                      </span>
                      <CommandShortcut>
                        <FavoriteStarButton routePath={child.to} />
                      </CommandShortcut>
                    </CommandItem>,
                  )
                }
              }
              return rows
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading={m.command_palette_misc()}>
          {locales.filter((l) => l !== currentLocale).map((l) => (
            <CommandItem
              key={`locale-${l}`}
              value={`switch language ${l}`}
              onSelect={() => switchLocale(l)}
            >
              <span>Switch language → {l.toUpperCase()}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
