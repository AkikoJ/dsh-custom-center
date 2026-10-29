import * as React from "react";
import { type Filters, type SectionProps, type SessionSnapshot, type ViewProps } from "../client-types.js";
import { renderCategoryDialogs } from "./category-dialogs.js";
import { renderEditorDialogs } from "./editor-dialogs.js";
import { resolveT, translateError } from "./messages.js";
import { createScopePanels } from "./scope-panels.js";
import { renderSkillDialogs } from "./skill-dialogs.js";
import { createSkillRows } from "./skill-rows.js";
import { createSourceTree } from "./source-tree.js";
import { CSS } from "./styles.js";
import { useSkillManager } from "./useSkillManager.js";

function currentSessionId(snapshot?: SessionSnapshot) {
  if (!snapshot) return undefined;
  var byId = snapshot.byId || {};
  var ids =
    Array.isArray(snapshot.ids) && snapshot.ids.length
      ? snapshot.ids
      : Object.keys(byId);
  for (var i = 0; i < ids.length; i++) {
    var row = byId[ids[i]];
    if (row && row.retainedBy && row.retainedBy.mainView) return ids[i];
  }
  for (var id in byId) {
    if (ids.indexOf(id) !== -1) continue;
    if (byId[id] && byId[id].retainedBy && byId[id].retainedBy!.mainView)
      return id;
  }
}

function SkillManagerSection(props: Partial<SectionProps>) {
  var t = resolveT(props && props.t);
  var sessionId =
    props && props.useSessions
      ? props.useSessions(currentSessionId)
      : undefined;
  var scopes = React.useState("user"),
    filtersState = React.useState<Record<string, Filters>>({}),
    expandedState = React.useState<Record<string, boolean>>({});
  // 按会话重挂载请求和表单状态，旧会话的异步响应不能覆盖新会话页面。
  return (<SkillManagerView
    {...Object.assign({}, props, {
      t: t,
      key: sessionId || "no-session",
      sessionId: sessionId,
      scope: scopes[0],
      setScope: scopes[1],
      savedFilters: filtersState[0],
      setSavedFilters: filtersState[1],
      expanded: expandedState[0],
      setExpanded: expandedState[1],
    })}
  />);
}
function SkillManagerView(props: ViewProps) {
  var {
    submitSync,
    assignCategoryBatch,
    openFolder,
    t,
    allRoots,
    openSync,
    busy,
    openDetail,
    setResult,
    post,
    setModal,
    draggingRef,
    setCategoryName,
    expanded,
    query,
    filters,
    setExpanded,
    setAddSelection,
    setAddSearch,
    rows,
    filteredRows,
    activeSource,
    filterKey,
    workspaceRows,
    scope,
    selectedWorkspace,
    roots,
    workspaceList,
    selectedDetail,
    data,
    setScope,
    loadWorkspaces,
    refresh,
    summary,
    options,
    setSource,
    updateFilter,
    workspacePath,
    selectWorkspace,
    setQuery,
    refreshWorkspaceDetails,
    snapshot,
    openCreate,
    openImport,
    modal,
    createDestination,
    userDestinations,
    setCreateDestination,
    form,
    updateForm,
    submitCreate,
    pickerOpenRef,
    setUpload,
    importInputRef,
    selectUploadFiles,
    folderInputRef,
    openNativePicker,
    upload,
    importDestination,
    setImportDestination,
    result,
    submitImport,
    detail,
    setCopyState,
    copyText,
    copyState,
    syncOverwrite,
    setSyncOverwrite,
    categoryName,
    addSearch,
    addSelection,
  } = useSkillManager(props);
  var { renderSkill, clearDragHighlights } = createSkillRows({ t, allRoots, openSync, busy, openDetail, openFolder, post, setModal, draggingRef });
  var { renderRoot } = createSourceTree({
    busy,
    openSync,
    t,
    setCategoryName,
    setModal,
    post,
    expanded,
    query,
    filters,
    draggingRef,
    clearDragHighlights,
    setExpanded,
    setAddSelection,
    setAddSearch,
    renderSkill,
    rows,
    filteredRows,
    activeSource,
    filterKey,
  });
  var { renderList, renderTrash, tabs, skillControls } = createScopePanels({
    workspaceRows,
    t,
    scope,
    selectedWorkspace,
    roots,
    renderRoot,
    query,
    filters,
    workspaceList,
    selectedDetail,
    rows,
    data,
    post,
    busy,
    setModal,
    setScope,
    loadWorkspaces,
    refresh,
    summary,
    activeSource,
    options,
    setSource,
    updateFilter,
    workspacePath,
    selectWorkspace,
    setQuery,
    refreshWorkspaceDetails,
    snapshot,
    openCreate,
    openImport,
  });
  var content: React.ReactNode[] = (
    [
      (<style key={"css"}>
        {CSS}
      </style>),
      (<div key={"head"} className={"dssm-head"}>
        <div className={"dssm-title-block"}>
          <div className={"dssm-title-row"}>
            <h2 className={"dssm-title"}>
              {t("title")}
            </h2>
          </div>
          <p className={"dssm-desc"}>
            {t("desc")}
          </p>
        </div>
      </div>),
      tabs,
    ] as React.ReactNode[]
  ).concat(
    scope === "trash" ? [] : skillControls,
    [
      result && modal !== "import"
        ? (<div
          key={"result"}
          className={"dssm-feedback" +
            (result.warning
              ? " dssm-warning"
              : result.ok
                ? ""
                : " dssm-error")}
        >
          {result.text}
        </div>)
        : null,
    ],
    (data.warnings || []).map(function (warning, index) {
      return (<div
        key={"warning-" + index}
        className={"dssm-feedback dssm-warning"}
        role={"alert"}
      >
        {translateError(t, warning)}
      </div>);
    }),
    [
      snapshot.error
        ? (<div key={"error"} className={"dssm-feedback dssm-error"}>
          {snapshot.error}
        </div>)
        : null,
      snapshot.loading && !snapshot.data
        ? (<div key={"loading"} className={"dssm-empty"}>
          {t("loading")}
        </div>)
        : scope === "trash"
          ? renderTrash()
          : renderList(),
    ],
  );
  content.push(...renderEditorDialogs({
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
  }));
  content.push(...renderSkillDialogs({
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
  }));
  content.push(...renderCategoryDialogs({
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
  }));
  return (<section className={"dssm-section"}>
    {content}
  </section>);
}

export { currentSessionId, SkillManagerSection };
