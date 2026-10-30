import * as React from "react";
import type { ApiCall, ManagerSnapshot } from "../contracts.js";
import type { Translate } from "./messages.js";
import { translateError } from "./messages.js";
import { useWorkspaceCatalog } from "./useWorkspaceCatalog.js";


export function useSkillCatalog(t: Translate, sessionApi: ApiCall, scope: string) {
  var ss = React.useState<{
    loading: boolean;
    error: string | null;
    data: ManagerSnapshot | null;
  }>({ loading: true, error: null, data: null }),
    snapshot = ss[0],
    setSnapshot = ss[1];

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
  const workspaces = useWorkspaceCatalog(t, scope);
  React.useEffect(function () { refresh(false); }, []);
  var data = snapshot.data || {
    roots: [],
    writeDestinations: [],
    projects: [],
    trash: [],
    warnings: [],
  },
    allRoots = data.roots || [];

  var userDestinations = (data.writeDestinations || []).filter(function (item) {
    return item.key === "dsh" || item.key === "agents";
  });
  return { snapshot, refresh, data, allRoots, userDestinations, workspaces };
}
export type SkillCatalog = ReturnType<typeof useSkillCatalog>;
