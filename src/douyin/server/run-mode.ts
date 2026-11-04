import type { DouyinConfig } from '../config.js'

/** Both manual entry points resolve the same persisted default. */
export function runManual<L, H>(config: Pick<DouyinConfig, 'localRound'>, mode: unknown, local: () => L, headless: () => H): L | H | { ok: false; error: string } {
  const selected = String(mode || '').trim() || (config.localRound !== false ? 'local' : 'headless')
  if (selected !== 'local' && selected !== 'headless') return { ok: false, error: 'mode 只支持 local/headless' }
  return selected === 'local' ? local() : headless()
}
