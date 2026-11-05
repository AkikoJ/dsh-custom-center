import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { CONVERSATION_VIEW_ID, PLUGIN_ID } from '../contracts.js'
import { dictionaries, NS, Translation, type Translate } from './messages.js'
import { Settings, ConversationVideos } from './Settings.js'
import { DmConversation } from './DmConversation.js'
interface Locale {
 register(ns: string, locale: string, dictionary: Record<string, string>): () => void
 bind(ns: string): Translate
 subscribe(fn: () => void): () => void
 getSnapshot(): { revision: number }
}
interface Slots {
 inject(key: 'settings.section' | 'conversation.view' | 'sidebar.panellist' | 'main', callback: () => () => void): () => void
 register(options: { name: 'settings.section' | 'conversation.view' | 'sidebar.panellist'; id: string; order: number; label(): string } | { name: 'main'; key: string }, render: (props: { size: number; close?: () => void }) => ReactNode): () => void
}
interface Services { locale: Locale; slots: Slots; layout: { selectPanel(panelId: string | null): void } }
export const inject = ['slots', 'locale', 'layout']
export function apply(raw: Context) {
 const ctx = raw as Context & Services, t = ctx.locale.bind(NS)
 for (const [locale, dictionary] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(NS, locale, dictionary))
 function Localized({ children }: { children: ReactNode }) {
  useSyncExternalStore((fn) => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot().revision)
   return createElement(Translation.Provider, { value: t }, children)
 }
 const register = (name: 'settings.section' | 'conversation.view', id: string, label: string, component: typeof Settings) => ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, id, order: 31, label: () => t(label) }, () => createElement(Localized, { children: createElement(component) }))))
 const panel = 'dsh-custom-center-douyin-messages'
 ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: PLUGIN_ID, order: 31, label: () => t('刷抖音（中心版）') }, ({ close }) => createElement(Localized, { children: createElement(Settings, { onOpenMessages: () => { ctx.layout.selectPanel(panel); close?.() } }) }))))
 register('conversation.view', CONVERSATION_VIEW_ID, '抖音视频（中心版）', ConversationVideos)
 ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panel, order: 30, label: () => '抖音私信' }, ({ size }) => createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, createElement('path', { d: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z' })))))
 ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panel }, () => createElement(DmConversation))))
}
