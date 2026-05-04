#!/usr/bin/env bun
import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(p)
  }
  return out
}

const files = walk(join(import.meta.dir, "../src"))

const ANYROUTE_LINE = `import type { AnyRoute } from "@tanstack/react-router"`

let fixed = 0

for (const file of files) {
  const src = readFileSync(file, "utf8")
  if (!src.includes(ANYROUTE_LINE)) continue

  const lines = src.split("\n")
  const anyRouteIdx = lines.findIndex((l) => l.trim() === ANYROUTE_LINE)
  if (anyRouteIdx === -1) continue

  // Check if this import line is sitting inside a multi-line import block
  // i.e., the preceding non-empty line starts with `import {` without a closing `}`
  let insideBlock = false
  let depth = 0
  for (let i = 0; i < anyRouteIdx; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === "{") depth++
      else if (ch === "}") depth--
    }
  }
  // If depth > 0, we're inside an unclosed brace block
  insideBlock = depth > 0

  if (!insideBlock) continue

  // Remove the AnyRoute line from its current position
  const newLines = lines.filter((_, i) => i !== anyRouteIdx)

  // Find the end of the import section (last consecutive import line)
  let lastImportLine = -1
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i].trim()
    // Track depth
    let d = 0
    for (const ch of newLines[i]) {
      if (ch === "{") d++
      else if (ch === "}") d--
    }
    // A line that contributes to a `from "..."` terminal and ends an import
    if (newLines[i].includes("from ") && newLines[i].includes('"')) {
      lastImportLine = i
    } else if (line.startsWith("import ") && !line.includes("{")) {
      // Side-effect or default import
      lastImportLine = i
    }
  }

  // Insert AnyRoute after lastImportLine (or after the block closes)
  // Better: find the last line starting with "import"
  let insertAfter = -1
  let inBlock = false
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i].trim()
    for (const ch of newLines[i]) {
      if (ch === "{") inBlock = true
      // don't decrement inside string literals — simple heuristic
    }
    if (line.startsWith("import ") && !inBlock) {
      insertAfter = i
    } else if (inBlock && line.endsWith('"') && line.includes("from")) {
      insertAfter = i
      inBlock = false
    } else if (inBlock && line.match(/\} from ["']/)) {
      insertAfter = i
      inBlock = false
    }
  }

  if (insertAfter === -1) insertAfter = 0

  newLines.splice(insertAfter + 1, 0, ANYROUTE_LINE)

  const updated = newLines.join("\n")
  if (updated !== src) {
    writeFileSync(file, updated)
    fixed++
    console.log(`  fixed: ${file.replace(/.+\/src\//, "src/")}`)
  }
}

console.log(`\n✓ ${fixed} files fixed`)
