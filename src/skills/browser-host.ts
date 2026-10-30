import type * as React from "react";
import type { Translate } from "./client/messages.js";

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
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
