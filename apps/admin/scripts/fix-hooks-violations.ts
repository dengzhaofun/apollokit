/**
 * Fixes `useTenantParams()` calls inside callbacks/handlers.
 * Moves them to the nearest enclosing React component or custom hook.
 */
import { Project, SyntaxKind, Node } from "ts-morph"

const project = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: true })

const files = [
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cms/types/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/collection/$albumId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/collection/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/currency/$currencyId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/dialogue/$scriptId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/dialogue/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/end-user/$id.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/entity/formations/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId/skins/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/entity/schemas/$schemaId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/friend-gift/packages/$packageId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/item/categories/$categoryId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/item/definitions/$definitionId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/leaderboard/$alias/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/leaderboard/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/level/$configId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/level/$configId/levels/$levelId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/level/$configId/levels/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/level/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/lottery/$poolId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/lottery/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/mail/$messageId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/match-squad/$configId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/offline-check-in/$campaignId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/offline-check-in/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/$configId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/seasons/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/shop/$productId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/shop/categories/$categoryId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/shop/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/storage-box/configs/$configId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/storage-box/configs/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/task/$taskId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/task/create.tsx",
  "src/routes/accept-invitation/$id.tsx",
  "src/routes/index.tsx",
  "src/routes/onboarding/create-project.tsx",
]

function isComponentOrHook(node: Node): boolean {
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node)) {
    // Get the name
    let name: string | undefined
    if (Node.isFunctionDeclaration(node)) {
      name = node.getName()
    } else if (Node.isFunctionExpression(node)) {
      const varDecl = node.getParentIfKind(SyntaxKind.VariableDeclarator)
      if (varDecl) {
        name = varDecl.getName()
      }
    } else if (Node.isArrowFunction(node)) {
      const varDecl = node.getParentIfKind(SyntaxKind.VariableDeclarator)
      if (varDecl) {
        name = varDecl.getName()
      }
    }
    if (!name) return false
    // React component: starts with uppercase
    if (/^[A-Z]/.test(name)) return true
    // Custom hook: starts with "use"
    if (/^use/.test(name)) return true
  }
  return false
}

function getEnclosingComponentOrHook(node: Node): Node | undefined {
  let current = node.getParent()
  while (current) {
    if (isComponentOrHook(current)) return current
    current = current.getParent()
  }
  return undefined
}

function getBodyBlock(fn: Node) {
  if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn)) {
    return fn.getBody()
  }
  if (Node.isArrowFunction(fn)) {
    const body = fn.getBody()
    if (Node.isBlock(body)) return body
  }
  return undefined
}

let totalFixed = 0

for (const relPath of files) {
  const absPath = `${import.meta.dir}/../${relPath}`
  let sf = project.addSourceFileAtPathIfExists(absPath)
  if (!sf) {
    sf = project.addSourceFileAtPath(absPath)
  }

  // Find all VariableStatements containing useTenantParams()
  // Pattern: const { orgSlug, projectSlug } = useTenantParams()
  const varStatements = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)
    .filter(vs => vs.getText().includes("useTenantParams()"))

  if (varStatements.length === 0) continue

  // For each, check if it's inside a non-component function
  const toMove: Array<{ stmt: Node; text: string; targetFn: Node }> = []

  for (const vs of varStatements) {
    // Find the direct parent function
    let directParentFn: Node | undefined
    let current = vs.getParent()
    while (current) {
      if (
        Node.isFunctionDeclaration(current) ||
        Node.isFunctionExpression(current) ||
        Node.isArrowFunction(current)
      ) {
        directParentFn = current
        break
      }
      current = current.getParent()
    }

    if (!directParentFn) continue // module level, skip

    if (isComponentOrHook(directParentFn)) continue // already at right level

    // It's nested — find the nearest enclosing component/hook
    const enclosing = getEnclosingComponentOrHook(directParentFn)
    if (!enclosing) continue

    toMove.push({ stmt: vs, text: vs.getText(), targetFn: enclosing })
  }

  if (toMove.length === 0) continue

  let fileChanged = false

  // Process in reverse to avoid position drift
  for (const { stmt, targetFn } of toMove.reverse()) {
    const body = getBodyBlock(targetFn)
    if (!body) continue

    // Check if useTenantParams already exists at the target level
    const bodyStatements = body.getStatements()
    const alreadyHasIt = bodyStatements.some(s => s.getText().includes("useTenantParams()"))

    // Remove from current location
    stmt.remove()

    if (!alreadyHasIt) {
      // Insert after the first statement in the target body (usually hooks)
      // Find the first non-import statement
      const stmts = body.getStatements()
      let insertIdx = 0
      // Skip any existing hook calls at the top (useNavigate, useState, etc.)
      for (let i = 0; i < stmts.length; i++) {
        const text = stmts[i].getText()
        if (text.includes("useNavigate") || text.includes("useState") || text.includes("const isNew") || text.includes("const navigate")) {
          insertIdx = i + 1
        } else {
          break
        }
      }
      body.insertStatements(insertIdx, "  const { orgSlug, projectSlug } = useTenantParams()")
    }

    fileChanged = true
    totalFixed++
  }

  if (fileChanged) {
    await sf.save()
    console.log(`Fixed: ${relPath}`)
  }
}

console.log(`\nTotal fixed: ${totalFixed} violations`)
