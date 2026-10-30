import { pageCss, controlCss } from '../shared/styles.js'
import { appearancePageCss, wallpaperHostCss } from '../appearance/client/styles.js'
import { tuningCss } from '../tuning/client/styles.js'

/** Install the plugin stylesheet once. */
export function ensureStyle(): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector('style[data-plugin="dsh-custom-center"]')) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-custom-center'
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}

/** Feature styles stay in their original cascade order. */
export const CSS_TEXT = pageCss + appearancePageCss + controlCss + tuningCss + wallpaperHostCss
