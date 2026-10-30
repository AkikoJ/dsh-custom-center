import type { SkillImport } from "./useSkillImport.js";
import * as React from "react";
import { type ModalState, type ResultMessage } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { type DestinationValue, destinationReady } from "../destination-picker.js";
import type { RepositoryDestination, WorkspaceRow } from "../contracts.js";
import { DestinationPicker, Modal, hostButton } from "./controls.js";
import { countKey, translateError } from "./messages.js";
import { droppedFiles } from "./uploads.js";

interface Props {
  importing: Pick<SkillImport, "pickerOpenRef" | "setUpload" | "importInputRef" | "selectUploadFiles" | "folderInputRef" | "openNativePicker" | "upload" | "importDestination" | "setImportDestination" | "submitImport">;
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  busy: boolean;
  workspaceRows: WorkspaceRow[];
  userDestinations: RepositoryDestination[];
  setResult: (value: ResultMessage | null) => void;
  result: ResultMessage | null;
}

export function renderImportDialog({ modal, t, setModal, busy, workspaceRows, userDestinations, setResult, result, importing }: Props) {
  const { pickerOpenRef, setUpload, importInputRef, selectUploadFiles, folderInputRef, openNativePicker, upload, importDestination, setImportDestination, submitImport } = importing;
  var content: React.ReactNode[] = [];
  if (modal === "import")
    content.push(
      (<Modal
        key={"import"}
        className={"dssm-modal-import"}
        title={t("import.title")}
        closeLabel={t("btn.close")}
        onClose={function () {
          pickerOpenRef.current = false;
          setUpload(null);
          setResult(null);
          setModal(null);
        }}
      >
        <input
          ref={importInputRef}
          className={"dssm-hidden-input"}
          type={"file"}
          accept={".zip,.md"}
          onChange={function (event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          className={"dssm-hidden-input"}
          type={"file"}
          multiple={true}
          webkitdirectory={""}
          directory={""}
          onChange={function (event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div
          className={"dssm-dropzone"}
          onDragOver={function (event: React.DragEvent<HTMLDivElement>) {
            event.preventDefault();
            event.currentTarget.classList.add("dssm-dropzone-active");
          }}
          onDragLeave={function (event: React.DragEvent<HTMLDivElement>) {
            event.currentTarget.classList.remove("dssm-dropzone-active");
          }}
          onDrop={function (event: React.DragEvent<HTMLDivElement>) {
            event.preventDefault();
            event.currentTarget.classList.remove("dssm-dropzone-active");
            droppedFiles(event.dataTransfer)
              .then(selectUploadFiles)
              .catch(function (error) {
                setResult({ ok: false, text: translateError(t, error) });
              });
          }}
        >
          <span className={"dssm-dropzone-title"}>
            {t("upload.drop.title")}
          </span>
          <span className={"dssm-dropzone-copy"}>
            {t("upload.drop.copy")}
          </span>
          <div className={"dssm-upload-choices"}>
            <button
              type={"button"}
              className={"dssm-upload-link"}
              disabled={busy}
              onClick={function (event: React.MouseEvent<HTMLButtonElement>) {
                event.stopPropagation();
                openNativePicker(folderInputRef);
              }}
            >
              {t("btn.folder.pick")}
            </button>
            <span className={"dssm-upload-divider"}>
              {"/"}
            </span>
            <button
              type={"button"}
              className={"dssm-upload-link"}
              disabled={busy}
              onClick={function (event: React.MouseEvent<HTMLButtonElement>) {
                event.stopPropagation();
                openNativePicker(importInputRef);
              }}
            >
              {t("btn.file.pick")}
            </button>
          </div>
        </div>
        {upload
          ? (<div className={"dssm-file"} title={upload.name}>
            <span className={"dssm-file-kind"} aria-hidden={"true"}>
              {upload.kind === "zip"
                ? "ZIP"
                : upload.kind === "folder"
                  ? "DIR"
                  : "MD"}
            </span>
            <span className={"dssm-file-name"}>
              {upload.name}
            </span>
            <span className={"dssm-file-meta"}>
              {t(countKey("upload.selected", upload.count), {
                count: upload.count,
                size:
                  upload.size < 1024
                    ? upload.size + " B"
                    : Math.ceil(upload.size / 1024) + " KB",
              })}
            </span>
            <button
              type={"button"}
              className={"dssm-file-remove"}
              aria-label={t("upload.remove")}
              onClick={function () {
                setUpload(null);
              }}
            >
              {"×"}
            </button>
          </div>)
          : null}
        <DestinationPicker
          t={t}
          value={importDestination}
          disabled={busy}
          allowAgents={true}
          workspaces={workspaceRows}
          userDestinations={userDestinations}
          onChange={function (next: Partial<DestinationValue>) {
            setImportDestination(Object.assign({}, importDestination, next));
          }}
        />
        {result
          ? (<div
            className={"dssm-feedback" +
              (result.warning
                ? " dssm-warning"
                : result.ok
                  ? ""
                  : " dssm-error")}
            role={"alert"}
          >
            {result.text}
          </div>)
          : null}
        <div className={"dssm-upload-requirements"}>
          <div className={"dssm-label"}>
            {t("upload.requirements")}
          </div>
          <ul>
            <li>
              {t("upload.requirement.skill")}
            </li>
            <li>
              {t("upload.requirement.frontmatter")}
            </li>
            <li>
              {t("upload.requirement.copy")}
            </li>
          </ul>
        </div>
        <div className={"dssm-modal-actions"}>
          {hostButton(
            t("btn.cancel"),
            function () {
              pickerOpenRef.current = false;
              setUpload(null);
              setResult(null);
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            busy ? t("upload.importing") : t("btn.import.now"),
            submitImport,
            "primary",
            busy ||
            !upload ||
            !destinationReady(
              importDestination,
              workspaceRows,
              userDestinations,
            ),
          )}
        </div>
      </Modal>),
    );
  return content;
}
