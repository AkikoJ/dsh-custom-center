import type { Context } from "@deepseek-ai/cordis";
import type { HostServices } from "../../shared/host-env.ts";
import { DouyinLoginService } from "./service.ts";
import { createDouyinRoutes } from "./routes.ts";
import { defaultDouyinRoot } from "./storage.ts";

export function registerDouyin(ctx: Context, host: HostServices): void {
  ctx.effect(() => {
    const service = new DouyinLoginService({ root: defaultDouyinRoot() });
    const disposers: Array<() => void> = [];
    try {
      for (const route of createDouyinRoutes({
        service,
        reject: (req) => host.connection.requestRejection(req),
      })) {
        disposers.push(host.webServer.register(route));
      }
    } catch {
      disposers.forEach((dispose) => dispose());
      void service.dispose().catch(() => undefined);
      return () => service.dispose();
    }
    return async () => {
      disposers.forEach((dispose) => dispose());
      await service.dispose();
    };
  }, "dsh-custom-center: douyin login lifecycle");
}
