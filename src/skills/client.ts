import * as react from "react";
import type { ClientContext } from "./browser-host.js";
import { callApi, MUTATION_HEADERS } from "./client/api-client.js";
import { SkillManagerSection } from "./client/manager-page.js";
import { DICT, NS, setLocaleService } from "./client/messages.js";
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

export { apply, inject };
