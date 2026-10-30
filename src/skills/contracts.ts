import type { SkillRoot, Diagnostic, SkillEntry, SkillCategory, SkillSync, RepositoryRoot } from "./model.js";

export interface SkillView extends Omit<SkillEntry, 'docPath' | 'entryPath' | 'realDocPath' | 'realEntryPath' | 'linked'> {
  path: string;
  managerEnabled: boolean;
  managerOverride: boolean | null;
  effectiveModelInvocable: boolean;
  effectiveUserInvocable: boolean;
  enabled?: boolean;
  winner?: boolean;
  canonicalName?: string;
  shadowedBy?: {
    root: string;
    name: string;
  };
  fallbackTo?: {
    root: string;
    name: string;
    scope: string;
  };
  categoryId?: string | null;
  /** 可写根里的顶层目录链接。详情和启停可用，删除与覆盖不可用。 */
  linked?: boolean;
  /** 仅其他 Agent 来源携带：与 DSH 目标目录的同步状态。 */
  sync?: SkillSync;
}

export interface RootView extends SkillRoot {
  exists: boolean;
  truncated: boolean;
  enabled: boolean;
  skills: SkillView[];
  categories: SkillCategory[];
  categoryOrder?: Record<string, string[]>;
}

export interface RepositoryDestination {
  key: RepositoryRoot;
  path: string;
  label: string;
  localeKey?: string;
  available: boolean;
  error?: Diagnostic;
}

export interface UploadInput {
  name?: string;
  zip?: string;
  entries?: {
    path: string;
    data: string;
  }[];
}

export interface CreateInput {
  name?: string;
  description?: string;
  body?: string;
}

export interface ImportPending {
  name: string;
  source: string;
  isDir: boolean;
  dest: string;
}

export interface ImportConflict {
  name: string;
  source: string;
  isDir: boolean;
  paths: string[];
}

export interface ImportFailure extends Diagnostic {
  source: string;
  error: string;
}

export interface ImportResult extends Diagnostic {
  ok?: boolean;
  kind?: string;
  imported?: {
    name: string;
    overwritten: boolean;
    warnings: Diagnostic[];
  }[];
  skipped?: {
    name: string;
    source: string;
  }[];
  failed?: ImportFailure[];
  pending?: ImportPending[];
  conflicts?: ImportConflict[];
}

export interface SyncInput {
  /** 其他 Agent 来源的 root key。 */
  root?: unknown;
  /** 要同步的条目名；与 all 二选一。 */
  names?: unknown;
  /** 同步该来源下全部可同步技能。 */
  all?: unknown;
  /** 目标已有同名技能时覆盖；旧版本先进回收站。 */
  overwrite?: unknown;
}

export interface SyncFailure extends ImportFailure {
  name: string;
}

export interface SyncResult extends Diagnostic {
  ok?: boolean;
  synced?: { name: string; source: string; overwritten: boolean; }[];
  skipped?: { name: string; reason: "synced" | "exists" | "invalid"; }[];
  failed?: SyncFailure[];
}

export interface WorkspaceRow {
  name: string;
  path: string;
  projectRoot?: string;
  registeredPaths: string[];
  available: boolean;
  skillCount: number;
}

export interface TrashMetadata {
  id: string;
  name: string;
  deletedAt: string;
  root?: {
    key: string;
    scope: string;
    label: string;
    localeKey?: string;
    projectRoot?: string;
    projectName?: string;
    kind?: string;
  };
  entries: string[];
}

export type ManagerSnapshot = {
  roots: RootView[];
  writeDestinations: RepositoryDestination[];
  projects: { root?: string; name?: string; workspaceCwds?: string[]; }[];
  summary: { total: number; enabled: number; disabled: number; issues: number; };
  trash: TrashMetadata[];
  warnings: Diagnostic[];
};

export type SkillDetail = {
  root: string;
  name: string;
  declaredName: string;
  description: string;
  path: string;
  kind: string;
  body: string;
  document: string;
  frontmatter: { [k: string]: string; } | null;
  diagnostics: ({ level: string; code: string; params?: undefined; } | { level: string; code: string; params: { name: string; }; })[];
  loadable: boolean;
  sourceReadOnly: boolean;
  ok?: undefined;
  error?: undefined;
  code?: undefined;
  params?: undefined;
};

export type WorkspaceSkills = {
  project: { root: string; name: string; workspaceCwds: string[]; };
  roots: RootView[];
  warnings: Diagnostic[];
};

export type CreatedSkill = {
  name: string;
  path: string;
  root: string;
  ok?: undefined;
  error?: undefined;
  code?: undefined;
  params?: undefined;
};

export type ApiRoutes = {
  '/state': ManagerSnapshot;
  '/workspaces': { items: WorkspaceRow[]; };
  '/workspace-skills': WorkspaceSkills;
  '/import': ImportResult;
  '/detail': SkillDetail;
  '/create': CreatedSkill;
  '/upload': ImportResult;
  '/sync': SyncResult;
  '/delete': unknown;
  '/trash-restore': unknown;
  '/trash-delete': unknown;
  '/enable': unknown;
  '/disable': unknown;
  '/source-enable': unknown;
  '/source-disable': unknown;
  '/category-create': unknown;
  '/category-rename': unknown;
  '/category-delete': unknown;
  '/category-assign': unknown;
  '/category-move': unknown;
  '/category-enable': unknown;
  '/category-disable': unknown;
  '/sidebar-entry': { enabled: boolean; };
  '/open-folder': { ok: boolean; };
};

export type ApiCall = <K extends keyof ApiRoutes>(path: K, options?: RequestInit) => Promise<ApiRoutes[K]>;
