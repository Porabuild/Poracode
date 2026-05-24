// Shared utilities (provider-agnostic)
export * from "./statusTone";
export * from "./StatusIcon";
export * from "./ProviderIcon";
export * from "./commitGen";
export * from "./titleGen";

/**
 * Provider registrations (renderer manifest).
 * Each import triggers side-effect registration (icon, labels, commit-gen defaults).
 * To add a provider: create its folder, add an export line below.
 * To remove: delete its line and folder.
 */
export * from "./claude";
export * from "./copilot";
export * from "./codex";
export * from "./gemini";
export * from "./grok";
export * from "./antigravity";
export * from "./cursor";
export * from "./opencode";
export * from "./acpGeneric";
