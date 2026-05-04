#!/usr/bin/env bun
/**
 * Finds function bodies that use orgSlug/projectSlug as shorthand properties
 * (e.g. `params={{ orgSlug, projectSlug }}`) but don't have a
 * `useTenantParams()` call in scope. Inserts the call at the top of the
 * smallest enclosing function and adds the import if needed.
 */
import { Project, SyntaxKind } from "ts-morph"
import { join } from "path"

const ROOT = join(import.meta.dir, "..")
const project = new Project({
  tsConfigFilePath: join(ROOT, "tsconfig.json"),
  skipAddingFilesFromTsConfig: false,
})

const TENANT_CALL = "const { orgSlug, projectSlug } = useTenantParams()"
const TENANT_IMPORT = `import { useTenantParams } from "#/hooks/use-tenant-params"`

let totalFixed = 0

for (const sf of project.getSourceFiles()) {
  if (sf.getFilePath().includes("/node_modules/")) continue
  if (sf.getFilePath().includes("/scripts/")) continue

  const fileText = sf.getFullText()
  if (!fileText.includes("orgSlug") && !fileText.includes("projectSlug")) continue

  // Find all ShorthandPropertyAssignment nodes for orgSlug/projectSlug
  const shorthandProps = sf.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)
    .filter((n) => {
      const name = n.getName()
      return name === "orgSlug" || name === "projectSlug"
    })

  if (shorthandProps.length === 0) continue

  // For each shorthand prop, find the nearest enclosing function that can host a hook call
  // (a named function declaration or arrow function expression that is itself a function body, not a callback)
  const functionsNeedingFix = new Set<import("ts-morph").FunctionDeclaration | import("ts-morph").ArrowFunction | import("ts-morph").FunctionExpression>()

  for (const prop of shorthandProps) {
    // Walk up to find the nearest function ancestor
    let node: import("ts-morph").Node | undefined = prop.getParent()
    while (node) {
      const kind = node.getKind()
      if (
        kind === SyntaxKind.FunctionDeclaration ||
        kind === SyntaxKind.ArrowFunction ||
        kind === SyntaxKind.FunctionExpression
      ) {
        const fn = node as import("ts-morph").FunctionDeclaration | import("ts-morph").ArrowFunction | import("ts-morph").FunctionExpression
        const body = fn.getBody?.()
        if (!body) break

        const bodyText = body.getFullText()
        // Skip if already has useTenantParams in this function
        if (bodyText.includes("useTenantParams")) break
        // Skip tiny arrow functions (cell renderers etc.) — go up one more level
        // A function that only returns JSX/a value inline is a render callback; skip up
        if (kind === SyntaxKind.ArrowFunction) {
          const parent = fn.getParent()
          // If parent is a PropertyAssignment (like `cell: (info) => ...`), skip to outer function
          if (parent?.getKind() === SyntaxKind.PropertyAssignment) {
            node = parent
            continue
          }
        }

        functionsNeedingFix.add(fn)
        break
      }
      node = node.getParent()
    }
  }

  if (functionsNeedingFix.size === 0) continue

  // Collect patches: {start, replacement} — reverse order to avoid position shifts
  const patches: Array<{ start: number; end: number; replacement: string }> = []

  for (const fn of functionsNeedingFix) {
    const body = fn.getBody?.()
    if (!body) continue

    const bodyText = body.getFullText()
    if (bodyText.includes("useTenantParams")) continue

    // Find insertion point: after the opening brace, on its own line
    // body.getStart() points to `{`, we insert after the first newline inside
    const bodyStart = body.getStart()
    const bodyFull = body.getFullText()
    // Find position after opening `{` + newline
    const insertOffset = bodyFull.indexOf("{") + 1
    const insertPos = bodyStart + insertOffset

    patches.push({
      start: insertPos,
      end: insertPos,
      replacement: `\n  ${TENANT_CALL}`,
    })
  }

  if (patches.length === 0) continue

  // Apply patches in reverse order
  const sorted = [...patches].sort((a, b) => b.start - a.start)
  for (const { start, end, replacement } of sorted) {
    sf.replaceText([start, end], replacement)
  }

  // Ensure import exists
  const hasImport = sf.getFullText().includes("useTenantParams")
  if (hasImport && !sf.getFullText().includes('from "#/hooks/use-tenant-params"')) {
    sf.insertText(0, TENANT_IMPORT + "\n")
  } else if (!hasImport) {
    sf.insertText(0, TENANT_IMPORT + "\n")
  }

  await sf.save()
  totalFixed++
  console.log(`  fixed: ${sf.getFilePath().replace(ROOT + "/src/", "")}`)
}

console.log(`\n✓ ${totalFixed} files updated`)
