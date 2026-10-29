import { Button as PrimitiveButton } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type Filters, type ModalState, type Post, type Translate } from "../client-types.js";
import { type RootView, type SkillView } from "../types.js";
import { enableSwitch, foldChevron, iconButton, SkillSwitch } from "./controls.js";
import { getRootBrandIcon, strokeIcon } from "./icons.js";
import { countKey, rootDisplayName } from "./messages.js";
import { canToggleSource, isSkillEnabled } from "./selectors.js";

interface createSourceTreeProps {
  busy: boolean;
  openSync: (target: { root: string; label: string; names?: string[]; all?: boolean; workspace?: string; }, overwrite: boolean) => void;
  t: Translate;
  setCategoryName: React.Dispatch<React.SetStateAction<string>>;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
  post: Post;
  expanded: Record<string, boolean>;
  query: string;
  filters: Filters;
  draggingRef: React.MutableRefObject<{ root: string; name: string; currentCategoryId: string; } | null>;
  clearDragHighlights: (element: HTMLElement) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAddSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAddSearch: React.Dispatch<React.SetStateAction<string>>;
  renderSkill: (root: RootView, skill: SkillView, workspacePath?: string) => React.JSX.Element;
  rows: { root: RootView; skill: SkillView; }[];
  filteredRows: { root: RootView; skill: SkillView; }[];
  activeSource: string;
  filterKey: string;
}

