import type { IncomingMessage, ServerResponse } from "node:http";

/** One exact-path route on the Web carrier. */
export interface WebRoute {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The host services the plugin injects. */
export interface HostServices {
  webServer: {
    /** Register a route; returns its disposer. */
    register(route: WebRoute): () => void
  }
  connection: {
    /** Host/Origin fence plus browser authentication; undefined means accepted. */
    requestRejection(request: { headers: IncomingMessage['headers'] }): 401 | 403 | undefined
  }
}
