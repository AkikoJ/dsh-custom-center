import type * as React from 'react';
import type { CreatedSkill, ImportResult, ManagerSnapshot, SkillDetail, SyncResult, TrashMetadata, WorkspaceRow, WorkspaceSkills } from './types.js';
export type { ManagerSnapshot } from './types.js';
export type Translate = (key: string, params?: object) => string;

export type Detail = SkillDetail;
export type TrashItem = TrashMetadata;
export type ApiRoutes = {
  '/state': ManagerSnapshot;
  '/workspaces': { items: WorkspaceRow[]; };
  '/workspace-skills': WorkspaceSkills;
  '/import': ImportResult;
  '/detail': Detail;
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
export interface ModalProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}
export interface SourceSelectProps {
  value?: string;
  label: string;
  disabled?: boolean;
  action?: boolean;
  icon?: React.ReactNode;
  options: {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    danger?: boolean;
  }[];
  onChange: (value: string) => void;
}
export interface SessionSnapshot {
  ids?: string[];
  byId?: Record<string, {
    retainedBy?: {
      mainView?: unknown;
    };
  }>;
}
export interface SectionProps {
  t: Translate;
  useSessions?: (selector: (snapshot?: SessionSnapshot) => string | undefined) => string | undefined;
}
export interface Filters {
  query: string;
  source: string;
  status: string;
}
export interface ViewProps extends SectionProps {
  sessionId?: string;
  scope: string;
  setScope: React.Dispatch<React.SetStateAction<string>>;
  savedFilters: Record<string, Filters>;
  setSavedFilters: React.Dispatch<React.SetStateAction<Record<string, Filters>>>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}
export interface ClientContext {
  effect: (effect: () => void | (() => void), label?: string) => unknown;
  locale: {
    register: (namespace: string, dictionary: Record<string, Record<string, string>>) => () => void;
    bind: (namespace: string) => Translate;
    /** Public LocaleRuntime snapshot: already resolves locale.preference. */
    getLocale?: () => { active: string; };
  };
  slots: {
    inject: (name: string, factory: () => unknown) => unknown;
    register: (options: Record<string, unknown>, component: (...args: any[]) => any) => unknown;
  };
}
interface Require {
  (id: 'react'): typeof React;
  (id: 'react-dom'): unknown;
  (id: 'react-dom/client'): unknown;
  (id: 'react/jsx-runtime'): unknown;
}
declare global {
  interface Window {
    __ModuleLoader__: {
      load: (module: {
        id: string;
        factory: (require: Require) => Record<string, unknown>;
      }) => void;
    };
  }
}
/** 文件夹选择器的非标准属性由 Chromium/DSH 提供。 */
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export type ResultMessage = {
  ok: boolean;
  text: string;
  warning?: boolean;
  scope?: string;
};

export type ConfirmModal =
  | {
    type: "sync-confirm";
    root: string;
    label: string;
    names?: string[];
    all?: boolean;
    workspace?: string;
  }
  | { type: "trash-confirm"; root: string; name: string; workspace?: string; }
  | { type: "delete-confirm"; id: string; name: string; }
  | { type: "category-create"; root: string; workspace?: string; }
  | {
    type: "category-rename";
    root: string;
    id: string;
    name: string;
    workspace?: string;
  }
  | {
    type: "category-delete";
    root: string;
    id: string;
    name: string;
    workspace?: string;
  }
  | {
    type: "category-add";
    root: string;
    id: string;
    name: string;
    workspace?: string;
    skills: {
      name: string;
      declaredName?: string;
      description?: string;
      currentCatName: string;
    }[];
  };

export type ModalState = "detail" | "create" | "import" | ConfirmModal | null;
export type Post = <K extends keyof ApiRoutes>(path: K, body: unknown, successKey?: string | null, successParams?: object) => Promise<ApiRoutes[K]>;
