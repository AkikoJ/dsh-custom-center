import * as React from "react";
import { type ModalState, type ResultMessage, type Translate } from "../client-types.js";
import { type DestinationValue, destinationReady } from "../destination-picker.js";
import type { RepositoryDestination, WorkspaceRow } from "../types.js";
import { DestinationPicker, Input, Modal, hostButton } from "./controls.js";
import { countKey, translateError } from "./messages.js";
import { UploadFile, UploadSelection, droppedFiles } from "./uploads.js";

interface renderEditorDialogsProps {
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  createDestination: DestinationValue;
  busy: boolean;
  workspaceRows: WorkspaceRow[];
  userDestinations: RepositoryDestination[];
  setCreateDestination: React.Dispatch<React.SetStateAction<DestinationValue>>;
  form: Record<string, string>;
  updateForm: (key: string, value: string) => void;
  submitCreate: () => void;
  pickerOpenRef: React.MutableRefObject<boolean>;
  setUpload: React.Dispatch<React.SetStateAction<UploadSelection | null>>;
  setResult: (value: ResultMessage | null) => void;
  importInputRef: React.RefObject<HTMLInputElement>;
  selectUploadFiles: (files: ArrayLike<UploadFile> | null) => void;
  folderInputRef: React.RefObject<HTMLInputElement>;
  openNativePicker: (ref: React.RefObject<HTMLInputElement>) => void;
  upload: UploadSelection | null;
  importDestination: DestinationValue;
  setImportDestination: React.Dispatch<React.SetStateAction<DestinationValue>>;
  result: ResultMessage | null;
  submitImport: () => void;
}

export function renderEditorDialogs({
  modal,
  t,
  setModal,
  createDestination,
  busy,
  workspaceRows,
  userDestinations,
  setCreateDestination,
  form,
  updateForm,
  submitCreate,
  pickerOpenRef,
  setUpload,
  setResult,
  importInputRef,
  selectUploadFiles,
  folderInputRef,
  openNativePicker,
  upload,
  importDestination,
  setImportDestination,
  result,
  submitImport,
}: renderEditorDialogsProps) {
  var content: React.ReactNode[] = [];
  if (modal === "create")
    content.push(
      (<Modal
        key={"create"}
        title={t("create.title")}
        closeLabel={t("btn.close")}
        onClose={function () {
          setModal(null);
        }}
      >
        <div className={"dssm-form"}>
          <DestinationPicker
            t={t}
            value={createDestination}
            disabled={busy}
            allowAgents={true}
            workspaces={workspaceRows}
            userDestinations={userDestinations}
            onChange={function (next: Partial<DestinationValue>) {
              setCreateDestination(Object.assign({}, createDestination, next));
            }}
          />
          {[
            ["name", "create.name", "create.name.placeholder"],
            [
              "description",
              "create.description",
              "create.description.placeholder",
            ],
          ].map(function (field) {
            return (<label key={field[0]} className={"dssm-field"}>
              <span className={"dssm-label"}>
                {t(field[1])}
              </span>
              <Input
                value={form[field[0]]}
                placeholder={t(field[2])}
                onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                  updateForm(field[0], e.target.value);
                }}
              />
            </label>);
          })}
          <label className={"dssm-field"}>
            <span className={"dssm-label"}>
              {t("create.body")}
            </span>
            <Input.TextArea
              rows={8}
              value={form.body}
              placeholder={t("create.body.placeholder")}
              onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) {
                updateForm("body", e.target.value);
              }}
            />
          </label>
          <p className={"dssm-help"}>
            {t("create.chat.note")}
          </p>
        </div>
        <div className={"dssm-modal-actions"}>
          {hostButton(
            t("btn.cancel"),
            function () {
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            t("btn.create.now"),
            submitCreate,
            "primary",
            busy ||
            !form.name.trim() ||
            !form.description.trim() ||
            !form.body.trim() ||
            !destinationReady(
              createDestination,
              workspaceRows,
              userDestinations,
            ),
          )}
        </div>
      </Modal>),
    );

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
