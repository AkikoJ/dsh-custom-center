/**
 * Pure configuration helpers shared by the host half, the browser half and
 * tests. Keeping defaults here means the host schema and the browser UI cannot
 * disagree about what an absent value means.
 */

/** Persisted configuration surface of the customization center. */
export interface CustomCenterConfig {
  /** Master switch for the customization center. */
  enabled: boolean
  /** Skills management page. */
  skills: boolean
}

/** Defaults applied when the profile row carries no explicit value. */
export const DEFAULT_CUSTOM_CENTER_CONFIG: Readonly<CustomCenterConfig> = Object.freeze({
  enabled: true,
  skills: true,
})

/**
 * Normalize a persisted or partially supplied value.
 * @param value - a partial configuration read from the host or a form.
 * @returns a complete configuration object.
 */
export function resolveCustomCenterConfig(
  value?: Partial<CustomCenterConfig> | null,
): CustomCenterConfig {
  return {
    enabled: typeof value?.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_CUSTOM_CENTER_CONFIG.enabled,
    skills: typeof value?.skills === 'boolean'
      ? value.skills
      : DEFAULT_CUSTOM_CENTER_CONFIG.skills,
  }
}
