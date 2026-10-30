/**
 * Browser-side access to the tuning routes served by the host half.
 *
 * Requests go to the same origin as the page and carry the same-origin marker
 * header the host requires. The host validates and persists through the
 * profile configuration editor, so this client only sends numbers.
 */
import { MARKER_HEADER } from '../../shared/request.ts'
import type { CompactionValues, ModelTarget, ModelWindowValues, TuningSnapshot } from "../contracts.js";

/** Failure of a tuning request, with the host's stable error code. */
export class TuningClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'TuningClientError'
  }
}

/** Body accepted by `POST /custom-center/tuning`. */
export interface TuningSaveBody {
  model?: ModelWindowValues
  target?: ModelTarget
  presetId?: string
  compaction?: CompactionValues
}

function routeUrl(): URL {
  return new URL('custom-center/tuning', document.baseURI)
}

async function failure(response: Response): Promise<TuningClientError> {
  let code = 'failed'
  let message: string | undefined
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string') code = body.error
    if (typeof body.message === 'string') message = body.message
  } catch {
    // not JSON: keep the generic code
  }
  return new TuningClientError(code, response.status, message)
}

async function call(init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(routeUrl(), {
      ...init,
      credentials: 'same-origin',
      headers: { [MARKER_HEADER]: '1', ...init.headers },
    })
  } catch {
    throw new TuningClientError('unreachable', 0, '无法连接到宿主。')
  }
  if (!response.ok) throw await failure(response)
  return response
}

/** Read the current route and every preset's compaction policy. */
export async function loadTuning(): Promise<TuningSnapshot> {
  const response = await call()
  try {
    return (await response.json()) as TuningSnapshot
  } catch {
    throw new TuningClientError('unavailable', response.status, '宿主返回了无法解析的响应。')
  }
}

/** What a save wrote. */
export interface TuningSaveResult {
  /** Number of models whose window was written. */
  models: number
}

/** Persist a model window and/or one preset's compaction policy. */
export async function saveTuning(body: TuningSaveBody): Promise<TuningSaveResult> {
  const response = await call({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => undefined)) as { models?: unknown } | undefined
  return { models: typeof payload?.models === 'number' ? payload.models : 0 }
}
