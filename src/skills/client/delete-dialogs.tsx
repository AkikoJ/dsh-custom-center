import * as React from "react";
import { type ConfirmModal, type ModalState, type Post } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { Modal, hostButton } from "./controls.js";

interface Props {
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  post: Post;
  busy: boolean;
}

export function renderDeleteDialogs({ modal, t, setModal, post, busy }: Props) {
  var content: React.ReactNode[] = [];
  if (modal && typeof modal === "object" && modal.type === "trash-confirm")
    content.push(
      (<Modal
        key={"trash-confirm"}
        title={t("confirm.trash.title")}
        description={t("confirm.trash.desc", { name: modal.name })}
        closeLabel={t("btn.close")}
        onClose={function () {
          setModal(null);
        }}
        footer={<React.Fragment>
          {hostButton(
            t("btn.cancel"),
            function () {
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            t("btn.trash"),
            function () {
              post(
                "/delete",
                Object.assign(
                  {
                    root: (
                      modal as Extract<ConfirmModal, { type: "trash-confirm"; }>
                    ).root,
                    name: (modal as Extract<ConfirmModal, { name: string; }>)
                      .name,
                  },
                  (modal as { workspace?: string; }).workspace
                    ? { workspace: (modal as { workspace?: string; }).workspace }
                    : {},
                ),
                "result.trashed",
                {
                  name: (modal as Extract<ConfirmModal, { name: string; }>).name,
                },
              )
                .then(function () {
                  setModal(null);
                })
                .catch(function () { });
            },
            "danger",
            busy,
          )}
        </React.Fragment>}
      />),
    );

  if (modal && typeof modal === "object" && modal.type === "delete-confirm")
    content.push(
      (<Modal
        key={"delete-confirm"}
        title={t("confirm.delete.title")}
        description={t("confirm.delete.desc", { name: modal.name })}
        closeLabel={t("btn.close")}
        onClose={function () {
          setModal(null);
        }}
        footer={<React.Fragment>
          {hostButton(
            t("btn.cancel"),
            function () {
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            t("btn.delete.forever"),
            function () {
              post(
                "/trash-delete",
                {
                  id: (
                    modal as Extract<ConfirmModal, { type: "delete-confirm"; }>
                  ).id,
                },
                "result.deleted",
                {
                  name: (modal as Extract<ConfirmModal, { name: string; }>).name,
                },
              )
                .then(function () {
                  setModal(null);
                })
                .catch(function () { });
            },
            "danger",
            busy,
          )}
        </React.Fragment>}
      />),
    );
  return content;
}
