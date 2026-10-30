import * as React from "react";
import { type ModalState, type Filters, type SectionProps, type SessionSnapshot, type ViewProps } from "./manager-types.js";
import { renderCategoryDialogs } from "./category-dialogs.js";
import { renderCreateDialog } from "./create-dialog.js";
import { renderImportDialog } from "./import-dialog.js";
import { resolveT, translateError } from "./messages.js";
import { createScopePanels } from "./scope-panels.js";
import { renderDetailDialog } from "./detail-dialog.js";
import { renderSyncDialog } from "./sync-dialog.js";
import { renderDeleteDialogs } from "./delete-dialogs.js";
import { createSkillRows } from "./skill-rows.js";
import { createSourceTree } from "./source-tree.js";
import { CSS } from "./styles.js";
import { createSessionApi } from "./api-client.js";
import { useSkillCatalog } from "./useSkillCatalog.js";
import { useSkillCommands } from "./useSkillCommands.js";
import { useSkillFilters } from "./useSkillFilters.js";
import { useSkillCreate } from "./useSkillCreate.js";
import { useSkillImport } from "./useSkillImport.js";
import { useSkillDetail } from "./useSkillDetail.js";
import { useSkillSync } from "./useSkillSync.js";
import { useSkillCategories } from "./useSkillCategories.js";

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
  const t = resolveT(props && props.t);
  const { scope, setScope, expanded, setExpanded } = props;
  const [modal, setModal] = React.useState<ModalState>(null);
  const sessionApi = createSessionApi(props.sessionId);
  const catalog = useSkillCatalog(t, sessionApi, scope);
  const workspaces = catalog.workspaces;
  const selectedDetail = workspaces.workspaceDetails[workspaces.selectedWorkspace];
  const commands = useSkillCommands(t, scope, sessionApi, catalog.refresh, workspaces.loadWorkspaceDetail);
  const filtersView = useSkillFilters(t, props, catalog.allRoots, selectedDetail);
  const destinations = { workspaceRows: workspaces.workspaceRows, userDestinations: catalog.userDestinations };
  const create = useSkillCreate(t, commands.post, setModal, commands.setResult, workspaces.loadWorkspaces, destinations);
  const importing = useSkillImport(t, commands.busy, commands.post, setModal, commands.setResult, workspaces.loadWorkspaces, destinations);
  const detailFlow = useSkillDetail(t, sessionApi, setModal, commands.setResult, commands.setBusy);
  const sync = useSkillSync(t, commands.post, setModal, commands.setResult);
  const categories = useSkillCategories(t, sessionApi, setModal, commands, catalog.refresh, workspaces.loadWorkspaceDetail);
  var { renderSkill, clearDragHighlights } = createSkillRows({
    t,
    allRoots: catalog.allRoots,
    openSync: sync.openSync,
    busy: commands.busy,
    openDetail: detailFlow.openDetail,
    openFolder: commands.openFolder,
    post: commands.post,
    confirmTrash: setModal,
    draggingRef: categories.draggingRef,
  });
  var { renderRoot } = createSourceTree({
    busy: commands.busy,
    openSync: sync.openSync,
    t,
    categories,
    post: commands.post,
    expanded,
    query: filtersView.query,
    filters: filtersView.filters,
    draggingRef: categories.draggingRef,
    clearDragHighlights,
    setExpanded,
    renderSkill,
    rows: filtersView.rows,
    filteredRows: filtersView.filteredRows,
    activeSource: filtersView.activeSource,
    filterKey: filtersView.filterKey,
  });
  var { renderList, renderTrash, tabs, skillControls } = createScopePanels({
    workspaceRows: workspaces.workspaceRows,
    t,
    scope,
    selectedWorkspace: workspaces.selectedWorkspace,
    roots: filtersView.roots,
    renderRoot,
    query: filtersView.query,
    filters: filtersView.filters,
    workspaceList: workspaces.workspaceList,
    selectedDetail,
    rows: filtersView.rows,
    data: catalog.data,
    post: commands.post,
    busy: commands.busy,
    confirmDelete: setModal,
    setScope,
    loadWorkspaces: workspaces.loadWorkspaces,
    refresh: catalog.refresh,
    summary: filtersView.summary,
    activeSource: filtersView.activeSource,
    options: filtersView.options,
    setSource: filtersView.setSource,
    updateFilter: filtersView.updateFilter,
    workspacePath: workspaces.workspacePath,
    selectWorkspace: workspaces.selectWorkspace,
    setQuery: filtersView.setQuery,
    refreshWorkspaceDetails: workspaces.refreshWorkspaceDetails,
    snapshot: catalog.snapshot,
    openCreate: create.openCreate,
    openImport: importing.openImport,
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
      commands.result && modal !== "import"
        ? (<div
          key={"result"}
          className={"dssm-feedback" +
            (commands.result.warning
              ? " dssm-warning"
              : commands.result.ok
                ? ""
                : " dssm-error")}
        >
          {commands.result.text}
        </div>)
        : null,
    ],
    (catalog.data.warnings || []).map(function (warning, index) {
      return (<div
        key={"warning-" + index}
        className={"dssm-feedback dssm-warning"}
        role={"alert"}
      >
        {translateError(t, warning)}
      </div>);
    }),
    [
      catalog.snapshot.error
        ? (<div key={"error"} className={"dssm-feedback dssm-error"}>
          {catalog.snapshot.error}
        </div>)
        : null,
      catalog.snapshot.loading && !catalog.snapshot.data
        ? (<div key={"loading"} className={"dssm-empty"}>
          {t("loading")}
        </div>)
        : scope === "trash"
          ? renderTrash()
          : renderList(),
    ],
  );
  content.push(...renderCreateDialog({
    create,
    modal,
    t,
    setModal,
    busy: commands.busy,
    workspaceRows: workspaces.workspaceRows,
    userDestinations: catalog.userDestinations,
  }), ...renderImportDialog({
    importing,
    modal,
    t,
    setModal,
    busy: commands.busy,
    workspaceRows: workspaces.workspaceRows,
    userDestinations: catalog.userDestinations,
    setResult: commands.setResult,
    result: commands.result,
  }));
  content.push(...renderDetailDialog({
    detailFlow,
    modal,
    t,
    setModal,
  }), ...renderSyncDialog({
    sync,
    modal,
    t,
    setModal,
    busy: commands.busy,
  }), ...renderDeleteDialogs({
    modal,
    t,
    setModal,
    post: commands.post,
    busy: commands.busy
  }));
  content.push(...renderCategoryDialogs({
    modal,
    categories,
    busy: commands.busy,
    setModal,
    t,
  }));
  return (<section className={"dssm-section"}>
    {content}
  </section>);
}

export { currentSessionId, SkillManagerSection };
