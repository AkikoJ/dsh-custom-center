import * as React from "react";
import type { Translate } from "./messages.js";
import type { ViewProps } from "./manager-types.js";
import type { RootView } from "../contracts.js";
import { rootDisplayName } from "./messages.js";
import { agentSkillRoots, countSkillStatuses, matchSkillQuery, scopeSkillRoots, skillStatus, visibleSkillRoots } from "./selectors.js";


export function useSkillFilters(
  t: Translate,
  { scope, savedFilters, setSavedFilters }: Pick<ViewProps, "scope" | "savedFilters" | "setSavedFilters">,
  allRoots: RootView[],
  selectedDetail: { roots: RootView[] } | undefined,
) {
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
  return {
    filterKey,
    filters,
    query,
    source,
    roots,
    activeSource,
    options,
    rows,
    filteredRows,
    summary,
    updateFilter,
    setQuery,
    setSource,
  };
}
export type SkillFilters = ReturnType<typeof useSkillFilters>;
