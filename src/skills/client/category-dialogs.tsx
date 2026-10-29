import * as React from "react";
import { type ConfirmModal, type ModalState, type Post, type Translate } from "../client-types.js";
import { Input, Modal, hostButton } from "./controls.js";

interface renderCategoryDialogsProps {
  modal: ModalState;
  assignCategoryBatch: (addModal: Extract<ConfirmModal, { type: "category-add"; }>, names: string[]) => void;
  categoryName: string;
  busy: boolean;
  post: Post;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  t: Translate;
  setCategoryName: React.Dispatch<React.SetStateAction<string>>;
  addSearch: string;
  addSelection: Record<string, boolean>;
  setAddSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAddSearch: React.Dispatch<React.SetStateAction<string>>;
}

export function renderCategoryDialogs({
  modal,
  categoryName,
  busy,
  post,
  setModal,
  t,
  setCategoryName,
  addSearch,
  addSelection,
  setAddSelection,
  setAddSearch,
  assignCategoryBatch,
}: renderCategoryDialogsProps) {
  var content: React.ReactNode[] = [];
  if (
    modal &&
    typeof modal === "object" &&
    (modal.type === "category-create" || modal.type === "category-rename")
  ) {
    var renaming = modal.type === "category-rename";
    var categoryModal = modal;
    var nameTrimmed = categoryName.trim();
    var canSubmit =
      !!nameTrimmed &&
      (!renaming ||
        nameTrimmed !==
        (categoryModal as Extract<ConfirmModal, { type: "category-rename"; }>)
          .name);
    var submitCategory = function () {
      if (busy || !canSubmit) return;
      var request = renaming
        ? post(
          "/category-rename",
          {
            root: categoryModal.root,
            id: (
              categoryModal as Extract<
                ConfirmModal,
                { type: "category-rename"; }
              >
            ).id,
            name: nameTrimmed,
            workspace: categoryModal.workspace,
          },
          "category.renamed",
        )
        : post(
          "/category-create",
          {
            root: categoryModal.root,
            name: nameTrimmed,
            workspace: categoryModal.workspace,
          },
          "category.created",
          { name: nameTrimmed },
        );
      request
        .then(function () {
          setModal(null);
        })
        .catch(function () { });
    };
    content.push(
      (<Modal
        key={modal.type}
        title={renaming ? t("category.rename") : t("category.create")}
        closeLabel={t("btn.close")}
        onClose={function () {
          setModal(null);
        }}
      >
        <div className={"dssm-form"}>
          <label className={"dssm-field"}>
            <span className={"dssm-label"}>
              {t("category.name")}
            </span>
            <Input
              value={categoryName}
              maxLength={24}
              aria-label={t("category.name")}
              onChange={function (event) {
                setCategoryName(event.target.value);
              }}
              onPressEnter={submitCategory}
            />
          </label>
          <p className={"dssm-help"}>
            {t("category.note")}
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
            renaming ? t("btn.confirm") : t("category.create"),
            submitCategory,
            "primary",
            busy || !canSubmit,
          )}
        </div>
      </Modal>),
    );
  }

  if (modal && typeof modal === "object" && modal.type === "category-add") {
    var addModal = modal as Extract<ConfirmModal, { type: "category-add"; }>;
    var kw = addSearch.trim().toLowerCase();
    var availableList = addModal.skills.filter(function (s) {
      return (
        !kw ||
        s.name.toLowerCase().includes(kw) ||
        (s.declaredName && s.declaredName.toLowerCase().includes(kw)) ||
        (s.description && s.description.toLowerCase().includes(kw))
      );
    });
    var candidateNames = new Set(
      addModal.skills.map(function (s) {
        return s.name;
      }),
    );
    var chosenCount = Object.keys(addSelection).filter(function (k) {
      return addSelection[k] && candidateNames.has(k);
    }).length;
    content.push(
      (<Modal
        key={"category-add"}
        title={t("category.selectSkills", { name: addModal.name })}
        closeLabel={t("btn.close")}
        onClose={function () {
          setAddSelection({});
          setAddSearch("");
          setModal(null);
        }}
      >
        <Input
          placeholder={t("search.placeholder")}
          value={addSearch}
          allowClear={true}
          onChange={function (e) {
            setAddSearch(e.target.value);
          }}
        />
        <div className={"dssm-batch-list"}>
          {availableList.length
            ? availableList.map(function (item) {
              var isChecked = !!addSelection[item.name];
              return (<div
                key={item.name}
                className={"dssm-batch-item" + (isChecked ? " selected" : "")}
                onClick={function () {
                  var next = Object.assign({}, addSelection);
                  if (isChecked) delete next[item.name];
                  else next[item.name] = true;
                  setAddSelection(next);
                }}
              >
                <input
                  type={"checkbox"}
                  checked={isChecked}
                  readOnly={true}
                />
                <div className={"dssm-batch-info"}>
                  <div className={"dssm-batch-name-row"}>
                    <span className={"dssm-batch-name"}>
                      {item.declaredName || item.name}
                    </span>
                    {item.currentCatName
                      ? (<span className={"dssm-batch-cat-tag"}>
                        {item.currentCatName}
                      </span>)
                      : null}
                  </div>
                  {item.description
                    ? (<div className={"dssm-batch-desc"} title={item.description}>
                      {item.description}
                    </div>)
                    : null}
                </div>
              </div>);
            })
            : (<div className={"dssm-empty"}>
              {t("category.noAvailableSkills")}
            </div>)}
        </div>
        <div className={"dssm-modal-actions"}>
          {hostButton(
            t("btn.cancel"),
            function () {
              setAddSelection({});
              setAddSearch("");
              setModal(null);
            },
            "outline",
          )}
          {hostButton(
            t("category.addSkills") +
            (chosenCount ? " (" + chosenCount + ")" : ""),
            function () {
              var names = Object.keys(addSelection).filter(function (k) { return addSelection[k] && candidateNames.has(k); });
              assignCategoryBatch(addModal, names);
            },
            "primary",
            busy || !chosenCount,
          )}
        </div>
      </Modal>),
    );
  }

  if (modal && typeof modal === "object" && modal.type === "category-delete")
    content.push(
      (<Modal
        key={"category-delete"}
        title={t("confirm.category.title")}
        description={t("confirm.category.desc", { name: modal.name })}
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
            t("category.delete"),
            function () {
              post(
                "/category-delete",
                {
                  root: (
                    modal as Extract<ConfirmModal, { type: "category-delete"; }>
                  ).root,
                  id: (
                    modal as Extract<ConfirmModal, { type: "category-delete"; }>
                  ).id,
                  workspace: (
                    modal as Extract<ConfirmModal, { type: "category-delete"; }>
                  ).workspace,
                },
                "category.deleted",
                {
                  name: (
                    modal as Extract<ConfirmModal, { type: "category-delete"; }>
                  ).name,
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
