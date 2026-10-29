import { Button as PrimitiveButton } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type ConfirmModal, type Detail, type ModalState, type Post, type Translate } from "../client-types.js";
import { Input, Modal, hostButton } from "./controls.js";

interface renderSkillDialogsProps {
  modal: ModalState;
  detail: Detail | null;
  t: Translate;
  setCopyState: React.Dispatch<React.SetStateAction<"idle" | "copied" | "failed">>;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  copyText: (text: string) => void;
  copyState: "idle" | "copied" | "failed";
  syncOverwrite: boolean;
  setSyncOverwrite: React.Dispatch<React.SetStateAction<boolean>>;
  post: Post;
  submitSync: (syncModal: Extract<ConfirmModal, { type: "sync-confirm"; }>) => void;
  busy: boolean;
}

export function renderSkillDialogs({
  modal,
  detail,
  t,
  setCopyState,
  setModal,
  copyText,
  copyState,
  syncOverwrite,
  setSyncOverwrite,
  post,
  submitSync,
  busy,
}: renderSkillDialogsProps) {
  var content: React.ReactNode[] = [];
  if (modal === "detail") {
    var currentDetail = detail;
    var detailTitle = currentDetail
      ? currentDetail.declaredName || currentDetail.name
      : "";
    content.push(
      (<Modal
        key={"detail"}
        className={"dssm-modal-wide"}
        title={t("detail.title")}
        closeLabel={t("btn.close")}
        onClose={function () {
          setCopyState("idle");
          setModal(null);
        }}
      >
        {currentDetail
          ? (<div className={"dssm-detail"}>
            <div className={"dssm-detail-head"}>
              <div className={"dssm-name"} title={detailTitle}>
                {detailTitle}
              </div>
              {currentDetail.body
                ? (<PrimitiveButton
                  variant={"outline"}
                  size={"sm"}
                  aria-live={"polite"}
                  onClick={function () {
                    if (currentDetail && currentDetail.body)
                      copyText(currentDetail.body);
                  }}
                >
                  {copyState === "copied"
                    ? t("detail.copied")
                    : copyState === "failed"
                      ? t("detail.copyFailed")
                      : t("detail.copyBody")}
                </PrimitiveButton>)
                : null}
            </div>
            {currentDetail.description
              ? (<p className={"dssm-desc"}>
                {currentDetail.description}
              </p>)
              : null}
            <div className={"dssm-detail-path"}>
              {currentDetail.path}
            </div>
            {currentDetail.diagnostics.length
              ? currentDetail.diagnostics.map(function (item, index) {
                return (<div key={index} className={"dssm-diag"}>
                  {t(item.code!, item.params || {})}
                </div>);
              })
              : null}
            <Input.TextArea
              className={"dssm-detail-body"}
              readOnly={true}
              value={currentDetail.body || ""}
              rows={16}
            />
          </div>)
          : (<div className={"dssm-empty"}>
            {t("loading")}
          </div>)}
      </Modal>),
    );
  }

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
