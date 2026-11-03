import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const commit = 'aaf9f9a862afafd45a15acf32789da97688de695'
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/douyin-baseline.mjs <source-repository>')
const git = (...args) => execFileSync('git', ['-C', resolve(source), ...args], { encoding: 'utf8' })
const files = git('ls-tree', '-r', '-z', '--name-only', commit).split('\0').filter(Boolean)
const read = (file) => git('show', `${commit}:${file}`)
const host = read('index.js')
const client = read('client.js')
const ast = ts.createSourceFile('index.js', host, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const tools = []
let config = []
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'tool') {
    const object = node.arguments[0]
    const props = object.properties.filter(ts.isPropertyAssignment)
    const literals = Object.fromEntries(props.map((p) => [p.name.getText(ast), runInNewContext(`(${p.initializer.getText(ast)})`)]))
    tools.push({ name: literals.name, description: literals.description, parameters: {
      type: 'object', properties: literals.parameters, additionalProperties: false,
    }, output: { type: 'object', properties: {}, additionalProperties: true } })
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'Config') {
    const expression = node.initializer.whenFalse
    const object = expression.arguments[0]
    config = object.properties.map((p) => ({ name: p.name.getText(ast), expression: p.initializer.getText(ast) }))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
if (tools.length !== 35) throw new Error(`Expected 35 tools, found ${tools.length}`)
const routes = [...new Set([...host.matchAll(/path === '(\/api\/douyin-duty[^']*)'/g)].map((m) => m[1]))]
const tabs = runInNewContext(client.match(/const TABS = (\[[\s\S]*?\n    \])/)[1])
const manifest = JSON.parse(read('package.json'))
const data = {
  source: { package: manifest.name, version: manifest.version, repository: 'git@github.com:kdcadmin/dsh_douyin_tools.git', commit },
  files: files.map((path) => ({ path, sha256: createHash('sha256').update(execFileSync('git', ['-C', resolve(source), 'show', `${commit}:${path}`])).digest('hex') })),
  pluginId: 'douyin-life', settingsId: 'douyin-life', conversationViewId: 'douyin-watched',
  tools, config, routes, tabs,
  executableRegressions: ['selfcheck.mjs', 'tests/dm-regression.mjs', 'tests/protocol-smoke.mjs'],
  missingScriptTargets: ['tests/run.mjs', 'tests/proxy-regression.mjs', 'tests/headless-regression.mjs', 'tests/real-media-smoke.py'],
}
mkdirSync('tests/douyin/fixtures', { recursive: true })
writeFileSync('tests/douyin/fixtures/upstream-contract.json', JSON.stringify(data, null, 2) + '\n')
console.log(`Captured ${files.length} files, ${tools.length} tools, ${config.length} fields, ${routes.length} routes, ${tabs.length} tabs at ${commit}`)
