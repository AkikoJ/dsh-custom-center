// Skills 浏览器装配（移植自 dsh-skills-manager，Apache-2.0）。
import * as react from "react";
import type { ClientContext } from "./client-types.js";
import { callApi, MUTATION_HEADERS, parseApiResponse, resolveApiUrl } from "./client/api-client.js";
import { recoverModalFocus, trapModalFocus } from "./client/controls.js";
import { currentSessionId, SkillManagerSection } from "./client/manager-page.js";
import {
  countKey,
  DICT,
  formatTrashTime,
  NS,
  rootDisplayName,
  setLocaleService,
  summarizeImportResult,
  summarizeSyncResult,
  translateError,
} from "./client/messages.js";
import {
  agentSkillRoots,
  canToggleSource,
  countSkillStatuses,
  filterSkills,
  isSkillEnabled,
  matchSkillQuery,
  normalizeSkillQuery,
  scopeSkillRoots,
  skillStatus,
  visibleSkillRoots,
} from "./client/selectors.js";
import { inspectUploadSelection } from "./client/uploads.js";
import { installSettingsNavIcon } from "./settings-nav-icon.js";
import { setupSidebarEntry } from "./sidebar-entry.js";

var inject = ["slots", "locale"];

function apply(ctx: ClientContext) {
  setLocaleService(ctx.locale);
  ctx.effect(function () {
    return ctx.locale.register(NS, DICT);
  });
  installSettingsNavIcon(ctx, function () {
    return ctx.locale.bind(NS)("title");
  });
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      {
        name: "settings.section",
        id: "custom-center-skills",
        order: 42,
        label: function () {
          return ctx.locale.bind(NS)("title");
        },
        icon: "skill",
        locale: NS,
      },
      SkillManagerSection,
    );
  });
  setupSidebarEntry(ctx, {
    callApi: callApi,
    headers: MUTATION_HEADERS,
    renderPanel: function (ownerProps?: any) {
      return react.createElement(
        SkillManagerSection,
        Object.assign({ t: ctx.locale.bind(NS) }, ownerProps),
      );
    },
    ns: NS,
  });
}

export {
  agentSkillRoots, apply, canToggleSource, countKey, countSkillStatuses,
  currentSessionId, DICT, filterSkills, formatTrashTime, inject, inspectUploadSelection, isSkillEnabled, matchSkillQuery, normalizeSkillQuery, parseApiResponse, recoverModalFocus, resolveApiUrl, rootDisplayName, scopeSkillRoots, setupSidebarEntry, skillStatus, summarizeImportResult, summarizeSyncResult, translateError, trapModalFocus, visibleSkillRoots
};
