import * as React from "react";
import type { ApiCall } from "../contracts.js";
import type { Detail, ModalState, ResultMessage } from "./manager-types.js";
import type { Translate } from "./messages.js";
import type { RootView, SkillView } from "../contracts.js";
import { MUTATION_HEADERS } from "./api-client.js";
import { translateError } from "./messages.js";

type SetModal = React.Dispatch<React.SetStateAction<ModalState>>;
type SetResult = (value: ResultMessage | null) => void;

export function useSkillDetail(t: Translate, sessionApi: ApiCall, setModal: SetModal, setResult: SetResult, setBusy: React.Dispatch<React.SetStateAction<boolean>>) {
  var ds = React.useState<Detail | null>(null),
    detail = ds[0],
    setDetail = ds[1];

  var copySt = React.useState<"idle" | "copied" | "failed">("idle"),
    copyState = copySt[0],
    setCopyState = copySt[1];

  function copyText(text: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(function () {
        setCopyState("copied");
        setTimeout(function () {
          setCopyState("idle");
        }, 1500);
      })
      .catch(function () {
        setCopyState("failed");
      });
  }

  function openDetail(
    root: RootView,
    skill: SkillView,
    workspacePath?: string,
  ) {
    setBusy(true);
    setDetail(null);
    setCopyState("idle");
    setModal("detail");
    sessionApi("/detail", {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify(
        workspacePath
          ? { root: root.key, name: skill.name, workspace: workspacePath }
          : { root: root.key, name: skill.name },
      ),
    })
      .then(setDetail)
      .catch(function (error) {
        setResult({
          ok: false,
          text: t("error.action", { error: translateError(t, error) }),
        });
        setModal(null);
      })
      .finally(function () {
        setBusy(false);
      });
  }
  return { detail, copyState, setCopyState, copyText, openDetail };
}
export type SkillDetail = ReturnType<typeof useSkillDetail>;
