import type { SkillDetail } from "./useSkillDetail.js";
import { Button as PrimitiveButton } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type ModalState } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { Input, Modal } from "./controls.js";

interface Props {
  detailFlow: Pick<SkillDetail, "detail" | "setCopyState" | "copyText" | "copyState">;
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
}

export function renderDetailDialog({ modal, t, setModal, detailFlow }: Props) {
  const { detail, setCopyState, copyText, copyState } = detailFlow;
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
  return content;
}
