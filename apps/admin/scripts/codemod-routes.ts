/**
 * router-helpers.tsx 迁移 codemod
 *
 * 把所有 `import { Link, useNavigate, Navigate } from "#/components/router-helpers"`
 * 替换为 TSR 原生 API，同时:
 *   1. 把扁平 to="/module/..." 路径重写为 "/o/$orgSlug/p/$projectSlug/module/..."
 *   2. 在 navigate() / <Link> 调用处注入 params: { orgSlug, projectSlug, ...original }
 *   3. 在需要 tenant params 的函数体顶部插入 useTenantParams() 调用
 *   4. 更新 import 声明
 *
 * 设计原则: READ-ONLY 收集阶段 → 倒序写入阶段，避免 ts-morph stale node 问题。
 *
 * 运行: bun scripts/codemod-routes.ts [--dry]
 */
import {
  Project,
  SyntaxKind,
  Node,
  type SourceFile,
} from "ts-morph"
import path from "path"

const DRY = process.argv.includes("--dry")

const MOVED_TOP_SEGMENTS = new Set([
  "dashboard", "dev-patterns", "audit-logs", "event-catalog",
  "storage-box", "friend", "exchange", "collection", "check-in",
  "triggers", "activity", "entity", "mail", "character", "shop",
  "leaderboard", "offline-check-in", "dialogue", "match-squad",
  "invite", "friend-gift", "cms", "media-library", "item",
  "assist-pool", "task", "experiment", "level", "announcement",
  "rank", "cdkey", "currency", "end-user", "lottery", "banner",
  "analytics", "badge", "guild",
])

function isFlatMovedPath(s: string): boolean {
  if (!s.startsWith("/")) return false
  if (s.startsWith("/o/$orgSlug")) return false
  const seg = s.split("/")[1] ?? ""
  return MOVED_TOP_SEGMENTS.has(seg)
}

/** Already-nested project route (needs params but no path rewrite). */
function isAlreadyNestedProjectPath(s: string): boolean {
  return s.startsWith("/o/$orgSlug/p/$projectSlug/")
}

function toNestedPath(flat: string): string {
  return `/o/$orgSlug/p/$projectSlug${flat}`
}

// ── Text-level patch helpers ───────────────────────────────────────────────

interface Patch {
  start: number
  end: number
  replacement: string
}

/** Apply patches to a source file in reverse order (avoids position drift). */
function applyPatches(sf: SourceFile, patches: Patch[]): void {
  const sorted = [...patches].sort((a, b) => b.start - a.start)
  for (const { start, end, replacement } of sorted) {
    sf.replaceText([start, end], replacement)
  }
}

// ── AST analysis helpers (read-only) ──────────────────────────────────────

/** Text of an ObjectLiteralExpression without the surrounding braces. */
function objInnerText(node: Node): string {
  const text = node.getText()
  return text.slice(1, -1).trim()
}

/**
 * Returns true when the ObjectLiteralExpression is the direct argument of a
 * navigate() / router.navigate() / redirect() call.
 */
function isNavigateArg(objLiteral: Node): boolean {
  if (!Node.isObjectLiteralExpression(objLiteral)) return false
  const parent = objLiteral.getParent()
  if (!Node.isCallExpression(parent)) return false
  const callee = parent.getExpression().getText()
  return (
    callee === "navigate" ||
    callee.endsWith(".navigate") ||
    callee === "redirect"
  )
}

/**
 * Find the nearest FunctionDeclaration / ArrowFunction / FunctionExpression /
 * MethodDeclaration ancestor. Returns null if none found.
 */
function nearestFuncStart(node: Node): number | null {
  let cur: Node | undefined = node.getParent()
  while (cur) {
    if (
      Node.isFunctionDeclaration(cur) ||
      Node.isArrowFunction(cur) ||
      Node.isFunctionExpression(cur) ||
      Node.isMethodDeclaration(cur)
    ) {
      const body = (cur as { getBody?: () => Node | undefined }).getBody?.()
      if (body && Node.isBlock(body)) {
        // Return the position just after the opening brace
        return body.getStart() + 1
      }
    }
    cur = cur.getParent()
  }
  return null
}

