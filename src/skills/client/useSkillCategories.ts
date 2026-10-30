import * as React from "react";
import type { RootView, SkillView } from "../contracts.js";
import type { SkillCommands } from "./useSkillCommands.js";
import type { ApiCall } from "../contracts.js";
import type { ConfirmModal, ModalState } from "./manager-types.js";
import type { Translate } from "./messages.js";
import { MUTATION_HEADERS } from "./api-client.js";
import { translateError } from "./messages.js";

type SetModal = React.Dispatch<React.SetStateAction<ModalState>>;

export function useSkillCategories(
  t: Translate,
  sessionApi: ApiCall,
  setModal: SetModal,
  commands: Pick<SkillCommands, "post" | "busy" | "setResult" | "setBusy" | "inflightRef">,
  refresh: (silent: boolean) => Promise<unknown>,
  loadWorkspaceDetail: (path: string) => Promise<unknown>,
) {
  const { post, busy, setResult, setBusy, inflightRef } = commands;
  var asState = React.useState(""),
    addSearch = asState[0],
    setAddSearch = asState[1];

  var aselState = React.useState<Record<string, boolean>>({}),
    addSelection = aselState[0],
    setAddSelection = aselState[1];

  var cns = React.useState(""),
    categoryName = cns[0],
    setCategoryName = cns[1];

  var draggingRef = React.useRef<{
    root: string;
    name: string;
    currentCategoryId: string;
  } | null>(null);

  function assignCategoryBatch(addModal: Extract<ConfirmModal, { type: "category-add"; }>, names: string[]) {
    if (!names.length) {
      setAddSelection({});
      setAddSearch("");
      setModal(null);
      return;
    }
    if (inflightRef.current) return;
    var scoped = function (extra: Record<string, unknown>) {
      return addModal.workspace
        ? Object.assign({}, extra, { workspace: addModal.workspace })
        : extra;
    };
    inflightRef.current = true;
    setBusy(true);
    setAddSelection({});
    setAddSearch("");
    setModal(null);
    names
      .reduce<Promise<unknown>>(function (p, name) {
        return p.then(function () {
          return sessionApi("/category-assign", {
            method: "POST",
            headers: MUTATION_HEADERS,
            body: JSON.stringify(
              scoped({
                root: addModal.root,
                name: name,
                category: addModal.id,
              }),
            ),
          });
        });
      }, Promise.resolve())
      .then(function () {
        setResult({
          ok: true,
          text: t("category.batchAssigned", {
            count: names.length,
            category: addModal.name,
          }),
        });
      })
      .catch(function (err: unknown) {
        setResult({ ok: false, text: translateError(t, err) });
      })
      .finally(function () {
        inflightRef.current = false;
        setBusy(false);
        var ws = addModal.workspace;
        Promise.all([
          refresh(true),
          ws ? loadWorkspaceDetail(ws) : null,
        ]).catch(function () { });
      });
  }

  function submitCategory(categoryModal: Extract<ConfirmModal, { type: "category-create" | "category-rename" }>, canSubmit: boolean) {
    var renaming = categoryModal.type === "category-rename";
    var nameTrimmed = categoryName.trim();
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
  }

  function deleteCategory(categoryModal: Extract<ConfirmModal, { type: "category-delete" }>) {
    post(
      "/category-delete",
      {
        root: (
          categoryModal as Extract<ConfirmModal, { type: "category-delete"; }>
        ).root,
        id: (
          categoryModal as Extract<ConfirmModal, { type: "category-delete"; }>
        ).id,
        workspace: (
          categoryModal as Extract<ConfirmModal, { type: "category-delete"; }>
        ).workspace,
      },
      "category.deleted",
      {
        name: (
          categoryModal as Extract<ConfirmModal, { type: "category-delete"; }>
        ).name,
      },
    )
      .then(function () {
        setModal(null);
      })
      .catch(function () { });
  }

  function openCategoryCreate(root: RootView, workspacePath?: string) {
    setCategoryName("");
    setModal({
      type: "category-create",
      root: root.key,
      workspace: workspacePath,
    });
  }

  function openCategoryAdd(root: RootView, bucket: { id: string; name: string }, workspacePath: string | undefined, sourceList: { root: RootView; skill: SkillView }[]) {
    var catMap: Record<string, string> = {};
    (root.categories || []).forEach(function (c) {
      catMap[c.id] = c.name;
    });

    var candidates = sourceList
      .filter(function (row) {
        return row.skill.categoryId !== bucket.id;
      })
      .map(function (row) {
        return {
          name: row.skill.name,
          declaredName: row.skill.declaredName,
          description: row.skill.description,
          currentCatName:
            (row.skill.categoryId &&
              catMap[row.skill.categoryId]) ||
            t("category.uncategorized"),
        };
      });
    setAddSelection({});
    setAddSearch("");
    setModal({
      type: "category-add",
      root: root.key,
      id: bucket.id,
      name: bucket.name,
      workspace: workspacePath,
      skills: candidates,
    });
  }

  function openCategoryRename(root: RootView, bucket: { id: string; name: string }, workspacePath?: string) {
    setCategoryName(bucket.name);
    setModal({
      type: "category-rename",
      root: root.key,
      id: bucket.id,
      name: bucket.name,
      workspace: workspacePath,
    });
  }

  function openCategoryDelete(root: RootView, bucket: { id: string; name: string }, workspacePath?: string) {
    setModal({
      type: "category-delete",
      root: root.key,
      id: bucket.id,
      name: bucket.name,
      workspace: workspacePath,
    });
  }

  return {
    openCategoryCreate,
    openCategoryAdd,
    openCategoryRename,
    openCategoryDelete,
    submitCategory,
    deleteCategory,
    addSearch,
    setAddSearch,
    addSelection,
    setAddSelection,
    categoryName,
    setCategoryName,
    draggingRef,
    assignCategoryBatch,
  };
}
export type SkillCategories = ReturnType<typeof useSkillCategories>;
