import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importLegacy } from './server/import-legacy.js'
import { resolveDouyinHome } from './server/paths.js'
import { errorMessage } from './server/storage.js'

export function main(argv = process.argv.slice(2)): number {
  const options = new Map<string, string>()
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index]
    if (option === '--legacy-stopped') options.set(option, 'true')
    else if (['--source', '--target'].includes(option) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options.set(option, argv[++index])
    } else throw new Error(`Unknown or incomplete option: ${option}`)
  }
  const result = importLegacy({
    source: options.get('--source') ?? join(homedir(), '.dsh', 'douyin-duty'),
    target: options.get('--target') ?? resolveDouyinHome(),
    legacyStopped: options.has('--legacy-stopped'),
  })
  console.log(JSON.stringify(result, null, 2))
  return result.completedAt ? 0 : 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = main() }
  catch (error) { console.error(errorMessage(error)); process.exitCode = 1 }
}
