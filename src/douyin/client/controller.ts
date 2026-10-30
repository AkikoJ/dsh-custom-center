import type { DouyinAction, DouyinStatus } from "../contracts.ts";
import { callDouyin } from "./api-client.ts";

export interface AccountView {
  status?: DouyinStatus;
  busy: boolean;
  error?: string;
}

/** Owns page requests only; leaving the page does not close the login window. */
export function createAccountController(request = callDouyin) {
  let view: AccountView = { busy: false };
  const listeners = new Set<(view: AccountView) => void>();
  let controller = new AbortController();
  let mounted = false;
  let generation = 0;
  let lifecycle = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshing = false;
  const publish = (next: AccountView) => {
    view = next;
    listeners.forEach((listener) => listener(view));
  };

  async function refresh() {
    if (!mounted || view.busy || refreshing) return;
    refreshing = true;
    const current = generation;
    try {
      const status = await request("status", controller.signal);
      if (mounted && current === generation) publish({ status, busy: false });
    } catch {
      if (mounted && current === generation)
        publish({
          ...view,
          error: "无法读取登录状态，请检查本机宿主连接后重试。",
        });
    } finally {
      if (current === generation) refreshing = false;
    }
  }

  function schedule(life: number) {
    if (!mounted || life !== lifecycle) return;
    timer = setTimeout(() => {
      void refresh().finally(() => schedule(life));
    }, 3_000);
  }

  return {
    snapshot: () => view,
    subscribe(listener: (value: AccountView) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mount() {
      if (mounted) return;
      mounted = true;
      lifecycle++;
      controller = new AbortController();
      view = { ...view, busy: false };
      const life = lifecycle;
      void refresh().finally(() => schedule(life));
    },
    async act(action: Exclude<DouyinAction, "status">) {
      if (!mounted || (view.busy && action !== "close")) return;
      generation++;
      refreshing = false;
      const current = generation;
      publish({ ...view, busy: true, error: undefined });
      try {
        const status = await request(action, controller.signal);
        if (mounted && current === generation) publish({ status, busy: false });
      } catch {
        if (mounted && current === generation)
          publish({
            ...view,
            busy: false,
            error: "操作未完成，请检查本机宿主连接后重试。",
          });
      }
    },
    dispose() {
      mounted = false;
      lifecycle++;
      generation++;
      refreshing = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
