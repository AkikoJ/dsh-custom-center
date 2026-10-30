import { saveTuning } from "./save.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TuningError, parseTuningSaveRequest } from "../rules.js";
import { MARKER_HEADER, isLoopbackAddress } from "../../shared/request.js";
import type { TuningHostServices } from "./host-env.js";
import type { WebRoute } from "../../shared/host-env.js";

import { TuningHttpError, messageOf } from "./model-access.js";
import { snapshot } from "./snapshot.js";

/** Path of the context and compaction routes. */
export const TUNING_PATH = '/custom-center/tuning'

/** Options for {@link createTuningRoutes}. */
export interface TuningRouteOptions {
  /** Resolve services lazily so HMR replacement is observed. */
  services: () => TuningHostServices
  /** Host/Origin fence plus authentication; returns a rejection status or undefined. */
  reject: (req: IncomingMessage) => 401 | 403 | undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(text)
}

/** Read a bounded JSON request body. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.length
    if (total > 64 * 1024) throw new TuningHttpError(413, 'too-large')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new TuningHttpError(400, 'invalid-json')
  }
}

/**
 * Build the two tuning routes.
 * @param options - lazy service access plus the Connection fence.
 * @returns routes ready for `webServer.register`.
 */
export function createTuningRoutes(options: TuningRouteOptions): WebRoute[] {
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) throw new TuningHttpError(403, 'forbidden')
      const rejection = options.reject(req)
      if (rejection !== undefined) throw new TuningHttpError(rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
      if (req.headers[MARKER_HEADER] !== '1') throw new TuningHttpError(403, 'forbidden')
      if (req.method === 'GET') {
        sendJson(res, 200, await snapshot(options.services()))
        return
      }
      if (req.method !== 'POST') throw new TuningHttpError(405, 'method-not-allowed')
      const services = options.services()
      if (services.configEditor === undefined) throw new TuningHttpError(503, 'unavailable', '配置编辑器不可用。')
      const request = parseTuningSaveRequest(await readJson(req))
      sendJson(res, 200, await saveTuning(services, request))
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof TuningHttpError
        ? error.status
        : error instanceof TuningError
          ? (error.code === 'invalid-input' ? 400 : 409)
          : 500
      const code = error instanceof TuningHttpError || error instanceof TuningError
        ? error.code
        : 'failed'
      sendJson(res, status, { error: code, message: messageOf(error) })
    }
  }

  return [{ kind: 'exact', path: TUNING_PATH, handler: handle }]
}
