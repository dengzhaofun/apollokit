/**
 * For each file in the error list, find function bodies that use orgSlug/projectSlug
 * but don't have useTenantParams(), and add it at the top of that function.
 */
import { Project, SyntaxKind, Node } from "ts-morph"

const project = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: true })

// These are the files with TS18004 errors after the previous fix
const errorFiles = [
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/activity/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/activity/templates/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/banner/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cdkey/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/check-in/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cms/$typeAlias/$entryAlias.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cms/$typeAlias/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cms/types/$alias.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/cms/types/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/entity/schemas/$schemaId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/exchange/$configId/options/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/exchange/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/experiment/$experimentKey.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/experiment/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/leaderboard/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/lottery/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/offline-check-in/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/$configId.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/rank/seasons/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/shop/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/storage-box/configs/create.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/task/$taskId/index.tsx",
  "src/routes/_dashboard/o.$orgSlug/p.$projectSlug/task/create.tsx",
  "src/routes/accept-invitation/$id.tsx",
  "src/routes/onboarding/create-project.tsx",
]

function getBodyBlock(fn: Node) {
  if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn)) return fn.getBody()
  if (Node.isArrowFunction(fn)) {
    const body = fn.getBody()
    if (Node.isBlock(body)) return body
  }
  return undefined
}

function functionUsesOrgSlug(fn: Node): boolean {
  const text = fn.getText()
  return (text.includes("orgSlug") || text.includes("projectSlug")) && !text.includes("useTenantParams()")
}

let totalFixed = 0

for (const relPath of errorFiles) {
  const absPath = `${import.meta.dir}/../${relPath}`
  const sf = project.addSourceFileAtPath(absPath)

  // Find all function declarations and arrow functions that:
  // 1. Use orgSlug or projectSlug
  // 2. Don't have useTenantParams()
  // 3. Are at the top level (not inside another function)

  let fileChanged = false

  // Process function declarations
  for (const fn of sf.getFunctions()) {
    if (!functionUsesOrgSlug(fn)) continue

    const body = fn.getBody()
    if (!body || !Node.isBlock(body)) continue

    // Check that orgSlug/projectSlug are actually used (not just in nested functions that have their own call)
    // Direct check: does the function body (excluding nested functions that have their own call) use orgSlug?
    const bodyText = body.getText()
    if (!bodyText.includes("orgSlug") && !bodyText.includes("projectSlug")) continue
    if (bodyText.includes("useTenantParams()")) continue

    // Insert at top of body (after opening {)
    const stmts = body.getStatements()
    let insertIdx = 0
    for (let i = 0; i < stmts.length; i++) {
      const text = stmts[i].getText()
      if (text.includes("useNavigate") || text.includes("const navigate") || text.includes("useParams")) {
        insertIdx = i + 1
      } else {
        break
      }
    }
    body.insertStatements(insertIdx, "const { orgSlug, projectSlug } = useTenantParams()")
    console.log(`  + useTenantParams in ${fn.getName() ?? "anonymous"} (idx ${insertIdx})`)
    fileChanged = true
    totalFixed++
  }

  // Process variable declarations with arrow functions (export const Foo = () => {...})
  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer()
    if (!init || !Node.isArrowFunction(init)) continue
    if (!functionUsesOrgSlug(init)) continue

    const body = getBodyBlock(init)
    if (!body || !Node.isBlock(body)) continue

    const bodyText = body.getText()
    if (!bodyText.includes("orgSlug") && !bodyText.includes("projectSlug")) continue
    if (bodyText.includes("useTenantParams()")) continue

    const stmts = body.getStatements()
    let insertIdx = 0
    for (let i = 0; i < stmts.length; i++) {
      const text = stmts[i].getText()
      if (text.includes("useNavigate") || text.includes("const navigate")) {
        insertIdx = i + 1
      } else {
        break
      }
    }
    body.insertStatements(insertIdx, "const { orgSlug, projectSlug } = useTenantParams()")
    console.log(`  + useTenantParams in ${varDecl.getName()} (idx ${insertIdx})`)
    fileChanged = true
    totalFixed++
  }

  if (fileChanged) {
    await sf.save()
    console.log(`Fixed: ${relPath}`)
  }
}

console.log(`\nTotal inserted: ${totalFixed}`)
