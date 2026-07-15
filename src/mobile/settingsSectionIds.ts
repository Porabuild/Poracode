/**
 * Section-id facts only — no lingui macros or icons — so modules that run
 * outside the renderer transform (navHelpers and its node-project tests) can
 * depend on them without dragging in the macro pipeline.
 */
export const DEVICE_SETTINGS_SECTION_IDS = [
  "general",
  "appearance",
  "notifications",
  "terminal",
  "git",
] as const;

export const DESKTOP_SETTINGS_SECTION_IDS = [
  "profile",
  "usage",
  "schedules",
  "ai",
  "models",
  "archived",
] as const;

export type MobileSettingsSectionId =
  | (typeof DEVICE_SETTINGS_SECTION_IDS)[number]
  | (typeof DESKTOP_SETTINGS_SECTION_IDS)[number];

/** Whether a section page belongs to the Desktop Settings subscreen (its back
 * affordance returns there) rather than the flat Settings page. */
export function isDesktopSettingsSection(sectionId: string): boolean {
  return (DESKTOP_SETTINGS_SECTION_IDS as readonly string[]).includes(sectionId);
}
