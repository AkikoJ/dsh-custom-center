import { Button as PrimitiveButton } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import { type ConfirmModal, type Post } from "./manager-types.js";
import { type Translate } from "./messages.js";
import { type RootView, type SkillView } from "../contracts.js";
import { SourceSelect, enableSwitch } from "./controls.js";
import { moreIcon } from "./icons.js";
import { rootDisplayName } from "./messages.js";
import { isSkillEnabled } from "./selectors.js";

interface createSkillRowsProps {
  t: Translate;
  allRoots: RootView[] | never[];
  openSync: (target: { root: string; label: string; names?: string[]; all?: boolean; workspace?: string; }, overwrite: boolean) => void;
  busy: boolean;
  openFolder: (root: RootView, skill: SkillView, workspacePath?: string) => void;
  openDetail: (root: RootView, skill: SkillView, workspacePath?: string) => void;
  post: Post;
  confirmTrash: (target: Extract<ConfirmModal, { type: "trash-confirm" }>) => void;
  draggingRef: React.MutableRefObject<{ root: string; name: string; currentCategoryId: string; } | null>;
}

export function createSkillRows({ t, allRoots, openSync, busy, openDetail, openFolder, post, confirmTrash, draggingRef }: createSkillRowsProps) {
  function renderLinkedNote(skill: SkillView) {
    if (skill.linked !== true) return null;
    return (<div className={"dssm-note"}>
      {t("skill.linked")}
    </div>);
  }

  function renderFallback(skill: SkillView) {
    if (!skill.fallbackTo) return null;
    var target = allRoots.find(function (root) {
      return root.key === skill.fallbackTo!.root;
    });
    if (!target) return null;
    return (<div className={"dssm-note dssm-fallback"}>
      {t("status.fallback." + skill.fallbackTo.scope, {
        source: rootDisplayName(t, target),
      })}
    </div>);
  }

  function renderAgentSkill(
    root: RootView,
    skill: SkillView,
    workspacePath?: string,
  ) {
    var sync = skill.sync;
    var status = sync ? sync.status : "";
    var label = skill.declaredName || skill.name;
    var menu: { value: string; label: string; }[] = [
      { value: "detail", label: t("btn.detail") },
    ];
    if (sync)
      menu.push({
        value: "sync",
        label: status === "unsynced" ? t("sync.one") : t("sync.again"),
      });
    var startSync = function () {
      openSync(
        {
          root: root.key,
          label: label,
          names: [skill.name],
          workspace: workspacePath,
        },
        status !== "unsynced",
      );
    };
    var badge = sync
      ? (<span className={"dssm-sync-badge dssm-sync-" + status}>
        {t("status." + status)}
      </span>)
      : skill.loadable === false
        ? renderSkillStatusIcon("status.invalid", undefined, "")
        : null;
    var primary =
      sync && status !== "synced"
        ? (<PrimitiveButton
          variant={"outline"}
          size={"sm"}
          disabled={busy}
          onClick={startSync}
        >
          {status === "unsynced" ? t("sync.one") : t("sync.again")}
        </PrimitiveButton>)
        : null;
    return (<div key={root.key + ":" + skill.name} className={"dssm-skill-row"}>
      <div className={"dssm-skill-copy"}>
        <div className={"dssm-name"}>
          {label}
        </div>
        <div className={"dssm-skill-desc"} title={skill.description || undefined}>
          {skill.description || t("note.missing")}
        </div>
        {renderLinkedNote(skill)}
      </div>
      <div className={"dssm-skill-actions"}>
        <SourceSelect
          action={true}
          icon={moreIcon()}
          label={t("btn.more")}
          disabled={busy}
          options={menu}
          onChange={function (action) {
            if (action === "detail") openDetail(root, skill, workspacePath);
            if (action === "sync") startSync();
          }}
        />
        <div className={"dssm-row-state"}>
          {badge}
          {primary}
        </div>
      </div>
    </div>);
  }

  function renderSkillStatusIcon(key: string, title?: string, cls?: string) {
    var isSuccess = key === "status.enabled";
    var isWarn = key === "status.disabled";
    var isError = key === "status.invalid";
    var color = isSuccess
      ? "var(--dsw-alias-state-success-primary, #51b976)"
      : isWarn
        ? "var(--dsw-alias-state-warn-primary, #d49245)"
        : isError
          ? "var(--dsw-alias-state-error-primary, #ef7272)"
          : "var(--dsw-alias-label-tertiary, #a0a0a0)";
    var iconD = isSuccess
      ? "M8 0a8 8 0 100 16A8 8 0 008 0zm3.28 6.72l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06L7 9.44l3.47-3.47a.75.75 0 011.06 1.06z"
      : isWarn
        ? "M8 0a8 8 0 100 16A8 8 0 008 0zm3 8.75H5a.75.75 0 010-1.5h6a.75.75 0 010 1.5z"
        : isError
          ? "M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z"
          : "M8.28 1.34a.75.75 0 00-.56 0l-6.5 2.5a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-6.5-2.5zm5.97 6.41L8 10.15 1.75 7.75l-.5.19a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-.56-.2zM14.25 11.5L8 13.9 1.75 11.5l-.5.19a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-.56-.19z";
    var tooltip = title || t(key);
    return (<span
      className={"dssm-status " + (cls || "")}
      title={tooltip}
      aria-label={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: color,
        width: 20,
        height: 20,
        verticalAlign: "middle",
      }}
    >
      <svg
        viewBox={"0 0 16 16"}
        width={14}
        height={14}
        fill={"currentColor"}
        aria-hidden={true}
      >
        <path d={iconD} />
      </svg>
    </span>);
  }

  function renderSkill(
    root: RootView,
    skill: SkillView,
    workspacePath?: string,
  ) {
    if (root.native === false)
      return renderAgentSkill(root, skill, workspacePath);
    var scoped = function (extra: Record<string, unknown>) {
      return workspacePath
        ? Object.assign({}, extra, { workspace: workspacePath })
        : extra;
    };
    var enabled = isSkillEnabled(skill);
    var showSwitch = root.toggleable !== false;
    var statusKey = skill.shadowedBy
      ? "status.shadowed"
      : skill.loadable === false
        ? "status.invalid"
        : enabled
          ? "status.enabled"
          : "status.disabled";
    var cls = skill.shadowedBy
      ? "dssm-shadowed"
      : enabled
        ? "dssm-enabled"
        : "dssm-disabled";
    var showStatus =
      !showSwitch || !!skill.shadowedBy || skill.loadable === false;
    var menu: { value: string; label: string; danger?: boolean; }[] = [
      { value: "detail", label: t("btn.detail") },
      { value: "open-folder", label: t("btn.open.folder") },
    ];
    var categories = root.categories || [];
    var currentCatId = skill.categoryId || "";
    categories.forEach(function (category) {
      if (category.id !== currentCatId) {
        menu.push({
          value: "category:" + category.id,
          label: t("category.assign", { name: category.name }),
        });
      }
    });
    if (categories.length && currentCatId !== "") {
      menu.push({
        value: "category:",
        label: t("category.assign", { name: t("category.uncategorized") }),
      });
    }
    if (root.mutable && skill.linked !== true)
      menu.push({ value: "trash", label: t("btn.trash"), danger: true });
    var statusTitle = skill.shadowedBy
      ? t("status.shadowedBy", {
        source: (function () {
          var winner = allRoots.find(function (item) {
            return item.key === skill.shadowedBy!.root;
          });
          return winner ? rootDisplayName(t, winner) : skill.shadowedBy!.root;
        })(),
      })
      : undefined;
    var skillActions: React.ReactNode[] = [
      (<SourceSelect
        action={true}
        icon={moreIcon()}
        label={t("btn.more")}
        disabled={busy}
        options={menu}
        onChange={function (action) {
          if (action === "detail") openDetail(root, skill, workspacePath);
          if (action === "open-folder") { openFolder(root, skill, workspacePath); }
          if (action.indexOf("category:") === 0) {
            var categoryId = action.slice("category:".length);
            var category = categories.find(function (item) {
              return item.id === categoryId;
            });
            post(
              "/category-assign",
              scoped({
                root: root.key,
                name: skill.name,
                category: categoryId,
              }),
              "category.assigned",
              {
                name: skill.name,
                category: category
                  ? category.name
                  : t("category.uncategorized"),
              },
            );
          }
          if (action === "trash")
            confirmTrash({
              type: "trash-confirm",
              root: root.key,
              name: skill.name,
              workspace: workspacePath,
            });
        }}
      />),
    ];
    skillActions.push(
      (<div className={"dssm-row-state"}>
        {showStatus ? renderSkillStatusIcon(statusKey, statusTitle, cls) : null}
        {showSwitch
          ? enableSwitch(
            enabled,
            t("skill.toggle") + " " + skill.name,
            busy ||
            root.enabled === false ||
            (!enabled && skill.loadable === false),
            function () {
              post(
                enabled ? "/disable" : "/enable",
                scoped({ root: root.key, name: skill.name }),
              );
            },
          )
          : null}
      </div>),
    );
    var skillName = skill.declaredName || skill.name;
    var description = skill.description || t("note.missing");
    var canDrag =
      root.mutable === true || !!(root.categories && root.categories.length);
    return (<div
      key={root.key + ":" + skill.name}
      className={"dssm-skill-row"}
      draggable={canDrag}
      onDragStart={function (e: React.DragEvent) {
        if (!canDrag) return;
        var dragInfo = {
          root: root.key,
          name: skill.name,
          currentCategoryId: skill.categoryId || "",
        };
        draggingRef.current = dragInfo;
        e.dataTransfer.setData("text/plain", JSON.stringify(dragInfo));
        e.dataTransfer.effectAllowed = "move";
        (e.currentTarget as HTMLElement).classList.add("dragging");
      }}
      onDragEnd={function (e: React.DragEvent) {
        draggingRef.current = null;
        (e.currentTarget as HTMLElement).classList.remove("dragging");
        clearDragHighlights(e.currentTarget as HTMLElement);
      }}
      onDragOver={function (e: React.DragEvent) {
        if (
          !draggingRef.current ||
          draggingRef.current.root !== root.key ||
          draggingRef.current.name === skill.name
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        (e.currentTarget as HTMLElement).classList.toggle(
          "drop-before",
          e.clientY < rect.top + rect.height / 2,
        );
        (e.currentTarget as HTMLElement).classList.toggle(
          "drop-after",
          e.clientY >= rect.top + rect.height / 2,
        );
      }}
      onDragLeave={function (e: React.DragEvent) {
        (e.currentTarget as HTMLElement).classList.remove(
          "drop-before",
          "drop-after",
        );
      }}
      onDrop={function (e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).classList.remove(
          "drop-before",
          "drop-after",
        );
        var dragInfo = draggingRef.current;
        draggingRef.current = null;
        clearDragHighlights(e.currentTarget as HTMLElement);
        if (
          !dragInfo ||
          dragInfo.root !== root.key ||
          dragInfo.name === skill.name
        )
          return;
        var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        post(
          "/category-move",
          scoped({
            root: root.key,
            name: dragInfo.name,
            category: skill.categoryId || "",
            targetName: skill.name,
            position:
              e.clientY < rect.top + rect.height / 2 ? "before" : "after",
          }),
          "category.moved",
          { name: dragInfo.name },
        );
      }}
    >
      {canDrag
        ? (<div className={"dssm-drag-handle"} title={t("category.dragTip")}>
          {"⋮⋮"}
        </div>)
        : null}
      <div className={"dssm-skill-copy"}>
        <div className={"dssm-name"}>
          {skillName}
        </div>
        <div className={"dssm-skill-desc"} title={skill.description || undefined}>
          {description}
        </div>
        {renderLinkedNote(skill)}
        {renderFallback(skill)}
      </div>
      <div className={"dssm-skill-actions"}>
        {skillActions}
      </div>
    </div>);
  }

  function clearDragHighlights(element: HTMLElement) {
    var section = element.closest(".dssm-section");
    if (!section) return;
    Array.prototype.forEach.call(
      section.querySelectorAll(
        ".dssm-cat.drag-over, .dssm-skill-row.drop-before, .dssm-skill-row.drop-after",
      ),
      function (target: HTMLElement) {
        target.classList.remove("drag-over", "drop-before", "drop-after");
      },
    );
  }
  return { renderSkill, clearDragHighlights };
}