/**
 * Position in the function body where useTenantParams() should be inserted.
 * Strategy: insert after the first run of hook-call variable declarations,
 * but BEFORE the first non-variable statement (e.g. return, if, expression).
 */
function tenantParamsInsertPos(node: Node): number | null {
  let cur: Node | undefined = node.getParent()
  while (cur) {
    const isFn =
      Node.isFunctionDeclaration(cur) ||
      Node.isArrowFunction(cur) ||
      Node.isFunctionExpression(cur) ||
      Node.isMethodDeclaration(cur)
    if (isFn) {
      const body = (cur as { getBody?: () => Node | undefined }).getBody?.()
      if (!body || !Node.isBlock(body)) return null

      const stmts = body.getStatements()
      let insertAfterIdx = -1
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i]
        if (stmt.getKind() !== SyntaxKind.VariableStatement) break
        const text = stmt.getText()
        // Stop before heavy hooks that signal we've gone too far
        if (
          text.includes("useMemo") ||
          text.includes("useCallback") ||
          text.includes("useQuery") ||
          text.includes("useMutation") ||
          text.includes("useState") ||
          text.includes("useEffect")
        ) {
          break
        }
        insertAfterIdx = i
      }

      if (insertAfterIdx >= 0) {
        // Insert after the last acceptable variable statement
        const afterStmt = stmts[insertAfterIdx]
        return afterStmt.getEnd()
      } else {
        // Insert at the start of the body (after opening brace + any newline)
        const bodyStart = body.getStart() + 1
        return bodyStart
      }
    }
    cur = cur.getParent()
  }
  return null
}

// ── Per-file processor ─────────────────────────────────────────────────────

interface ProcessResult {
  modified: boolean
  warnings: string[]
}

