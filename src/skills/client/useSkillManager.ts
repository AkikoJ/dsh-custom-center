import * as React from "react";
import type { ConfirmModal } from "../client-types.js";
import { type ApiRoutes, type Detail, type ManagerSnapshot, type ModalState, type ResultMessage, type ViewProps } from "../client-types.js";
import { type DestinationValue, defaultDestination, destinationPayload, destinationReady } from "../destination-picker.js";
import { type RootView, type SkillView } from "../types.js";
import { MUTATION_HEADERS, createSessionApi } from "./api-client.js";
import { resolveT, rootDisplayName, summarizeImportResult, summarizeSyncResult, translateError } from "./messages.js";
import { agentSkillRoots, countSkillStatuses, matchSkillQuery, scopeSkillRoots, skillStatus, visibleSkillRoots } from "./selectors.js";
import { UploadFile, UploadSelection, buildUploadPayload, inspectUploadSelection } from "./uploads.js";
import { useWorkspaceCatalog } from "./useWorkspaceCatalog.js";

export function useSkillManager(props: ViewProps) {
  var t = resolveT(props && props.t);

  var sessionApi = createSessionApi(props.sessionId);

  var ss = React.useState<{
    loading: boolean;
    error: string | null;
    data: ManagerSnapshot | null;
  }>({ loading: true, error: null, data: null }),
    snapshot = ss[0],
    setSnapshot = ss[1];

  var bs = React.useState(false),
    busy = bs[0],
    setBusy = bs[1];

  var scope = props.scope,
    setScope = props.setScope;

  var expanded = props.expanded,
    setExpanded = props.setExpanded,
    savedFilters = props.savedFilters,
    setSavedFilters = props.setSavedFilters;

  var ms = React.useState<ModalState>(null),
    modal = ms[0],
    setModal = ms[1];

  var asState = React.useState(""),
    addSearch = asState[0],
    setAddSearch = asState[1];

  var aselState = React.useState<Record<string, boolean>>({}),
    addSelection = aselState[0],
    setAddSelection = aselState[1];

  var rs = React.useState<ResultMessage | null>(null),
    result = rs[0] && rs[0].scope === scope ? rs[0] : null;

  function setResult(value: ResultMessage | null) {
    rs[1](value ? Object.assign({}, value, { scope: scope }) : null);
  }

  var fms = React.useState<Record<string, string>>({
    root: "dsh",
    name: "",
    description: "",
    body: "",
  }),
    form = fms[0],
    setForm = fms[1];

  var cns = React.useState(""),
    categoryName = cns[0],
    setCategoryName = cns[1];

  var sos = React.useState(false),
    syncOverwrite = sos[0],
    setSyncOverwrite = sos[1];

  var cds = React.useState<DestinationValue>(defaultDestination()),
    createDestination = cds[0],
    setCreateDestination = cds[1];

  var ids = React.useState<DestinationValue>(defaultDestination()),
    importDestination = ids[0],
    setImportDestination = ids[1];

  var {
    workspaceRows,
    selectedWorkspace,
    workspaceList,
    workspaceDetails,
    workspacePath,
    selectWorkspace,
    loadWorkspaces,
    loadWorkspaceDetail,
    refreshWorkspaceDetails,
  } = useWorkspaceCatalog(t, scope);

  var us = React.useState<UploadSelection | null>(null),
    upload = us[0],
    setUpload = us[1];

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

  var inflightRef = React.useRef(false);

  var draggingRef = React.useRef<{
    root: string;
    name: string;
    currentCategoryId: string;
  } | null>(null);

  var importInputRef = React.useRef<HTMLInputElement>(null);

  var folderInputRef = React.useRef<HTMLInputElement>(null);

  var pickerOpenRef = React.useRef(false);

  function refresh(silent: boolean) {
    if (!silent)
      setSnapshot({ loading: true, error: null, data: snapshot.data });
    return sessionApi("/state")
      .then(function (data) {
        setSnapshot({ loading: false, error: null, data: data });
        return data;
      })
      .catch(function (error) {
        setSnapshot({
          loading: false,
          error: translateError(t, error),
          data: snapshot.data,
        });
      });
  }

  React.useEffect(function () {
    refresh(false);
  }, []);

  function post<K extends keyof ApiRoutes>(
    path: K,
    body: unknown,
    successKey?: string | null,
    successParams?: object,
  ): Promise<ApiRoutes[K]> {
    if (inflightRef.current)
      return Promise.reject({ error: "operation already in progress" });
    inflightRef.current = true;
    setBusy(true);
    setResult(null);
    return sessionApi(path, {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify(body || {}),
    })
      .then(function (data) {
        setResult({
          ok: true,
          text: successKey
            ? t(successKey, successParams || data || {})
            : t("result.updated"),
        });
        var scopedWorkspace =
          body &&
            typeof (body as { workspace?: unknown; }).workspace === "string"
            ? (body as { workspace: string; }).workspace
            : "";
        return Promise.all([
          refresh(true),
          scopedWorkspace ? loadWorkspaceDetail(scopedWorkspace) : null,
        ]).then(function () {
          return data;
        });
      })
      .catch(function (error) {
        setResult({
          ok: false,
          text: t("error.action", { error: translateError(t, error) }),
        });
        throw error;
      })
      .finally(function () {
        inflightRef.current = false;
        setBusy(false);
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

  var data = snapshot.data || {
    roots: [],
    writeDestinations: [],
    projects: [],
    trash: [],
    warnings: [],
  },
    allRoots = data.roots || [];

  var filterKey =
    scope === "project" ? "project" : scope === "agents" ? "agents" : "user",
    filters = savedFilters[filterKey] || { query: "", source: "", status: "" },
    query = filters.query,
    source = filters.source;

  function updateFilter(key: string, value: string) {
    setSavedFilters(function (previous) {
      return Object.assign({}, previous, {
        [filterKey]: Object.assign({}, filters, { [key]: value }),
      });
    });
  }

  function setQuery(value: string) {
    updateFilter("query", value);
  }

  function setSource(value: string) {
    updateFilter("source", value);
  }

  var selectedDetail = workspaceDetails[selectedWorkspace];

  var roots =
    scope === "trash"
      ? []
      : scope === "project"
        ? visibleSkillRoots(selectedDetail?.roots || [])
        : scope === "agents"
          ? agentSkillRoots(allRoots)
          : scopeSkillRoots(allRoots);

  var filteredOptionsRoots = roots.filter(function (r) {
    return (r.skills || []).length > 0;
  });

  var activeSource =
    scope !== "project" &&
      filteredOptionsRoots.some(function (root) {
        return root.key === source;
      })
      ? source
      : "";

  function openCreate() {
    setForm(Object.assign({}, form, { root: "dsh" }));
    setCreateDestination(defaultDestination());
    setModal("create");
    loadWorkspaces();
  }

  function openImport() {
    setResult(null);
    setUpload(null);
    setImportDestination(defaultDestination());
    setModal("import");
    loadWorkspaces();
  }

  var userDestinations = (data.writeDestinations || []).filter(function (item) {
    return item.key === "dsh" || item.key === "agents";
  });

  var options = (
    [
      {
        value: "",
        label: t("filter.all") as React.ReactNode,
      },
    ] as { value: string; label: React.ReactNode; }[]
  ).concat(
    filteredOptionsRoots.map(function (root) {
      return {
        value: root.key,
        label: t("filter.option", {
          name: rootDisplayName(t, root),
          count: root.skills.length,
        }),
      };
    }),
  );

  function openSync(
    target: {
      root: string;
      label: string;
      names?: string[];
      all?: boolean;
      workspace?: string;
    },
    overwrite: boolean,
  ) {
    setSyncOverwrite(overwrite);
    setResult(null);
    setModal(Object.assign({ type: "sync-confirm" as const }, target));
  }

  function submitSync(syncModal: Extract<ConfirmModal, { type: "sync-confirm"; }>) {
    var body: Record<string, unknown> = {
      root: syncModal.root,
      overwrite: syncOverwrite,
    };
    if (syncModal.all) body.all = true;
    else body.names = syncModal.names;
    if (syncModal.workspace) body.workspace = syncModal.workspace;
    post("/sync", body, null)
      .then(function (data) {
        var summary = summarizeSyncResult(t, data);
        setResult({
          ok: summary.ok,
          warning: summary.warning,
          text: summary.text,
        });
        setModal(null);
      })
      .catch(function () { });
  }

  var rows = roots.flatMap(function (root) {
    return (root.skills || []).map(function (skill) {
      return { root: root, skill: skill };
    });
  });

  var filteredRows = rows.filter(function (row) {
    return (
      (!activeSource || row.root.key === activeSource) &&
      (!filters.status || skillStatus(row.skill) === filters.status) &&
      matchSkillQuery(
        Object.assign({}, row.skill, {
          rootLabel: rootDisplayName(t, row.root),
        }),
        query,
      )
    );
  });

  var summary = countSkillStatuses(rows);
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

  function openFolder(root: RootView, skill: SkillView, workspacePath?: string) {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    sessionApi("/open-folder", {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify(
        workspacePath ? { root: root.key, name: skill.name, workspace: workspacePath } : { root: root.key, name: skill.name },
      ),
    })
      .then(function () {
        setResult({
          ok: true,
          text: t("result.folder.opened"),
        });
      })
      .catch(function (error) {
        setResult({
          ok: false,
          text: t("error.action", { error: translateError(t, error) }),
        });
      })
      .finally(function () {
        inflightRef.current = false;
        setBusy(false);
      });
  }

  return {
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
  };
}
