/**
 * Diagnostics emitted while loading an Agent Plugins package.
 *
 * The specification requires clients to apply the *narrowest* applicable failure
 * boundary and to keep loading everything outside it. A diagnostic records what
 * was rejected and at which boundary, so nothing fails silently.
 *
 * @see https://agent-plugins.org/client-implementers/loading-and-discovery
 */

/** Narrowest failure boundary that applied, ordered widest to narrowest. */
export type PluginDiagnosticScope =
  /** The whole package was rejected. */
  | "plugin"
  /** One component type was disabled; the rest of the plugin still loads. */
  | "component-type"
  /** A single skill directory was skipped. */
  | "skill"
  /** A single `mcp.json` server entry was skipped. */
  | "mcp-server";

export type PluginDiagnosticSeverity = "error" | "warning";

export interface PluginDiagnostic {
  /** `error` rejected something; `warning` was tolerated and ignored. */
  severity: PluginDiagnosticSeverity;
  scope: PluginDiagnosticScope;
  /** Stable machine-readable reason, e.g. `manifest-invalid`, `path-escapes-root`. */
  code: string;
  /** Human-readable detail. Not localized: these are developer-facing. */
  message: string;
  /** Skill folder, MCP server name, or path the diagnostic applies to. */
  target?: string;
}

export function pluginDiagnostic(
  severity: PluginDiagnosticSeverity,
  scope: PluginDiagnosticScope,
  code: string,
  message: string,
  target?: string,
): PluginDiagnostic {
  return { severity, scope, code, message, ...(target ? { target } : {}) };
}

/** Compact one-line rendering for logs. */
export function formatPluginDiagnostic(diagnostic: PluginDiagnostic): string {
  const target = diagnostic.target ? ` (${diagnostic.target})` : "";
  return `[${diagnostic.severity}] ${diagnostic.scope}/${diagnostic.code}${target}: ${diagnostic.message}`;
}
