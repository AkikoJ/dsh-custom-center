import { SegmentedTabs } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type ApiRoutes, type ManagerSnapshot } from "../contracts.js";
import { type Filters, type ConfirmModal, type Post, type TrashItem } from "./manager-types.js";
import { type Translate } from "./messages.js";
import type { WorkspaceRow } from "../contracts.js";
import { type RootView, type SkillView } from "../contracts.js";
import { filterActionButton, iconButton, Input, SourceSelect } from "./controls.js";
import { strokeIcon } from "./icons.js";
import { countKey, formatTrashTime, translateOrFallback } from "./messages.js";

interface createScopePanelsProps {
  workspaceRows: WorkspaceRow[];
  t: Translate;
  scope: string;
  selectedWorkspace: string;
  roots: RootView[];
  renderRoot: (root: RootView, workspacePath?: string, rowsForRoot?: { root: RootView; skill: SkillView; }[], keyPrefix?: string) => React.JSX.Element | null;
  query: string;
  filters: Filters;
  workspaceList: { loading: boolean; error: string | null; };
  selectedDetail: { loading: boolean; error: string | null; roots: RootView[]; };
  rows: { root: RootView; skill: SkillView; }[];
  data: Omit<ManagerSnapshot, "summary"> & { summary?: ManagerSnapshot["summary"]; };
  post: Post;
  busy: boolean;
  confirmDelete: (target: Extract<ConfirmModal, { type: "delete-confirm" }>) => void;
  setScope: React.Dispatch<React.SetStateAction<string>>;
  loadWorkspaces: (readSelected?: boolean, forceDetail?: boolean) => Promise<never[] | WorkspaceRow[]>;
  refresh: (silent: boolean) => Promise<void | ManagerSnapshot>;
  summary: Record<string, number>;
  activeSource: string;
  options: { value: string; label: React.ReactNode; }[];
  setSource: (value: string) => void;
  updateFilter: (key: string, value: string) => void;
  workspacePath: (row: ApiRoutes["/workspaces"]["items"][number]) => string;
  selectWorkspace: (path: string) => void;
  setQuery: (value: string) => void;
  refreshWorkspaceDetails: () => Promise<never[] | WorkspaceRow[]>;
  snapshot: { loading: boolean; error: string | null; data: ManagerSnapshot | null; };
  openCreate: () => void;
  openImport: () => void;
}

