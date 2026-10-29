/**
 * Minimal structural typings for the DSH browser services this plugin uses.
 *
 * The published SDK installed here (`@deepseek-ai/dsh-client-ui-slots`) ships
 * the slot CONTRACT types but not the renderer-owned `SlotRegistry` service nor
 * the theme service class (those live in packages the host provides
 * at runtime but does not publish for standalone builds). Rather than depend on
 * unpublished packages, this module declares the exact, narrow faces the plugin
 * calls and augments `ctx` with them. The shapes mirror the live runtime; if
 * DSH widens the public SDK, replace these with the real imports.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One full settings page per list entry. The shell projects `id`, `order`
     * and `label` into the settings navigation and renders the component in the
     * content column; `close` leaves the settings panel.
     */
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: { close: () => void }
    }
  }
}

/** Composed props the settings-section component receives. */
export type SectionProps = PropsRuntime<'settings.section'>

/** The slot registration face the plugin calls on `ctx.slots`. */
export interface SlotsService {
  /**
   * Install a slot declaration/registration for the fiber's lifetime.
   * @param key - target slot key.
   * @param callback - runs the registration, returns its disposer.
   */
  inject(key: 'settings.section', callback: () => () => void): () => void
  /**
   * Register one settings-section entry.
   * @param options - list identity.
   * @param component - the page component.
   */
  register(
    options: {
      name: 'settings.section'
      id: string
      order?: number
      label?: () => string
    },
    component: (props: SectionProps) => ReactNode,
  ): () => void
}

/** One built-in/custom skin registration with the host theme service. */
export interface ThemeRegistration {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: Record<string, string>
}

/** Immutable theme snapshot the host publishes. */
export interface ThemeSnapshot {
  active?: { colorScheme?: 'light' | 'dark' }
  themes: ReadonlyArray<{ id: string }>
}

/** The theme face the plugin reads and writes on `ctx`. */
export interface ThemeService {
  register(reg: ThemeRegistration): () => void
  getTheme(): ThemeSnapshot
}

/**
 * The subset of the browser Cordis context the plugin relies on. The real
 * context carries far more; this narrow view keeps the plugin honest about
 * what it touches.
 */
export interface ClientCtx {
  slots: SlotsService
  get(service: 'theme'): ThemeService
  on(event: 'theme/change', handler: () => void): () => void
  effect(fn: () => void | (() => void), label?: string): void
}
