import * as React from "react";
import type { ModalState, Post, ResultMessage } from "./manager-types.js";
import type { Translate } from "./messages.js";
import type { RepositoryDestination, WorkspaceRow } from "../contracts.js";
import { type DestinationValue, defaultDestination, destinationPayload, destinationReady } from "../destination-picker.js";

type SetModal = React.Dispatch<React.SetStateAction<ModalState>>;
type SetResult = (value: ResultMessage | null) => void;
type Destinations = { workspaceRows: WorkspaceRow[]; userDestinations: RepositoryDestination[] };

export function useSkillCreate(
  t: Translate,
  post: Post,
  setModal: SetModal,
  setResult: SetResult,
  loadWorkspaces: () => unknown,
  { workspaceRows, userDestinations }: Destinations,
) {
  var fms = React.useState<Record<string, string>>({
    root: "dsh",
    name: "",
    description: "",
    body: "",
  }),
    form = fms[0],
    setForm = fms[1];

  var cds = React.useState<DestinationValue>(defaultDestination()),
    createDestination = cds[0],
    setCreateDestination = cds[1];

  function updateForm(key: string, value: string) {
    setForm(Object.assign({}, form, { [key]: value }));
  }

  function submitCreate() {
    if (!destinationReady(createDestination, workspaceRows, userDestinations))
      return;
    post(
      "/create",
      Object.assign(
        {},
        form,
        { root: undefined },
        destinationPayload(createDestination),
      ),
      null,
    )
      .then(function (data) {
        setModal(null);
        setForm({ root: "dsh", name: "", description: "", body: "" });
        setResult({
          ok: true,
          text:
            t("result.created", { name: data.name }) +
            (createDestination.scope === "workspace"
              ? " · " + t("dest.createdInWorkspace")
              : ""),
        });
      })
      .catch(function () { });
  }

  function openCreate() {
    setForm(Object.assign({}, form, { root: "dsh" }));
    setCreateDestination(defaultDestination());
    setModal("create");
    loadWorkspaces();
  }
  return { form, createDestination, setCreateDestination, updateForm, submitCreate, openCreate };
}
export type SkillCreate = ReturnType<typeof useSkillCreate>;
