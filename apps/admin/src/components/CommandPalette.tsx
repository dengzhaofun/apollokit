import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "#/components/ui/command"
import { getNavGroups } from "./AppSidebar"
import { getLocale, locales, setLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"

type Locale = (typeof locales)[number]

/**
 * Global cmd+k command palette. Mounted once in the dashboard shell;
 * registers a single keydown listener for `meta+k` / `ctrl+k`. Pulls
 * its routing data straight from the sidebar config so a new module
 * shows up here automatically.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const groups = getNavGroups()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.to}
                  value={`${item.title()} ${item.to}`}
                  onSelect={() => go(item.to)}
                >
                  <Icon className="size-4" />
                  <span>{item.title()}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.to}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading={m.nav_group_system()}>
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
