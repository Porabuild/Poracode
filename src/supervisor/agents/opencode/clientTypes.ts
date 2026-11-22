/**
 * Type-only bridge to the OpenCode HTTP client. Every TYPE reference to
 * `@opencode/client` goes through this shim so the supervisor keeps a single
 * import site; the VALUE import is a dynamic `await import("@opencode/client")`
 * inside async functions because the package is ESM-only (its exports map has
 * no `require` condition, so a static import from the CJS supervisor fails).
 */
export type * from "@opencode/client";
export type OpenCodeClient = import("@opencode/client").OpenCodeClient;
