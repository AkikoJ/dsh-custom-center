import { builtinModules } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : []
  })
}
const files = sourceFiles('src')
const known = new Set(files)
const modules = files.map((file) => ({
  file,
  ast: ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true),
}))
interface Dependency { from: string; specifier: string; runtime: boolean; target?: string }
const dependencies: Dependency[] = []
for (const { file, ast } of modules) {
  function add(specifier: string, runtime: boolean) {
    let target: string | undefined
    if (specifier.startsWith('.')) {
      const path = relative(root, resolve(root, dirname(file), specifier))
      target = [path, path.replace(/\.js$/, '.ts'), path.replace(/\.js$/, '.tsx')]
        .find((candidate) => known.has(candidate))
    }
    dependencies.push({ from: file, specifier, runtime, target })
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const onlyNamedTypes = bindings && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every((entry) => entry.isTypeOnly)
      add(node.moduleSpecifier.text, !clause?.isTypeOnly && (!onlyNamedTypes || !!clause?.name))
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const onlyTypes = node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.every((entry) => entry.isTypeOnly)
      add(node.moduleSpecifier.text, !node.isTypeOnly && !onlyTypes)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, false)
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text, true)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}
const runtime = dependencies.filter((dependency) => dependency.runtime)
const featureOf = (file: string) => /^src\/(appearance|tuning|skills)\//.exec(file)?.[1]
const entries = new Set(['src/index.ts', 'src/client/index.ts', 'src/skills/index.ts', 'src/skills/client.ts'])

describe('source architecture', () => {
  it('keeps handwritten source and tests within the 800-line limit', () => {
    const oversized = [...files, ...sourceFiles('tests')].flatMap((file) => {
      const text = readFileSync(resolve(root, file), 'utf8')
      const lines = text.split('\n').length - Number(text.endsWith('\n'))
      return lines > 800 ? [`${file}: ${lines}`] : []
    })
    expect(oversized).toEqual([])
  })

  it('resolves local imports, keeps feature ownership, and avoids imports back into entries', () => {
    expect(dependencies.filter((edge) => edge.specifier.startsWith('.') && !edge.target)).toEqual([])
    expect(dependencies.filter((edge) => edge.target && (
      edge.from.startsWith('src/shared/') && !edge.target.startsWith('src/shared/')
      || featureOf(edge.from) && featureOf(edge.target) && featureOf(edge.from) !== featureOf(edge.target)
    ))).toEqual([])
    expect(runtime.filter((edge) => edge.target && entries.has(edge.target) && !entries.has(edge.from))).toEqual([])
  })

  it('has no runtime dependency cycles', () => {
    const active = new Set<string>()
    const done = new Set<string>()
    const cycles: string[][] = []
    function walk(file: string, trail: string[]) {
      if (active.has(file)) { cycles.push([...trail, file]); return }
      if (done.has(file)) return
      active.add(file)
      for (const edge of runtime.filter((candidate) => candidate.from === file)) {
        if (edge.target) walk(edge.target, [...trail, file])
      }
      active.delete(file)
      done.add(file)
    }
    files.forEach((file) => walk(file, []))
    expect(cycles).toEqual([])
  })

  it('keeps all browser modules free of server and Node runtime dependencies', () => {
    const reached = new Set<string>()
    const pending = files.filter((file) => file.includes('/client/') || file === 'src/skills/client.ts')
    const forbidden: Dependency[] = []
    const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
    while (pending.length) {
      const file = pending.pop()!
      if (reached.has(file)) continue
      reached.add(file)
      for (const edge of runtime.filter((candidate) => candidate.from === file)) {
        if (edge.target) {
          if (edge.target.includes('/server/') || /\/(host-types|host-env)\.ts$/.test(edge.target)) forbidden.push(edge)
          pending.push(edge.target)
        } else if (edge.specifier.startsWith('node:') || builtins.has(edge.specifier)) forbidden.push(edge)
      }
    }
    expect(forbidden).toEqual([])
  })
})
