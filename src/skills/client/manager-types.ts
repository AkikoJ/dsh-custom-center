import type * as React from "react";
import type { SkillDetail, TrashMetadata } from "../contracts.js";
import type { Translate } from "./messages.js";
import type { ApiRoutes } from "../contracts.js";

export type Detail = SkillDetail;

export type TrashItem = TrashMetadata;

export interface SectionProps {
  t: Translate;
  useSessions?: (selector: (snapshot?: SessionSnapshot) => string | undefined) => string | undefined;
}

export interface SessionSnapshot {
  ids?: string[];
  byId?: Record<string, {
    retainedBy?: {
      mainView?: unknown;
    };
  }>;
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
