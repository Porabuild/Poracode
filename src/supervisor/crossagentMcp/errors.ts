/** A synchronous spawn-time failure surfaced to the caller as an MCP error. */
export class SubagentSpawnError extends Error {}

/**
 * The current provider configuration can no longer admit the active worker's
 * selection (model/effort/Fast) or effective context. Not a crew edit.
 */
export class SubagentCapabilityChangeError extends SubagentSpawnError {}
