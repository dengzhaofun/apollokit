#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const ROOT = join(import.meta.dir, "../src")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(full)
  }
  return out
}

let fixed = 0

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8")
  if (!src.includes("AnyRoute")) continue

  // Already properly imported
  if (src.match(/import\s+(?:type\s+)?\{[^}]*\bAnyRoute\b/)) continue

  // Has existing TSR import — merge AnyRoute in
  const tsrImportRe = /^(import\s+(?:type\s+)?\{)([^}]+)(\}\s+from\s+"@tanstack\/react-router")/m
  const match = src.match(tsrImportRe)
  let updated: string

  if (match) {
    const [full, open, names, close] = match
    // avoid double-add
    if (names.includes("AnyRoute")) continue
    const trimmedNames = names.trimEnd()
    const separator = trimmedNames.endsWith(",") ? " " : ", "
    updated = src.replace(full, `${open}${trimmedNames}${separator}type AnyRoute${close}`)
  } else {
    // No TSR import yet — add one after the last import statement
    updated = src.replace(
      /^((?:import\s[^\n]+\n)+)/m,
      (block) => block + `import type { AnyRoute } from "@tanstack/react-router"\n`,
    )
  }

  if (updated !== src) {
    writeFileSync(file, updated)
    fixed++
    console.log(`  fixed: ${file.replace(ROOT + "/", "")}`)
  }
}

console.log(`\n✓ ${fixed} files updated`)
