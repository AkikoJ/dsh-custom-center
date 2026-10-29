/** 全局与项目来源共用的目录契约；项目字段只在项目来源存在。 */
export interface SkillRoot {
  key: string;
  path: string;
  label: string;
  rank: number;
  mutable: boolean;
  native: boolean;
  toggleable: boolean;
  scope?: string;
  kind?: string;
  localeKey?: string;
  projectRoot?: string;
  projectName?: string;
  workspaceCwds?: string[];
  ok?: true;
}
export type RootInput = SkillRoot | string | null | undefined;
export interface Diagnostic {
  code?: string;
  params?: Record<string, unknown>;
  error?: string;
  level?: string;
}
export interface OperationError extends Diagnostic {
  ok: false;
  error: string;
}
export interface CodedError extends Error {
  code?: string;
  params?: Record<string, unknown>;
  statusCode?: number;
  httpStatus?: number;
}
export type Log = (event: string, detail: unknown) => void | Promise<void>;
export interface DiscoveredEntry {
  name?: string;
  kind: string;
  docPath: string;
  entryPath: string;
  realDocPath: string;
  realEntryPath: string;
  linked: boolean;
}
export interface SkillEntry extends DiscoveredEntry {
  name: string;
  declaredName: string;
  description: string;
  modelInvocable: boolean;
  userInvocable: boolean;
  invocationPolicyValid: boolean;
  hasFrontmatter: boolean;
  loadable: boolean;
  diagnostics: Diagnostic[];
  providerRank?: number;
  policyAliases?: {
    rootKey: string;
    name: string;
  }[];
}
export interface ParsedSkill {
  fields: {
    key: string;
    raw: string;
  }[];
  map: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
}
export interface Scan {
  exists: boolean;
  entries: SkillEntry[];
  truncated?: boolean;
}
export interface SkillCategory {
  id: string;
  name: string;
}
export interface ManagerState {
  version: number;
  sources: Record<string, boolean>;
  disabledSkills: Record<string, string[]>;
  enabledSkills: Record<string, string[]>;
  /** 是否在左侧全局侧边栏显示技能直达入口。默认 false。 */
  sidebarEntry?: boolean;
  /** 每个来源自己的列表分类。旧状态文件可以没有这两个字段。 */
  categories: Record<string, SkillCategory[]>;
  categoryMembers: Record<string, Record<string, string>>;
  /** 每个来源、分类（空字符串代表未分类）里的手动排序；旧状态文件可以缺省。 */
  categoryOrder: Record<string, Record<string, string[]>>;
}
export interface PolicyResult {
  state: ManagerState;
  writable: boolean;
  warning: Diagnostic | null;
}
export interface Policy {
  override?: boolean;
  sourceEnabled: boolean;
  modelInvocable: boolean;
  userInvocable: boolean;
  enabled: boolean;
}
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
export type SkillSyncStatus = "unsynced" | "synced" | "outdated" | "exists";
export interface SkillSync {
  status: SkillSyncStatus;
  /** 同步后在 DSH 中的位置。 */
  target: { root: string; name: string; };
}
export interface RootView extends SkillRoot {
  exists: boolean;
  truncated: boolean;
  enabled: boolean;
  skills: SkillView[];
  categories: SkillCategory[];
  categoryOrder?: Record<string, string[]>;
}
export interface SkillItem {
  root: SkillRoot;
  entry: SkillEntry;
  policy: Policy;
}
export interface ViewItem extends SkillItem {
  view: SkillView;
  managerEnabled: boolean;
}
export type RepositoryRoot = 'dsh' | 'agents';
export interface RepositoryDestination {
  key: RepositoryRoot;
  path: string;
  label: string;
  localeKey?: string;
  available: boolean;
  error?: Diagnostic;
}
export type Serialize = <T>(task: () => T | Promise<T>, recover?: boolean) => Promise<T>;
export interface ScopeOptions {
  projectCwds?: string[];
  cwd?: string;
  signal?: AbortSignal;
}
export interface RenameOptions {
  rename?: (source: string, destination: string) => Promise<void>;
  maxAttempts?: number;
  delayMs?: number;
}
export interface MutationOptions extends ScopeOptions {
  /** 宿主登记的工作区路径列表，由路由从 workspaceRegistry 读取；缺省表示不允许写项目。 */
  registeredWorkspaces?: string[];
  root?: RootInput;
  renameOptions?: RenameOptions;
  conflict?: string;
  dryRun?: boolean;
  /** 内部安装事务在文件复制前持久化意图，不接受请求体回调。 */
  beforeImport?: (pending: ImportPending[], conflicts: ImportConflict[], failed: ImportFailure[]) => Promise<void>;
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
export interface ImportCandidate {
  source: string;
  kebab: string;
  rawName: string;
  isDir: boolean;
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
export interface SyncOptions {
  projectCwds?: string[];
  /** 把目标里的旧技能移入回收站；缺省直接走 deleteSkill。 */
  trash?: (root: SkillRoot, name: string) => Promise<unknown>;
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
