import type { SkillCreate } from "./useSkillCreate.js";
import * as React from "react";
import { type ModalState } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { type DestinationValue, destinationReady } from "../destination-picker.js";
import type { RepositoryDestination, WorkspaceRow } from "../contracts.js";
import { DestinationPicker, Input, Modal, hostButton } from "./controls.js";

interface Props {
  create: Pick<SkillCreate, "createDestination" | "setCreateDestination" | "form" | "updateForm" | "submitCreate">;
  modal: ModalState;
  t: Translate;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  busy: boolean;
  workspaceRows: WorkspaceRow[];
  userDestinations: RepositoryDestination[];
}

export function renderCreateDialog({ modal, t, setModal, busy, workspaceRows, userDestinations, create }: Props) {
  const { createDestination, setCreateDestination, form, updateForm, submitCreate } = create;
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
  return content;
}
