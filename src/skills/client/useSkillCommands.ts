import * as React from "react";
import type { ApiCall, ApiRoutes } from "../contracts.js";
import type { ResultMessage } from "./manager-types.js";
import type { Translate } from "./messages.js";
import type { RootView, SkillView } from "../contracts.js";
import { MUTATION_HEADERS } from "./api-client.js";
import { translateError } from "./messages.js";


export function useSkillCommands(
  t: Translate,
  scope: string,
  sessionApi: ApiCall,
  refresh: (silent: boolean) => Promise<unknown>,
  loadWorkspaceDetail: (path: string) => Promise<unknown>,
) {
  var bs = React.useState(false),
    busy = bs[0],
    setBusy = bs[1];

  var rs = React.useState<ResultMessage | null>(null),
    result = rs[0] && rs[0].scope === scope ? rs[0] : null;

  function setResult(value: ResultMessage | null) {
    rs[1](value ? Object.assign({}, value, { scope: scope }) : null);
  }

  var inflightRef = React.useRef(false);

  function post<K extends keyof ApiRoutes>(
    path: K,
    body: unknown,
    successKey?: string | null,
    successParams?: object,
  ): Promise<ApiRoutes[K]> {
    if (inflightRef.current)
      return Promise.reject({ error: "operation already in progress" });
    inflightRef.current = true;
    setBusy(true);
    setResult(null);
    return sessionApi(path, {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify(body || {}),
    })
      .then(function (data) {
        setResult({
          ok: true,
          text: successKey
            ? t(successKey, successParams || data || {})
            : t("result.updated"),
        });
        var scopedWorkspace =
          body &&
            typeof (body as { workspace?: unknown; }).workspace === "string"
            ? (body as { workspace: string; }).workspace
            : "";
        return Promise.all([
          refresh(true),
          scopedWorkspace ? loadWorkspaceDetail(scopedWorkspace) : null,
        ]).then(function () {
          return data;
        });
      })
      .catch(function (error) {
        setResult({
          ok: false,
          text: t("error.action", { error: translateError(t, error) }),
        });
        throw error;
      })
      .finally(function () {
        inflightRef.current = false;
        setBusy(false);
      });
  }

  function openFolder(root: RootView, skill: SkillView, workspacePath?: string) {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    sessionApi("/open-folder", {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify(
        workspacePath ? { root: root.key, name: skill.name, workspace: workspacePath } : { root: root.key, name: skill.name },
      ),
    })
      .then(function () {
        setResult({
          ok: true,
          text: t("result.folder.opened"),
        });
      })
      .catch(function (error) {
        setResult({
          ok: false,
          text: t("error.action", { error: translateError(t, error) }),
        });
      })
      .finally(function () {
        inflightRef.current = false;
        setBusy(false);
      });
  }
  return { busy, setBusy, result, setResult, inflightRef, post, openFolder };
}
export type SkillCommands = ReturnType<typeof useSkillCommands>;
