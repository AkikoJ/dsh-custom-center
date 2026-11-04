import { appendFileSync, mkdirSync } from 'node:fs'
import { douyinPaths, type DouyinPaths } from './paths.js'
import { createConfiguration, type ConfigurationDependencies } from './configuration.js'
import { createLedger } from './ledger.js'
import { createRuntimeState } from './state.js'
import { createPythonRuntime } from './python-runtime.js'
import { createReplyHistory } from './reply-history.js'
import { createActionExecutor, type Invoke } from './action-executor.js'
import { createBrowser } from './browser.js'
import { createSetup } from './setup.js'
import { createContent } from './content.js'
import { createPersona } from './persona.js'
import { createReports } from './reports.js'
import { createComfy } from './comfy.js'
import { createPublication } from './publication.js'
import { createImageFetcher } from './image-fetch.js'
import { createImageAccess } from './image-access.js'
import { createTextModel } from './text-model.js'
import { createReplies } from './replies.js'
import { createDmHistory } from './dm-history.js'
import { createDm } from './dm.js'
import { createDmWatcher } from './dm-watcher.js'
import { createHeadless } from './headless.js'
import { headlessPrompt } from './headless-prompt.js'
import { createSocial } from './social.js'
import { createLocalRound } from './local-round.js'
import { createCleanup } from './cleanup.js'
import { createStickers } from './stickers.js'
import { createScheduler } from './scheduler.js'
import { createStatus } from './status.js'
import { resolveDsh } from './cli.js'
import { currentExecution, withExecution } from './execution-context.js'

type ModelDependencies = Parameters<typeof createTextModel>[0]
type ImageDependencies = Parameters<typeof createImageAccess>[0]
export interface RuntimeDependencies {
  paths?: DouyinPaths
  initial?: unknown
  settings?: ConfigurationDependencies['settings']
  services?: ModelDependencies['services']
  attachments?: ImageDependencies['attachments']
  credentials?: ImageDependencies['credentials']
  now?: () => Date
  invoke?: Invoke
  log?(message: string): void
}

/** Composition owns lifetimes; domain modules retain their own narrow interfaces. */
export function createDouyinRuntime(deps: RuntimeDependencies = {}) {
  const paths = deps.paths ?? douyinPaths(), now = deps.now ?? (() => new Date())
  let closing = false, disposed: Promise<void> | undefined, started = false
  const shutdown = new AbortController()
  const operations = new Set<Promise<unknown>>()
  const log = (message: string) => {
    try { mkdirSync(paths.logs, { recursive: true, mode: 0o700 }); appendFileSync(paths.file('duty.log'), now().toISOString() + ' ' + message.slice(-10000) + '\n', { mode: 0o600 }); deps.log?.(message) } catch { /* Diagnostics do not decide action outcomes. */ }
  }
  const configuration = createConfiguration({ file: paths.config, initial: deps.initial, settings: deps.settings, log })
  const config = () => configuration.refresh(), persist = configuration.persist
  const state = createRuntimeState(paths, now), ledger = createLedger(paths, now), history = createReplyHistory(paths, ledger)
  const python = createPythonRuntime(paths, config, log), invoke = deps.invoke ?? python.invoke
  const guardedInvoke: Invoke = (name, args, options) => {
    const stoppingListener = name === 'douyin_dm_events' && args.stop === true
    if (closing && !stoppingListener) return Promise.reject(new Error('抖音功能正在卸载'))
    if (!stoppingListener) currentExecution().signal?.throwIfAborted()
    return stoppingListener ? invoke(name, args, options) : withExecution({ ...currentExecution(), signal: shutdown.signal }, () => invoke(name, args, options))
  }
  const executor = createActionExecutor({ config, ledger, history, invoke: guardedInvoke, ownedVideoIds: async () => (await replies.owned()).ids })
  const call: Invoke = (name, args, options) => {
    const stoppingListener = name === 'douyin_dm_events' && args.stop === true
    if (closing && !stoppingListener) return Promise.reject(new Error('抖音功能正在卸载'))
    if (!stoppingListener) currentExecution().signal?.throwIfAborted()
    return executor.call(name, args, options)
  }
  const persona = createPersona(paths), reports = createReports(paths, ledger), content = createContent(config, call)
  const browser = createBrowser({ paths, config, persist, invoke: call, restart: python.restart, env: python.env }, state)
  const setup = createSetup(paths, python, persist), comfy = createComfy({ config, log }), publication = createPublication(config, ledger, comfy, call)
  const images = createImageAccess({ paths, config, fetch: createImageFetcher(), attachments: deps.attachments ?? (() => undefined), credentials: deps.credentials ?? (() => undefined), log })
  const text = createTextModel({ config, services: deps.services ?? (() => ({})), images, log })
  const replies = createReplies({ config, ledger, history, persona, call, generate: text.generate, describe: (url) => images.describe(url, currentExecution().signal), persist })
  const headless = createHeadless({ paths, config, ledger, state, runtime: python, call, prompt: () => headlessPrompt({ config: config(), paths, ledger, persona, reports }), log })
  const busy = () => headless.busy() || local.busy() || setup.running()
  const dm = createDm({ config, ledger, history: createDmHistory(paths, now), persona, reports, call, generate: text.generate, run: headless.run, busy, log })
  const social = createSocial({ config, ledger, state, call, generate: text.generate })
  const local = createLocalRound({ config, ledger, state, reports, content, social, call })
  const cleanup = createCleanup(paths, busy, state), stickers = createStickers(paths)
  const scheduler = createScheduler({ config, ledger, state, round: () => local.run(), streak: social.streak, dm: dm.round, reply: replies.round, clean: () => cleanup.maybe(config().autoClean), busy, log })
  const watcher = createDmWatcher({ config, call, poll: (reason) => withExecution({ origin: 'timer' }, () => dm.poll(reason)), busy, log })
  const status = createStatus({ config, ledger, state, reports, runtime: python, setup, browser, call, replyState: () => ({ ...dm.status(), watcher: watcher.state, scheduler: scheduler.status() }), dshCli: () => { const cli = resolveDsh(config().dshBin); return 'missing' in cli ? cli.hint : cli.command } })
  const track = <T>(action: () => Promise<T>): Promise<T> => {
    if (closing) return Promise.reject(new Error('抖音功能已停止接收请求'))
    const task = Promise.resolve().then(() => withExecution({ ...currentExecution(), signal: shutdown.signal }, action)); operations.add(task)
    const clear = () => { operations.delete(task) }; void task.then(clear, clear)
    return task
  }
  const start = () => { if (!started && !closing) { started = true; scheduler.start(); watcher.start() } }
  const dispose = () => disposed ??= (async () => {
    closing = true; shutdown.abort(new Error('抖音功能正在卸载')); text.dispose()
    // Stop producers before draining requests; callbacks still have their state stores.
    await Promise.allSettled([scheduler.dispose(), watcher.dispose(), local.dispose(), headless.dispose(), setup.dispose()])
    await Promise.allSettled([...operations])
    await python.dispose()
  })()
  return { paths, config, configuration, ledger, state, python, executor, call, persona, reports, content, browser, setup, comfy, publication, images, replies, headless, dm, social, local, cleanup, stickers, scheduler, watcher, status, log, track, busy, start, dispose }
}
export type DouyinRuntime = ReturnType<typeof createDouyinRuntime>
