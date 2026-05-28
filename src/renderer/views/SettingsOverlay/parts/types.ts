export type SettingsSection =
  | "general"
  | "audio"
  | "notifications"
  | "ai"
  | "acpRegistry"
  | "agentsGeneral"
  | "search"
  | "agents"
  | "browser"
  | "archived"
  | "about"
  | "dev"
  | `agents:${string}`;
