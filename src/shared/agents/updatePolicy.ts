export const MAX_CONCURRENT_PROVIDER_UPDATES = 3;
export const AGENT_UPDATE_COMMAND_TIMEOUT_MS = 5 * 60_000;
export const AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS = 20 * 60_000;
/** Queue admission, two command attempts, and the surrounding status probes. */
export const AGENT_UPDATE_REQUEST_TIMEOUT_MS = 40 * 60_000;
