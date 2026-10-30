import type { SkillRoot, SkillItem } from "../model.js";
import type { SkillView, ImportPending, ImportConflict, ImportFailure } from "../contracts.js";

export type RootInput = SkillRoot | string | null | undefined;

export type Log = (event: string, detail: unknown) => void | Promise<void>;

export interface ViewItem extends SkillItem {
  view: SkillView;
  managerEnabled: boolean;
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

export interface ImportCandidate {
  source: string;
  kebab: string;
  rawName: string;
  isDir: boolean;
}

export interface SyncOptions {
  projectCwds?: string[];
  /** 把目标里的旧技能移入回收站；缺省直接走 deleteSkill。 */
  trash?: (root: SkillRoot, name: string) => Promise<unknown>;
}
