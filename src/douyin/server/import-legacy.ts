import { randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { assertIdle, assertNoSymlinks, canonicalImportRoot, importContent, planImport, sha256, type ImportManifest } from './import-plan.js'
import { readJson, writeJson } from './storage.js'
import { acquireImportLock } from './import-lock.js'
import { within } from './paths.js'

export interface ImportOptions {
  source: string
  target: string
  legacyStopped: boolean
  /** Test seam for interruption after durable progress. */
  afterCopy?: (count: number) => void
}

export function importLegacy(options: ImportOptions): ImportManifest {
  if (!options.legacyStopped) throw new Error('Stop the legacy plugin and browser before importing; pass --legacy-stopped')
  const source = canonicalImportRoot(options.source)
  const target = canonicalImportRoot(options.target)
  assertNoSymlinks(source)
  assertNoSymlinks(target)
  assertIdle(source)
  if (within(source, target) || within(target, source)) throw new Error('Source and target must be separate directory trees')
  mkdirSync(target, { recursive: true, mode: 0o700 })
  assertIdle(target)
  const lock = join(target, '.legacy-import.lock')
  assertNoSymlinks(lock)
  const release = acquireImportLock(lock)
  try {
    const manifestFile = join(target, 'legacy-import.json')
    const completionFile = join(target, 'legacy-import.complete.json')
    assertNoSymlinks(manifestFile)
    assertNoSymlinks(completionFile)
    let manifest = readJson<ImportManifest | null>(manifestFile, null)
    if (existsSync(manifestFile) && !manifest) throw new Error('Import manifest is corrupt')
    if (manifest && (manifest.source !== source || manifest.target !== target || manifest.version !== 1)) {
      throw new Error('Import manifest belongs to another source or target')
    }
    manifest ??= planImport(source, target)
    const latest = planImport(source, target)
    if (JSON.stringify(latest.entries.map((e) => [e.source, e.target, e.sourceHash, e.targetHash, e.status === 'skipped-environment'])) !==
        JSON.stringify(manifest.entries.map((e) => [e.source, e.target, e.sourceHash, e.targetHash, e.status === 'skipped-environment']))) {
      throw new Error('Legacy data changed since the import began; stop its writer before retrying')
    }
    const previousCompletion = manifest.completedAt
    delete manifest.completedAt
    if (existsSync(completionFile)) unlinkSync(completionFile)
    writeJson(manifestFile, manifest)
    let copied = 0
    for (const entry of manifest.entries) {
      if (entry.status === 'skipped-environment') continue
      const from = resolve(source, entry.source)
      const to = resolve(target, entry.target)
      if (!within(source, from) || !within(target, to)) throw new Error('Import manifest path escapes its root')
      assertNoSymlinks(from)
      assertNoSymlinks(to)
      const bytes = readFileSync(from)
      if (sha256(bytes) !== entry.sourceHash) throw new Error(`Source changed: ${entry.source}`)
      const content = importContent(source, target, entry.source, bytes)
      if (existsSync(to)) {
        entry.status = sha256(readFileSync(to)) === entry.targetHash ? 'identical' : 'conflict'
      } else {
        mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
        const temporary = `${to}.import-${randomUUID()}`
        try {
          writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 })
          // Hard link publishes atomically and refuses to overwrite an existing target.
          linkSync(temporary, to)
        } finally {
          if (existsSync(temporary)) unlinkSync(temporary)
        }
        if (sha256(readFileSync(to)) !== entry.targetHash) throw new Error(`Copy verification failed: ${entry.source}`)
        entry.status = 'copied'
        copied++
      }
      writeJson(manifestFile, manifest)
      options.afterCopy?.(copied)
    }
    if (!manifest.entries.some((entry) => entry.status === 'conflict')) {
      manifest.completedAt = previousCompletion ?? new Date().toISOString()
      writeJson(manifestFile, manifest)
      writeJson(join(target, 'legacy-import.complete.json'), {
        source, completedAt: manifest.completedAt, files: manifest.entries.length, python: manifest.python,
      })
    }
    return manifest
  } finally { release() }
}
