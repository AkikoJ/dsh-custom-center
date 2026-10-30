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

export interface SkillItem {
  root: SkillRoot;
  entry: SkillEntry;
  policy: Policy;
}

export type SkillSyncStatus = "unsynced" | "synced" | "outdated" | "exists";

export interface SkillSync {
  status: SkillSyncStatus;
  /** 同步后在 DSH 中的位置。 */
  target: { root: string; name: string; };
}

export type RepositoryRoot = 'dsh' | 'agents';
