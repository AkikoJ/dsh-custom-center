import type { ClientContext } from "../browser-host.js";
import { destinationLocales } from "../destination-picker.js";
import { sidebarLocales } from "../sidebar-entry.js";
import type { CodedError, Diagnostic, SkillRoot } from "../model.js";
import type { ImportResult, SyncResult } from "../contracts.js";
import { en } from "./locales/en.js";
import { zh } from "./locales/zh.js";

var NS = "custom-center-skills";

var DICT = { zh: zh, en: en };

Object.assign(DICT.zh, destinationLocales.zh, sidebarLocales.zh);

Object.assign(DICT.en, destinationLocales.en, sidebarLocales.en);

function translateOrFallback(
  t: Translate,
  key: string,
  fallback: string,
  params?: object,
) {
  var value = t(key, params);
  return typeof value === "string" && value !== key ? value : fallback;
}

function translateError(t: Translate, payload: unknown): string {
  if (payload instanceof Error && !(payload as CodedError).code)
    return payload.message;
  if (payload && typeof payload === "object") {
    const item = payload as Diagnostic & { message?: unknown; };
    if (item.code) {
      var params = Object.assign({}, item.params || {});
      if (params.action)
        params.action = translateOrFallback(
          t,
          "action." + params.action,
          String(params.action),
        );
      var translated = t(item.code, params);
      if (typeof translated === "string" && translated !== item.code)
        return translated;
      if (translated === item.code)
        return item.error !== undefined
          ? translateError(t, item.error)
          : item.code;
    }
    if (item.error !== undefined) return translateError(t, item.error);
    if (item.message !== undefined) return String(item.message);
  }
  return String(payload == null ? "" : payload);
}

function countKey(key: string, count: number) {
  return key + (Number(count) === 1 ? ".one" : ".other");
}

var localeService: ClientContext["locale"] | undefined;

function hostLocale() {
  return localeService?.getLocale?.().active;
}

function formatTrashTime(t: Translate, value: string) {
  return new Date(value).toLocaleString(hostLocale() || t("format.locale"));
}

function rootDisplayName(t: Translate, root: SkillRoot) {
  var base = translateOrFallback(
    t,
    "root." + (root.localeKey || root.kind || root.key),
    root.label,
  );
  return root.projectName ? base + " · " + root.projectName : base;
}

function summarizeImportResult(t: Translate, data: ImportResult) {
  var importedItems = (data && data.imported) || [];
  var imported = importedItems.map(function (item) {
    return item.name;
  });
  var skipped = ((data && data.skipped) || []).map(function (item) {
    return item.name;
  });
  var warnings: string[] = [];
  importedItems.forEach(function (item) {
    (item.warnings || []).forEach(function (warning) {
      warnings.push(translateError(t, warning));
    });
  });
  var summary;
  if (imported.length && skipped.length)
    summary = {
      ok: true,
      warning: true,
      imported: true,
      text: t("result.importPartial", {
        imported: imported.join(", "),
        skipped: skipped.join(", "),
      }),
    };
  else if (imported.length)
    summary = {
      ok: true,
      warning: false,
      imported: true,
      text: t("result.imported", { names: imported.join(", ") }),
    };
  else if (skipped.length)
    summary = {
      ok: false,
      warning: true,
      imported: false,
      text: t("result.importSkipped", { names: skipped.join(", ") }),
    };
  else
    summary = {
      ok: false,
      warning: false,
      imported: false,
      text: t("result.importEmpty"),
    };
  if (warnings.length) {
    summary.warning = true;
    summary.text = t("result.importWarnings", {
      result: summary.text,
      warnings: warnings.join(t("format.warningSeparator")),
    });
  }
  return summary;
}

function summarizeSyncResult(t: Translate, data: SyncResult) {
  var synced = ((data && data.synced) || []).map(function (item) {
    return item.name;
  });
  var exists = ((data && data.skipped) || [])
    .filter(function (item) {
      return item.reason === "exists";
    })
    .map(function (item) {
      return item.name;
    });
  var failed = ((data && data.failed) || []).map(function (item) {
    return item.name;
  });
  var parts: string[] = [];
  if (synced.length)
    parts.push(t("sync.result.synced", { names: synced.join(", ") }));
  if (exists.length)
    parts.push(t("sync.result.skippedExists", { names: exists.join(", ") }));
  if (failed.length)
    parts.push(t("sync.result.failed", { names: failed.join(", ") }));
  if (!parts.length) parts.push(t("sync.result.nothing"));
  return {
    ok: failed.length === 0 && (synced.length > 0 || exists.length === 0),
    warning: exists.length > 0 || failed.length > 0,
    text: parts.join(t("format.warningSeparator")),
  };
}

function resolveT(rawT?: Translate): Translate {
  if (typeof rawT === "function") return rawT;
  if (localeService && typeof localeService.bind === "function")
    return localeService.bind(NS);
  return function (key: string, params?: object) {
    var dict = (DICT.zh || {}) as Record<string, string>;
    var template = dict[key] || key;
    if (!params) return template;
    var p = params as Record<string, unknown>;
    return template.replace(/\{(\w+)\}/g, function (_, name) {
      return String(p[name] ?? "{" + name + "}");
    });
  };
}
export function setLocaleService(service: ClientContext["locale"]) { localeService = service; }

export { countKey, DICT, formatTrashTime, hostLocale, NS, resolveT, rootDisplayName, summarizeImportResult, summarizeSyncResult, translateError, translateOrFallback };

export type Translate = (key: string, params?: object) => string;
