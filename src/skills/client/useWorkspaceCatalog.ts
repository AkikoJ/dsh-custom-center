import * as React from "react";
import type { ApiRoutes } from "../contracts.js";
import type { Translate } from "./messages.js";
import type { RootView } from "../contracts.js";
import { callApi, MUTATION_HEADERS } from "./api-client.js";
import { translateError } from "./messages.js";

export function useWorkspaceCatalog(t: Translate, scope: string) {
  var wss = React.useState<ApiRoutes["/workspaces"]["items"]>([]),
    workspaceRows = wss[0],
    setWorkspaceRows = wss[1];

  var wps = React.useState(""),
    selectedWorkspace = wps[0],
    setSelectedWorkspace = wps[1];

  var selectedWorkspaceRef = React.useRef("");

  var workspaceListRequest = React.useRef(0);

  var wls = React.useState<{ loading: boolean; error: string | null; }>({
    loading: false,
    error: null,
  }),
    workspaceList = wls[0],
    setWorkspaceList = wls[1];

  var wds = React.useState<
    Record<
      string,
      { loading: boolean; error: string | null; roots: RootView[]; }
    >
  >({}),
    workspaceDetails = wds[0],
    setWorkspaceDetails = wds[1];

  var workspaceRequests = React.useRef<Record<string, number>>({});

  var workspaceEpoch = React.useRef(0);

  React.useEffect(function () {
    return function () {
      workspaceEpoch.current++;
    };
  }, []);

  function workspacePath(row: ApiRoutes["/workspaces"]["items"][number]) {
    return row.registeredPaths[0] || "";
  }

  function selectWorkspace(path: string) {
    if (
      !workspaceRows.some(function (row) {
        return row.available && workspacePath(row) === path;
      })
    )
      return;
    selectedWorkspaceRef.current = path;
    setSelectedWorkspace(path);
    if (!workspaceDetails[path]) loadWorkspaceDetail(path);
  }

  function loadWorkspaces(
    readSelected = scope === "project",
    forceDetail = false,
  ) {
    var epoch = workspaceEpoch.current,
      request = ++workspaceListRequest.current;
    var current = function () {
      return (
        epoch === workspaceEpoch.current &&
        request === workspaceListRequest.current
      );
    };
    setWorkspaceList({ loading: true, error: null });
    return callApi("/workspaces")
      .then(function (listed) {
        if (!current()) return [];
        var items = listed.items || [];
        setWorkspaceRows(items);
        setWorkspaceList({ loading: false, error: null });
        var selected =
          items.find(function (row) {
            return (
              row.available &&
              workspacePath(row) === selectedWorkspaceRef.current
            );
          }) ||
          items.find(function (row) {
            return row.available && workspacePath(row);
          });
        var path = selected ? workspacePath(selected) : "";
        selectedWorkspaceRef.current = path;
        setSelectedWorkspace(path);
        if (readSelected && path && (forceDetail || !workspaceDetails[path]))
          loadWorkspaceDetail(path);
        return items;
      })
      .catch(function (error) {
        if (!current()) return [];
        setWorkspaceRows([]);
        selectedWorkspaceRef.current = "";
        setSelectedWorkspace("");
        setWorkspaceList({ loading: false, error: translateError(t, error) });
        return [];
      });
  }

  function loadWorkspaceDetail(path: string) {
    var epoch = workspaceEpoch.current,
      request = (workspaceRequests.current[path] || 0) + 1;
    workspaceRequests.current[path] = request;
    var current = function () {
      return (
        epoch === workspaceEpoch.current &&
        request === workspaceRequests.current[path]
      );
    };
    setWorkspaceDetails(function (previous) {
      return Object.assign({}, previous, {
        [path]: {
          loading: true,
          error: null,
          roots: previous[path] ? previous[path].roots : [],
        },
      });
    });
    return callApi("/workspace-skills", {
      method: "POST",
      headers: MUTATION_HEADERS,
      body: JSON.stringify({ workspace: path }),
    })
      .then(function (detail) {
        if (current())
          setWorkspaceDetails(function (previous) {
            return Object.assign({}, previous, {
              [path]: {
                loading: false,
                error: null,
                roots: detail.roots || [],
              },
            });
          });
      })
      .catch(function (error) {
        if (current())
          setWorkspaceDetails(function (previous) {
            return Object.assign({}, previous, {
              [path]: {
                loading: false,
                error: translateError(t, error),
                roots: [],
              },
            });
          });
      });
  }

  function refreshWorkspaceDetails() {
    workspaceEpoch.current++;
    setWorkspaceDetails({});
    return loadWorkspaces(true, true);
  }
  return {
    workspaceRows,
    selectedWorkspace,
    workspaceList,
    workspaceDetails,
    workspacePath,
    selectWorkspace,
    loadWorkspaces,
    loadWorkspaceDetail,
    refreshWorkspaceDetails,
  };
}
