/** A wait returns on completion or attention; this is only its upper bound. */
export const DEFAULT_WAIT_TIMEOUT_MS = 480_000;
export const MAX_WAIT_TIMEOUT_MS = DEFAULT_WAIT_TIMEOUT_MS;

/** Leave time for dispatch/startup and response delivery around an eight-minute join. */
export const CROSSAGENT_MCP_TIMEOUT_MS = 600_000;
