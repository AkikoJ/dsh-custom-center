import { createElement, useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { CONVERSATION_VIEW_ID, PLUGIN_ID } from '../contracts.js'
import { dictionaries, NS, Translation, type Translate } from './messages.js'
import { SharedMemoryRpc, type MemoryRpc } from './shared-memory.js'
import { Settings, ConversationVideos } from './Settings.js'
interface Locale {
 register(ns: string, locale: string, dictionary: Record<string, string>): () => void
 bind(ns: string): Translate
 subscribe(fn: () => void): () => void
 getSnapshot(): { revision: number }
}
interface Slots {
 inject(key: 'settings.section' | 'conversation.view', callback: () => () => void): () => void
 register(options: { name: 'settings.section' | 'conversation.view'; id: string; order: number; label(): string }, render: () => ReactNode): () => void
}
interface Services { locale: Locale; slots: Slots }
export const inject = ['slots', 'locale']
export function apply(raw: Context) {
 const ctx = raw as Context & Services, t = ctx.locale.bind(NS)
 for (const [locale, dictionary] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(NS, locale, dictionary))
 function Localized({ children }: { children: ReactNode }) {
  useSyncExternalStore((fn) => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot().revision)
  const rpc = useCallback<MemoryRpc>((method, params) => {
    const connection = ctx.get('connection') as { rpc?: { call: (path: string, method: string, params: unknown) => Promise<unknown> } } | undefined
    if (!connection?.rpc) return Promise.reject(new Error('共享记忆服务不可用，保留本地记忆与人设'))
    return connection.rpc.call('/api', method, params || {})
   }, [])
   return createElement(Translation.Provider, { value: t }, createElement(SharedMemoryRpc.Provider, { value: rpc }, children))
 }
 const register = (name: 'settings.section' | 'conversation.view', id: string, label: string, component: typeof Settings) => ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, id, order: 31, label: () => t(label) }, () => createElement(Localized, { children: createElement(component) }))))
 register('settings.section', PLUGIN_ID, '刷抖音（中心版）', Settings)
 register('conversation.view', CONVERSATION_VIEW_ID, '抖音视频（中心版）', ConversationVideos)
}