export function createSourceTree({
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
}: createSourceTreeProps) {
  function renderRootIcon(key: string) {
    return (<span
      className={"dssm-brand-icon"}
      aria-hidden={true}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        flexShrink: 0,
      }}
    >
      {getRootBrandIcon(key)}
    </span>);
  }

  function sourceExtra(
    root: RootView,
    workspacePath: string | undefined,
    displayName: string,
  ) {
    var scoped = workspacePath
      ? { root: root.key, workspace: workspacePath }
      : { root: root.key };
    var actions: React.ReactNode[] = [];
    if (root.native === false) {
      var pending = (root.skills || []).filter(function (item) {
        return (
          item.sync &&
          (item.sync.status === "unsynced" || item.sync.status === "outdated")
        );
      }).length;
      actions.push(
        (<PrimitiveButton
          variant={"outline"}
          size={"sm"}
          disabled={busy || !pending}
          onClick={function () {
            openSync(
              {
                root: root.key,
                label: displayName,
                all: true,
                workspace: workspacePath,
              },
              false,
            );
          }}
        >
          {t("sync.all")}
        </PrimitiveButton>),
      );
      return (<span
        className={"dssm-source-actions"}
        onClick={function (event: React.MouseEvent) {
          event.stopPropagation();
        }}
      >
        {actions}
      </span>);
    }
    actions.push(
      iconButton(
        t("category.create"),
        strokeIcon("M8 2.5v11M2.5 8h11"),
        function () {
          setCategoryName("");
          setModal({
            type: "category-create",
            root: root.key,
            workspace: workspacePath,
          });
        },
        false,
        busy,
      ),
    );
    if (canToggleSource(root))
      actions.push(
        (<SkillSwitch
          on={root.enabled}
          disabled={busy}
          label={t("source.toggle") + " " + displayName}
          onClick={function () {
            post(root.enabled ? "/source-disable" : "/source-enable", scoped);
          }}
        />),
      );
    return (<span
      className={"dssm-source-actions"}
      onClick={function (event: React.MouseEvent) {
        event.stopPropagation();
      }}
    >
      {actions}
    </span>);
  }

  function AntdFolderClosed() {
    return (<svg
      viewBox={"0 0 1024 1024"}
      width={16}
      height={16}
      aria-hidden={true}
      focusable={"false"}
      style={{
        display: "inline-block",
        verticalAlign: "-2px",
        flexShrink: 0,
        marginRight: 6,
      }}
    >
      <path fill={"#f59e0b"} d={"M880 298.4H521L403.7 186.2a8.15 8.15 0 0 0-5.5-2.2H144c-17.7 0-32 14.3-32 32v592c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V330.4c0-17.7-14.3-32-32-32z"} />
    </svg>);
  }

  function AntdFolderOpen() {
    return (<svg
      viewBox={"0 0 1024 1024"}
      width={16}
      height={16}
      aria-hidden={true}
      focusable={"false"}
      style={{
        display: "inline-block",
        verticalAlign: "-2px",
        flexShrink: 0,
        marginRight: 6,
      }}
    >
      <path
        fill={"#fde68a"}
        opacity={0.85}
        d={"M159 768h612.3l103.4-256H262.3z"}
      />
      <path fill={"#f59e0b"} d={"M928 444H820V330.4c0-17.7-14.3-32-32-32H473L355.7 186.2a8.15 8.15 0 0 0-5.5-2.2H96c-17.7 0-32 14.3-32 32v592c0 17.7 14.3 32 32 32h698c13 0 24.8-7.9 29.7-20l134-332c1.5-3.8 2.3-7.9 2.3-12 0-17.7-14.3-32-32-32zM136 256h188.5l119.6 114.4H748V444H238c-13 0-24.8 7.9-29.7 20L136 643.2V256zm635.3 512H159l103.3-256h612.4L771.3 768z"} />
    </svg>);
  }

  function renderCategory(
    root: RootView,
    bucket: {
      id: string;
      name: string;
      locked: boolean;
      skills: { root: RootView; skill: SkillView; }[];
      scope?: { root: RootView; skill: SkillView; }[];
    },
    workspacePath?: string,
    keyPrefix?: string,
    allRootRows?: { root: RootView; skill: SkillView; }[],
  ) {
    var expansionKey = JSON.stringify([
      "category",
      keyPrefix || "",
      root.key,
      bucket.id || "none",
    ]);
    var open =
      expanded[expansionKey] === undefined
        ? !!(query || filters.status)
        : expanded[expansionKey];
    var counted = bucket.scope || bucket.skills;
    var usable = counted.filter(function (row) {
      return row.skill.loadable !== false;
    });
    var enabledCount = usable.filter(function (row) {
      return isSkillEnabled(row.skill);
    }).length;
    var allOn = usable.length > 0 && enabledCount === usable.length;
    var scoped = function (extra: Record<string, unknown>) {
      return workspacePath
        ? Object.assign({}, extra, { workspace: workspacePath })
        : extra;
    };
    return (<section
      key={root.key + ":" + (bucket.id || "none")}
      className={"dssm-cat"}
      aria-label={bucket.name}
      onDragOver={function (e: React.DragEvent) {
        e.preventDefault();
        if (
          draggingRef.current &&
          draggingRef.current.root === root.key &&
          draggingRef.current.currentCategoryId !== bucket.id
        ) {
          (e.currentTarget as HTMLElement).classList.add("drag-over");
        } else {
          (e.currentTarget as HTMLElement).classList.remove("drag-over");
        }
      }}
      onDragLeave={function (e: React.DragEvent) {
        var related = e.relatedTarget as Node | null;
        if (related && (e.currentTarget as HTMLElement).contains(related))
          return;
        (e.currentTarget as HTMLElement).classList.remove("drag-over");
      }}
      onDrop={function (e: React.DragEvent) {
        e.preventDefault();
        draggingRef.current = null;
        (e.currentTarget as HTMLElement).classList.remove("drag-over");
        clearDragHighlights(e.currentTarget as HTMLElement);
        try {
          var dragData = JSON.parse(
            e.dataTransfer.getData("text/plain") || "{}",
          );
          if (dragData && dragData.name && dragData.root === root.key) {
            if (dragData.currentCategoryId !== bucket.id) {
              post(
                "/category-assign",
                scoped({
                  root: root.key,
                  name: dragData.name,
                  category: bucket.id,
                }),
                "category.assigned",
                { name: dragData.name, category: bucket.name },
              );
            }
          }
        } catch (_err) {
          // 忽略非法的外部或非本插件拖拽载荷
        }
      }}
    >
      <div className={"dssm-cat-head"}>
        <button
          type={"button"}
          className={"dssm-cat-main"}
          aria-expanded={open}
          onClick={function () {
            setExpanded(function (previous) {
              var next: Record<string, boolean> = {};
              next[expansionKey] = !open;
              return Object.assign({}, previous, next);
            });
          }}
        >
          <span className={"dssm-cat-title"}>
            {open ? (<AntdFolderOpen />) : (<AntdFolderClosed />)}
            {bucket.name}
          </span>
          <span className={"dssm-count"}>
            {t("category.progress", {
              count: counted.length,
              enabled: enabledCount,
              usable: usable.length,
            })}
          </span>
        </button>
        <span
          className={"dssm-source-actions"}
          onClick={function (event: React.MouseEvent) {
            event.stopPropagation();
          }}
        >
          {bucket.locked
            ? null
            : iconButton(
              t("category.addSkills"),
              strokeIcon("M8 2.5v11M2.5 8h11"),
              function () {
                var catMap: Record<string, string> = {};
                (root.categories || []).forEach(function (c) {
                  catMap[c.id] = c.name;
                });
                var sourceList = allRootRows || bucket.scope || bucket.skills;
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
              },
              false,
              busy,
            )}
          {bucket.locked
            ? null
            : iconButton(
              t("category.rename"),
              strokeIcon("M9.2 2.8l4 4L6.2 13.8H2.2v-4z"),
              function () {
                setCategoryName(bucket.name);
                setModal({
                  type: "category-rename",
                  root: root.key,
                  id: bucket.id,
                  name: bucket.name,
                  workspace: workspacePath,
                });
              },
              false,
              busy,
            )}
          {bucket.locked
            ? null
            : iconButton(
              t("category.delete"),
              strokeIcon(
                "M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.7 8.5h4.6L11 4.5",
              ),
              function () {
                setModal({
                  type: "category-delete",
                  root: root.key,
                  id: bucket.id,
                  name: bucket.name,
                  workspace: workspacePath,
                });
              },
              true,
              busy,
            )}
          {enableSwitch(
            allOn,
            t("category.toggle") + " " + bucket.name,
            busy || root.enabled === false || usable.length === 0,
            function () {
              post(
                allOn ? "/category-disable" : "/category-enable",
                scoped({ root: root.key, category: bucket.id }),
              );
            },
          )}
        </span>
      </div>
      {open
        ? bucket.skills.length
          ? (<div className={"dssm-skill-list"}>
            {bucket.skills.map(function (row) {
              return renderSkill(root, row.skill, workspacePath);
            })}
          </div>)
          : (<div className={"dssm-empty"}>
            {t("category.empty")}
          </div>)
        : null}
    </section>);
  }

  function renderSourceBody(
    root: RootView,
    filtered: { root: RootView; skill: SkillView; }[],
    workspacePath?: string,
    keyPrefix?: string,
    scopeRows?: { root: RootView; skill: SkillView; }[],
  ) {
    var categories = root.native === false ? [] : root.categories || [];
    var orderRows = function (
      list: { root: RootView; skill: SkillView; }[],
      id: string,
    ) {
      var savedOrder = (root.categoryOrder && root.categoryOrder[id]) || [];
      var ranks: Record<string, number> = Object.create(null);
      savedOrder.forEach(function (name, index) {
        ranks[name] = index;
      });
      return list
        .map(function (row, index) {
          return { row: row, index: index, rank: ranks[row.skill.name] };
        })
        .sort(function (a, b) {
          if (a.rank !== undefined && b.rank !== undefined)
            return a.rank - b.rank;
          if (a.rank !== undefined) return -1;
          if (b.rank !== undefined) return 1;
          return a.index - b.index;
        })
        .map(function (item) {
          return item.row;
        });
    };
    if (!categories.length)
      return filtered.length
        ? (<div className={"dssm-skill-list"}>
          {orderRows(filtered, "").map(function (row) {
            return renderSkill(root, row.skill, workspacePath);
          })}
        </div>)
        : (<div className={"dssm-empty"}>
          {t("empty.source")}
        </div>);
    var known: Record<string, boolean> = {};
    var allRows = scopeRows || filtered;
    categories.forEach(function (item) {
      known[item.id] = true;
    });
    var inCategory = function (
      list: { root: RootView; skill: SkillView; }[],
      id: string,
    ) {
      return orderRows(
        list.filter(function (row) {
          return id
            ? row.skill.categoryId === id
            : !row.skill.categoryId || !known[row.skill.categoryId];
        }),
        id,
      );
    };
    var buckets = categories.map(function (item) {
      return {
        id: item.id,
        name: item.name,
        locked: false,
        skills: inCategory(filtered, item.id),
        scope: inCategory(allRows, item.id),
      };
    });
    buckets.push({
      id: "",
      name: t("category.uncategorized"),
      locked: true,
      skills: inCategory(filtered, ""),
      scope: inCategory(allRows, ""),
    });
    var searching = !!(query || filters.status);
    return (<div>
      <p className={"dssm-note dssm-cat-note"}>
        {t("category.note")}
      </p>
      {buckets
        .filter(function (bucket) {
          return !searching || bucket.skills.length;
        })
        .map(function (bucket) {
          return renderCategory(
            root,
            bucket,
            workspacePath,
            keyPrefix,
            allRows,
          );
        })}
    </div>);
  }

  function renderRoot(
    root: RootView,
    workspacePath?: string,
    rowsForRoot?: { root: RootView; skill: SkillView; }[],
    keyPrefix?: string,
  ) {
    var scopeRows = (rowsForRoot || rows).filter(function (row) {
      return row.root.key === root.key;
    });
    var filtered = (rowsForRoot || filteredRows).filter(function (row) {
      return row.root.key === root.key;
    });
    if (
      (activeSource && root.key !== activeSource) ||
      ((query || filters.status) && !filtered.length)
    )
      return null;
    var expansionKey = JSON.stringify([
      filterKey,
      keyPrefix || "",
      root.key,
      query,
      activeSource,
      filters.status,
    ]);
    // 选中工作区的来源默认展开，直接显示技能；全局来源默认行为保持不变。
    var open =
      expanded[expansionKey] === undefined
        ? workspacePath
          ? true
          : !!(query || activeSource || filters.status)
        : expanded[expansionKey];
    var displayName = workspacePath
      ? rootDisplayName(t, Object.assign({}, root, { projectName: undefined }))
      : rootDisplayName(t, root);
    return (<section
      key={(keyPrefix || "") + root.key}
      className={"dssm-source"}
      data-source-key={root.key}
    >
      <div className={"dssm-source-head"}>
        <button
          type={"button"}
          className={"dssm-source-toggle"}
          aria-expanded={open}
          onClick={function () {
            setExpanded(function (previous) {
              var next: Record<string, boolean> = {};
              next[expansionKey] = !open;
              return Object.assign({}, previous, next);
            });
          }}
        >
          {foldChevron(open)}
          <div className={"dssm-source-label"}>
            {renderRootIcon(root.key)}
            <span className={"dssm-source-title"}>
              {displayName}
            </span>
            <span className={"dssm-count"}>
              {t(countKey("summary.group", filtered.length), {
                count: filtered.length,
              })}
            </span>
            <span className={"dssm-source-path"} title={root.path}>
              {root.path}
            </span>
          </div>
        </button>
        {sourceExtra(root, workspacePath, displayName)}
      </div>
      {open
        ? (<div className={"dssm-source-body"} role={"region"}>
          {renderSourceBody(
            root,
            filtered,
            workspacePath,
            keyPrefix,
            scopeRows,
          )}
        </div>)
        : null}
    </section>);
  }
  return { renderRoot };
}
