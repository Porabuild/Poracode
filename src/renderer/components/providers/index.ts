// Shared utilities (provider-agnostic)
export * from "./statusTone";
export * from "./StatusIcon";
export * from "./ProviderIcon";
export * from "./ThreadProviderIcon";
export * from "./commitGen";
export * from "./conflictResolver";
export * from "./titleGen";

/**
 * Provider registrations (renderer manifest).
 * Each import triggers side-effect registration (icon, labels, commit-gen defaults).
 * To add a provider: create its folder, add an export line below.
 * To remove: delete its line and folder.
 *
 * This is only the renderer manifest. Full provider-wiring checklist (install
 * registry, update, picker/utility order, Browser-MCP scope, supervisor
 * registry): .agents/docs/agent-adapters.md → "Adding a New Provider".
 */
export * from "./claude";
export * from "./copilot";
export * from "./codex";
export * from "./gemini";
export * from "./grok";
export * from "./antigravity";
export * from "./commandcode";
export * from "./cursor";
export * from "./factory";
export * from "./opencode";
export * from "./zai";
export * from "./acpGeneric";
