/**
 * Devin profile configuration schema — moved to the shared pure module
 * (`src/shared/agents/devin/profileConfig.ts`) so the renderer shares the
 * exact format without importing supervisor runtime code. This re-export
 * keeps every existing supervisor import (and the renderer's type-only
 * import path) working; the shared module is the authoritative source.
 */
export * from "@/shared/agents/devin/profileConfig";