function processFile(sf: SourceFile): ProcessResult {
  const warnings: string[] = []
  const filePath = sf.getFilePath()
  const baseName = path.basename(filePath)

  const routerHelpersImport = sf.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === "#/components/router-helpers",
  )
  if (!routerHelpersImport) return { modified: false, warnings: [] }

  const importedNames = new Set(
    routerHelpersImport.getNamedImports().map((n) => n.getName()),
  )

  const patches: Patch[] = []
  const tenantInsertPositions = new Set<number>()

  // ── 1. JSX to attributes ──────────────────────────────────────────────

  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "to") continue

    const init = attr.getInitializer()
    if (!init || !Node.isStringLiteral(init)) {
      // Dynamic to={expr} — flag if element is Link/Navigate from wrapper
      const attrsNode = attr.getParent()
      const el = attrsNode?.getParent()
      if (el && (Node.isJsxOpeningElement(el) || Node.isJsxSelfClosingElement(el))) {
        const tag = Node.isJsxOpeningElement(el)
          ? el.getTagNameNode().getText()
          : el.getTagNameNode().getText()
        if ((tag === "Link" || tag === "Navigate") && importedNames.has(tag)) {
          warnings.push(
            `  [dynamic-to] ${baseName}:${attr.getStartLineNumber()} — <${tag} to={...}> — manual fix needed`,
          )
        }
      }
      continue
    }

    const toValue = init.getLiteralValue()
    const isFlat = isFlatMovedPath(toValue)
    const isAlreadyNested = isAlreadyNestedProjectPath(toValue)
    if (!isFlat && !isAlreadyNested) continue

    const newPath = isFlat ? toNestedPath(toValue) : toValue

    // Patch 1: rewrite the `to` string literal (only for flat paths)
    if (isFlat) {
      patches.push({ start: init.getStart(), end: init.getEnd(), replacement: `"${newPath}"` })
    }

    // Patch 2: params injection
    const attrsNode = attr.getParent()
    const el = attrsNode?.getParent()
    if (el && (Node.isJsxOpeningElement(el) || Node.isJsxSelfClosingElement(el))) {
      const paramsAttr = el.getAttribute("params")

      if (!paramsAttr) {
        // Add params attribute after `to` attribute
        const afterTo = attr.getEnd()
        patches.push({
          start: afterTo,
          end: afterTo,
          replacement: ` params={{ orgSlug, projectSlug }}`,
        })
      } else if (Node.isJsxAttribute(paramsAttr)) {
        const paramsInit = paramsAttr.getInitializer()
        if (paramsInit && Node.isJsxExpression(paramsInit)) {
          const expr = paramsInit.getExpression()
          if (expr && Node.isObjectLiteralExpression(expr)) {
            const inner = objInnerText(expr)
            // Only prepend if orgSlug not already present
            if (!inner.includes("orgSlug")) {
              const newParams = inner ? `{ orgSlug, projectSlug, ${inner} }` : `{ orgSlug, projectSlug }`
              patches.push({
                start: paramsInit.getStart(),
                end: paramsInit.getEnd(),
                replacement: `{${newParams}}`,
              })
            }
          } else {
            warnings.push(`  [params] non-object params expr at ${baseName}:${attr.getStartLineNumber()} — manual fix`)
          }
        } else {
          warnings.push(`  [params] non-JSX-expr params at ${baseName}:${attr.getStartLineNumber()} — manual fix`)
        }
      }
    }

    // Record where to insert useTenantParams()
    const insertPos = tenantParamsInsertPos(attr)
    if (insertPos !== null) tenantInsertPositions.add(insertPos)
  }

  // ── 2. Object `to` properties in navigate() calls ────────────────────

  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const nameText = prop.getNameNode().getText()
    if (nameText !== "to" && nameText !== '"to"') continue

    const init = prop.getInitializer()
    if (!init || !Node.isStringLiteral(init)) continue

    const toValue = init.getLiteralValue()
    const isFlat = isFlatMovedPath(toValue)
    const isAlreadyNested = isAlreadyNestedProjectPath(toValue)
    if (!isFlat && !isAlreadyNested) continue

    const obj = prop.getParent()
    if (!Node.isObjectLiteralExpression(obj)) continue

    if (!isNavigateArg(obj)) {
      if (isFlat) {
        // Nav-item array or other context — rewrite path string, log for manual params check
        const newPath = toNestedPath(toValue)
        patches.push({ start: init.getStart(), end: init.getEnd(), replacement: `"${newPath}"` })
        warnings.push(
          `  [nav-array] ${baseName}:${prop.getStartLineNumber()} — to:"${toValue}" in non-navigate object — verify rendering adds params`,
        )
      }
      // Already-nested non-navigate objects: skip (no meaningful action)
      continue
    }

    const newPath = isFlat ? toNestedPath(toValue) : toValue

    // Patch: rewrite `to` value (only for flat paths)
    if (isFlat) {
      patches.push({ start: init.getStart(), end: init.getEnd(), replacement: `"${newPath}"` })
    }

    // Patch: params injection in the same object
    const paramsProp = obj.getProperty("params")
    if (!paramsProp) {
      // Add `, params: { orgSlug, projectSlug }` before the closing brace
      const objEnd = obj.getEnd() - 1 // position of `}`
      patches.push({
        start: objEnd,
        end: objEnd,
        replacement: `, params: { orgSlug, projectSlug }`,
      })
    } else if (Node.isPropertyAssignment(paramsProp)) {
      const paramsInit = paramsProp.getInitializer()
      if (paramsInit && Node.isObjectLiteralExpression(paramsInit)) {
        const inner = objInnerText(paramsInit)
        // Only prepend if orgSlug not already present
        if (!inner.includes("orgSlug")) {
          const newParams = inner ? `{ orgSlug, projectSlug, ${inner} }` : `{ orgSlug, projectSlug }`
          patches.push({
            start: paramsInit.getStart(),
            end: paramsInit.getEnd(),
            replacement: newParams,
          })
        }
      } else {
        warnings.push(`  [params] non-object params in navigate at ${baseName}:${prop.getStartLineNumber()} — manual fix`)
      }
    } else {
      warnings.push(`  [params] shorthand/spread params at ${baseName}:${prop.getStartLineNumber()} — manual fix`)
    }

    // Record useTenantParams insertion point
    const insertPos = tenantParamsInsertPos(prop)
    if (insertPos !== null) tenantInsertPositions.add(insertPos)
  }

  if (patches.length === 0 && tenantInsertPositions.size === 0) {
    // File only has the import to replace (e.g. SettingsNav with /settings paths)
    // Fall through to import update below
  }

  // ── 3. useTenantParams() insertion patches ────────────────────────────

  const indent = "  " // typical 2-space indent
  for (const pos of tenantInsertPositions) {
    patches.push({
      start: pos,
      end: pos,
      replacement: `\n${indent}const { orgSlug, projectSlug } = useTenantParams()`,
    })
  }

  // ── 4. Apply all patches (read phase done, write phase begins) ────────

  if (patches.length > 0) {
    applyPatches(sf, patches)
  }

  // ── 5. Update imports ─────────────────────────────────────────────────

  const tsrImports = new Set<string>()
  if (importedNames.has("Link")) tsrImports.add("Link")
  if (importedNames.has("useNavigate")) tsrImports.add("useNavigate")
  if (importedNames.has("Navigate")) tsrImports.add("Navigate")
  if (importedNames.has("projectRedirect")) tsrImports.add("redirect")

  // Refresh the import reference (patches may have shifted positions)
  const freshHelperImport = sf.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === "#/components/router-helpers",
  )
  if (freshHelperImport) freshHelperImport.remove()

  // Add/merge @tanstack/react-router
  const existingTsrImport = sf.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === "@tanstack/react-router",
  )
  if (existingTsrImport) {
    const existing = new Set(existingTsrImport.getNamedImports().map((n) => n.getName()))
    for (const name of tsrImports) {
      if (!existing.has(name)) existingTsrImport.addNamedImport(name)
    }
  } else {
    sf.insertImportDeclaration(0, {
      namedImports: [...tsrImports],
      moduleSpecifier: "@tanstack/react-router",
    })
  }

  // Add useTenantParams import if needed
  if (tenantInsertPositions.size > 0) {
    const already = sf
      .getImportDeclarations()
      .some((d) => d.getModuleSpecifierValue() === "#/hooks/use-tenant-params")
    if (!already) {
      sf.insertImportDeclaration(0, {
        namedImports: ["useTenantParams"],
        moduleSpecifier: "#/hooks/use-tenant-params",
      })
    }
  }

  return { modified: true, warnings }
}

