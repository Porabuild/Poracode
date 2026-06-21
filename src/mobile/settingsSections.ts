export const MOBILE_SETTINGS_SECTION_LABELS = {
  general: "General",
  appearance: "Appearance",
  notifications: "Notifications",
  terminal: "Terminal",
  threads: "Threads",
  git: "Git",
  browser: "Browser",
  usage: "Usage",
  ai: "AI",
  models: "Agents",
  archived: "Archived Threads",
} as const;

export function getSettingsSectionLabel(sectionId: string | null): string | null {
  if (!sectionId) return null;
  return (
    MOBILE_SETTINGS_SECTION_LABELS[sectionId as keyof typeof MOBILE_SETTINGS_SECTION_LABELS] ?? null
  );
}
