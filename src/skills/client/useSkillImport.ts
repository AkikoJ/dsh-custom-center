import * as React from "react";
import type { ModalState, Post, ResultMessage } from "./manager-types.js";
import type { Translate } from "./messages.js";
import type { RepositoryDestination, WorkspaceRow } from "../contracts.js";
import { type DestinationValue, defaultDestination, destinationPayload, destinationReady } from "../destination-picker.js";
import { summarizeImportResult, translateError } from "./messages.js";
import { UploadFile, UploadSelection, buildUploadPayload, inspectUploadSelection } from "./uploads.js";

type SetModal = React.Dispatch<React.SetStateAction<ModalState>>;
type SetResult = (value: ResultMessage | null) => void;
type Destinations = { workspaceRows: WorkspaceRow[]; userDestinations: RepositoryDestination[] };

export function useSkillImport(
  t: Translate,
  busy: boolean,
  post: Post,
  setModal: SetModal,
  setResult: SetResult,
  loadWorkspaces: () => unknown,
  { workspaceRows, userDestinations }: Destinations,
) {
  var ids = React.useState<DestinationValue>(defaultDestination()),
    importDestination = ids[0],
    setImportDestination = ids[1];

  var us = React.useState<UploadSelection | null>(null),
    upload = us[0],
    setUpload = us[1];

  var importInputRef = React.useRef<HTMLInputElement>(null);

  var folderInputRef = React.useRef<HTMLInputElement>(null);

  var pickerOpenRef = React.useRef(false);

  function selectUploadFiles(files: ArrayLike<UploadFile> | null) {
    pickerOpenRef.current = false;
    var selected = inspectUploadSelection(files);
    if (!selected) return;
    if (selected.error) {
      setUpload(null);
      setResult({ ok: false, text: translateError(t, selected.error) });
      return;
    }
    setUpload(selected);
    setResult(null);
  }

  function openNativePicker(ref: React.RefObject<HTMLInputElement>) {
    if (busy || pickerOpenRef.current || !ref.current) return;
    pickerOpenRef.current = true;
    ref.current.value = "";
    function release() {
      setTimeout(function () {
        pickerOpenRef.current = false;
      }, 0);
    }
    window.addEventListener("focus", release, { once: true });
    ref.current.click();
    setTimeout(function () {
      pickerOpenRef.current = false;
    }, 30000);
  }

  function submitImport() {
    if (
      !upload ||
      !destinationReady(importDestination, workspaceRows, userDestinations)
    )
      return;
    buildUploadPayload(upload)
      .then(function (payload) {
        return post(
          "/upload",
          Object.assign({}, payload, destinationPayload(importDestination)),
          null,
        );
      })
      .then(function (data) {
        var summary = summarizeImportResult(t, data);
        setResult({
          ok: summary.ok,
          warning: summary.warning,
          text: summary.text,
        });
        if (summary.imported) {
          setModal(null);
          setUpload(null);
        }
      })
      .catch(function () { });
  }

  function openImport() {
    setResult(null);
    setUpload(null);
    setImportDestination(defaultDestination());
    setModal("import");
    loadWorkspaces();
  }
  return {
    importDestination,
    setImportDestination,
    upload,
    setUpload,
    importInputRef,
    folderInputRef,
    pickerOpenRef,
    selectUploadFiles,
    openNativePicker,
    submitImport,
    openImport,
  };
}
export type SkillImport = ReturnType<typeof useSkillImport>;
