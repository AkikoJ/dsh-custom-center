import { MARKER_HEADER } from "../../shared/request.ts";
import type { DouyinAction, DouyinStatus } from "../contracts.ts";

export async function callDouyin(
  action: DouyinAction,
  signal: AbortSignal,
): Promise<DouyinStatus> {
  const response = await fetch(
    new URL(`custom-center/douyin/${action}`, document.baseURI),
    {
      method: action === "status" ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { [MARKER_HEADER]: "1" },
      signal,
    },
  );
  if (!response.ok)
    throw new Error("无法连接登录服务，请确认本机宿主连接及认证后重试。");
  return (await response.json()) as DouyinStatus;
}
