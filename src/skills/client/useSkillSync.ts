import * as React from "react";
import type { ConfirmModal, ModalState, Post, ResultMessage } from "./manager-types.js";
import type { Translate } from "./messages.js";
import { summarizeSyncResult } from "./messages.js";

type SetModal = React.Dispatch<React.SetStateAction<ModalState>>;
type SetResult = (value: ResultMessage | null) => void;

export function useSkillSync(t: Translate, post: Post, setModal: SetModal, setResult: SetResult) {
  var sos = React.useState(false),
    syncOverwrite = sos[0],
    setSyncOverwrite = sos[1];

  function openSync(
    target: {
      root: string;
      label: string;
      names?: string[];
      all?: boolean;
      workspace?: string;
    },
    overwrite: boolean,
  ) {
    setSyncOverwrite(overwrite);
    setResult(null);
    setModal(Object.assign({ type: "sync-confirm" as const }, target));
  }

  function submitSync(syncModal: Extract<ConfirmModal, { type: "sync-confirm"; }>) {
    var body: Record<string, unknown> = {
      root: syncModal.root,
      overwrite: syncOverwrite,
    };
    if (syncModal.all) body.all = true;
    else body.names = syncModal.names;
    if (syncModal.workspace) body.workspace = syncModal.workspace;
    post("/sync", body, null)
      .then(function (data) {
        var summary = summarizeSyncResult(t, data);
        setResult({
          ok: summary.ok,
          warning: summary.warning,
          text: summary.text,
        });
        setModal(null);
      })
      .catch(function () { });
  }
  return { syncOverwrite, setSyncOverwrite, openSync, submitSync };
}
export type SkillSync = ReturnType<typeof useSkillSync>;
