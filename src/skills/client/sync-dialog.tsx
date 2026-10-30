import type { SkillSync } from "./useSkillSync.js";
import * as React from "react";
import { type ConfirmModal, type ModalState } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { Modal, hostButton } from "./controls.js";

interface Props {
  sync: Pick<SkillSync, "syncOverwrite" | "setSyncOverwrite" | "submitSync">;
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  busy: boolean;
}

export function renderSyncDialog({ modal, t, setModal, busy, sync }: Props) {
  const { syncOverwrite, setSyncOverwrite, submitSync } = sync;
  var content: React.ReactNode[] = [];
  if (modal && typeof modal === "object" && modal.type === "sync-confirm") {
    var syncModal = modal as Extract<ConfirmModal, { type: "sync-confirm"; }>;
    content.push(
      (<Modal
        key={"sync-confirm"}
        title={t("sync.confirm.title")}
        description={t(
          syncModal.all ? "sync.confirm.desc.all" : "sync.confirm.desc.one",
          { name: syncModal.label },
        )}
        closeLabel={t("btn.close")}
        onClose={function () {
          setModal(null);
        }}
      >
        <label className={"dssm-check"}>
          <input
            type={"checkbox"}
            checked={syncOverwrite}
            onChange={function (event: React.ChangeEvent<HTMLInputElement>) {
              setSyncOverwrite(event.target.checked);
            }}
          />
          {t("sync.overwrite")}
        </label>
        <div className={"dssm-modal-actions"}>
          {hostButton(
            t("btn.cancel"),
            function () {
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            t("sync.one"),
            function () {
              submitSync(syncModal);
            },
            "primary",
            busy,
          )}
        </div>
      </Modal>),
    );
  }
  return content;
}