// ── Main ───────────────────────────────────────────────────────────────────

const adminRoot = path.resolve(import.meta.dir, "..")
const project = new Project({
  tsConfigFilePath: path.join(adminRoot, "tsconfig.json"),
  skipAddingFilesFromTsConfig: false,
})

const allFiles = project.getSourceFiles()
const routerHelperFiles = allFiles.filter((sf) =>
  sf
    .getImportDeclarations()
    .some((d) => d.getModuleSpecifierValue() === "#/components/router-helpers"),
)

console.log(`\nFound ${routerHelperFiles.length} files importing from router-helpers\n`)

let totalModified = 0
const allWarnings: string[] = []

for (const sf of routerHelperFiles) {
  const result = processFile(sf)
  if (result.warnings.length > 0) {
    console.log(`⚠  ${sf.getFilePath().split("/src/")[1]}`)
    result.warnings.forEach((w) => console.log(w))
  }
  if (result.modified) {
    totalModified++
    if (!DRY) {
      await sf.save()
    }
    allWarnings.push(...result.warnings)
  }
}

console.log(`\n✓  ${totalModified} files ${DRY ? "would be" : "were"} modified`)
if (allWarnings.length > 0) {
  console.log(`\n⚠  ${allWarnings.length} items need manual verification (see above)`)
}