export function createScopePanels({
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
  confirmDelete,
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
}: createScopePanelsProps) {
  function trashRestoreBody(item: TrashItem) {
    var projectRoot =
      item.root && item.root.scope === "project" ? item.root.projectRoot : "";
    var row = projectRoot
      ? workspaceRows.find(function (candidate) {
        return candidate.projectRoot === projectRoot && candidate.available;
      })
      : undefined;
    return row
      ? { id: item.id, workspace: row.registeredPaths[0] || row.path }
      : { id: item.id };
  }

  function trashRootLabel(item: TrashItem) {
    return item.root && item.root.scope === "project"
      ? t("root.projectDsh") +
      " · " +
      (item.root.projectName || item.root.projectRoot)
      : translateOrFallback(
        t,
        "root." + (item.root?.localeKey || item.root?.key || "dsh"),
        item.root?.label || t("root.dsh"),
      );
  }

  function renderList() {
    var project = scope === "project",
      path = project ? selectedWorkspace : undefined;
    var groups = roots
      .map(function (root) {
        return renderRoot(root, path, undefined, path ? path + "|" : undefined);
      })
      .filter(Boolean);
    var body: React.ReactNode = groups.length
      ? groups
      : (<div className={"dssm-empty"}>
        {query || filters.status
          ? t("empty.search")
          : t(scope === "agents" ? "agents.empty" : "empty.source")}
      </div>);
    if (project) {
      if (workspaceList.error)
        body = (<div className={"dssm-feedback dssm-error"} role={"alert"}>
          {t("workspace.listFailed", { error: workspaceList.error })}
        </div>);
      else if (
        workspaceList.loading ||
        (selectedWorkspace && (!selectedDetail || selectedDetail.loading))
      )
        body = (<div className={"dssm-empty"}>
          {t("workspace.loading")}
        </div>);
      else if (!selectedWorkspace)
        body = (<div className={"dssm-empty"}>
          {t(workspaceRows.length ? "workspace.unavailable" : "project.empty")}
        </div>);
      else if (selectedDetail?.error)
        body = (<div className={"dssm-feedback dssm-error"} role={"alert"}>
          {t("workspace.loadFailed", { error: selectedDetail.error })}
        </div>);
      else if (!rows.length && !query && !filters.status)
        body = (<div className={"dssm-empty"}>
          {t("workspace.noSkills")}
        </div>);
    }
    return (<div
      key={"sources"}
      id={"dssm-scope-panel"}
      role={"tabpanel"}
      aria-labelledby={"dssm-tab-" + scope}
      className={"dssm-sources"}
    >
      {scope === "agents"
        ? (<p className={"dssm-note"}>
          {t("agents.note")}
        </p>)
        : null}
      {body}
    </div>);
  }

  function renderTrash() {
    return (<div
      key={"trash"}
      id={"dssm-scope-panel"}
      role={"tabpanel"}
      aria-labelledby={"dssm-tab-trash"}
      className={"dssm-trash-panel"}
    >
      {data.trash.length
        ? data.trash.map(function (item) {
          return (<div
            key={item.id}
            className={"dssm-trash-item"}
            role={"group"}
            aria-label={item.name}
          >
            <div className={"dssm-trash-main"}>
              <div className={"dssm-name"}>
                {item.name}
              </div>
              <div className={"dssm-trash-meta"}>
                <time dateTime={item.deletedAt}>
                  {t("trash.deletedAt", {
                    time: formatTrashTime(t, item.deletedAt),
                  })}
                </time>
                <span className={"dssm-trash-source"}>
                  {t("trash.source", { source: trashRootLabel(item) })}
                </span>
              </div>
            </div>
            <div className={"dssm-trash-actions"}>
              {iconButton(
                t("btn.restore"),
                strokeIcon("M3.5 6.5A4.5 4.5 0 1 1 5 11.5M3.5 3.5v3h3"),
                function () {
                  post(
                    "/trash-restore",
                    trashRestoreBody(item),
                    "result.restored",
                    { name: item.name },
                  ).catch(function () { });
                },
                false,
                busy,
              )}
              {iconButton(
                t("btn.delete.forever"),
                strokeIcon(
                  "M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.7 8.5h4.6L11 4.5",
                ),
                function () {
                  confirmDelete({
                    type: "delete-confirm",
                    id: item.id,
                    name: item.name,
                  });
                },
                true,
                busy,
              )}
            </div>
          </div>);
        })
        : (<div className={"dssm-empty"}>
          {t("trash.empty")}
        </div>)}
    </div>);
  }

  function getTabIcon(tabVal: string) {
    if (tabVal === "agents")
      return (<svg
        viewBox={"0 0 16 16"}
        width={14}
        height={14}
        fill={"none"}
        stroke={"currentColor"}
        strokeWidth={1.5}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
        aria-hidden={true}
      >
        <path d={"M2.5 4.5h8M8 2l2.5 2.5L8 7M13.5 11.5h-8M8 9l-2.5 2.5L8 14"} />
      </svg>);
    var d =
      tabVal === "user"
        ? "M8 0a8 8 0 100 16A8 8 0 008 0zm6.5 8a6.5 6.5 0 01-.65 2.82L10.3 8.35a.75.75 0 00-1.06 0L8.2 9.4V6.5a.75.75 0 00-.75-.75h-1V4.25a.75.75 0 00-.75-.75h-1a6.47 6.47 0 013.3-1.95v1.2a.75.75 0 00.75.75h1.5a.75.75 0 00.75-.75V2.3A6.52 6.52 0 0114.5 8z"
        : tabVal === "project"
          ? "M1.75 2.5h3.44l1.5 1.5h7.56c.966 0 1.75.784 1.75 1.75v7.5a1.75 1.75 0 01-1.75 1.75H1.75A1.75 1.75 0 010 13.25V4.25C0 3.284.784 2.5 1.75 2.5z"
          : "M5.5 1.25h5c.4 0 .75.35.75.7V3h2.5c.5 0 .9.4.9.9s-.4.9-.9.9h-.35l-.65 8.1a1.6 1.6 0 0 1-1.6 1.5H4.85a1.6 1.6 0 0 1-1.6-1.5L2.6 4.8H2.25c-.5 0-.9-.4-.9-.9s.4-.9.9-.9H4.75V1.95c0-.4.35-.7.75-.7z";
    return (<svg
      viewBox={"0 0 16 16"}
      width={14}
      height={14}
      fill={"currentColor"}
      aria-hidden={true}
    >
      <path d={d} />
    </svg>);
  }

  var tabItems = ["user", "project", "agents", "trash"].map(function (value) {
    var text = t("scope." + value);
    var count = value === "trash" ? (data.trash || []).length : 0;
    var icon = getTabIcon(value);
    return {
      value: value,
      id: "dssm-tab-" + value,
      panelId: "dssm-scope-panel",
      label:
        count > 0
          ? [icon, text, (<span className={"dssm-trash-count"}>
            {count}
          </span>)]
          : [icon, text],
    };
  });

  var tabs = (<SegmentedTabs
    key={"tabs"}
    className={"dssm-scope-tabs"}
    label={t("scope.label")}
    value={scope}
    onChange={function (next: string) {
      setScope(next);
      if (next === "project" || next === "trash")
        loadWorkspaces(next === "project");
      if (next === "trash") refresh(true);
    }}
    items={tabItems}
  />);

  var skillControls = [
    scope === "project"
      ? null
      : (<div key={"summary"} className={"dssm-summary"}>
        {(scope === "agents"
          ? [
            ["total", "summary.total"],
            ["unsynced", "summary.unsynced"],
            ["synced", "summary.synced"],
            ["outdated", "summary.outdated"],
          ]
          : [
            ["total", "summary.total"],
            ["enabled", "summary.enabled"],
            ["disabled", "summary.disabled"],
            ["invalid", "summary.invalid"],
          ]
        ).map(function (item) {
          return (<div key={item[1]} className={"dssm-stat"}>
            <strong>
              {summary[item[0]]}
            </strong>
            {t(countKey(item[1], summary[item[0]]), {
              count: summary[item[0]],
            }).replace(String(summary[item[0]]), "")}
          </div>);
        })}
      </div>),
    (<div key={"filters"} className={"dssm-filters"}>
      {scope === "project"
        ? null
        : (<div className={"dssm-source-filter"}>
          <SourceSelect
            value={activeSource}
            label={t("filter.source")}
            options={options}
            onChange={setSource}
          />
        </div>)}
      <div className={"dssm-status-filter"}>
        <SourceSelect
          value={filters.status}
          label={t("filter.status")}
          options={[{ value: "", label: t("filter.statusAll") }].concat(
            (scope === "agents"
              ? ["unsynced", "synced", "outdated", "exists"]
              : ["enabled", "disabled", "shadowed", "invalid"]
            ).map(function (value) {
              return { value: value, label: t("status." + value) };
            }),
          )}
          onChange={function (value) {
            updateFilter("status", value);
          }}
        />
      </div>
      {scope === "project"
        ? (<div className={"dssm-project-filter"}>
          <SourceSelect
            value={selectedWorkspace}
            label={t("filter.workspace")}
            disabled={workspaceList.loading || !workspaceRows.length}
            options={workspaceRows.map(function (row) {
              return {
                value: workspacePath(row),
                label:
                  row.name +
                  (!row.available ? " · " + t("workspace.unavailable") : "") +
                  (workspaceRows.filter(function (other) {
                    return other.name === row.name;
                  }).length > 1
                    ? " · " + workspacePath(row)
                    : ""),
                disabled: !row.available || !workspacePath(row),
              };
            })}
            onChange={selectWorkspace}
          />
        </div>)
        : null}
      <Input
        className={"dssm-search"}
        allowClear={true}
        value={query}
        aria-label={t("search")}
        placeholder={t("search.placeholder")}
        onChange={function (e) {
          setQuery(e.target.value);
        }}
      />
      {scope !== "trash"
        ? (<div className={"dssm-filter-actions"}>
          {filterActionButton(
            t("btn.refresh"),
            strokeIcon(
              "M13.5 8A5.5 5.5 0 118 2.5c2.3 0 4.3 1.4 5.1 3.5m.4-3.5v3.5H10",
            ),
            function () {
              refresh(false);
              if (scope === "project") refreshWorkspaceDetails();
            },
            busy || snapshot.loading,
          )}
          {scope === "agents"
            ? null
            : filterActionButton(
              t("btn.create"),
              strokeIcon("M8 2.5v11M2.5 8h11"),
              openCreate,
              busy,
              t("btn.create") + "…",
            )}
          {scope === "agents"
            ? null
            : filterActionButton(
              t("import.global"),
              strokeIcon(
                "M2.5 10.5v2a1 1 0 001 1h9a1 1 0 001-1v-2M8 2.5v7M5 5.5l3-3 3 3",
              ),
              openImport,
              busy,
            )}
        </div>)
        : null}
    </div>),
  ];
  return { renderList, renderTrash, tabs, skillControls };
}
