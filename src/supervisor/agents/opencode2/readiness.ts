import { setTimeout as delay } from "node:timers/promises";
import type { OpenCode2Client } from "./clientTypes";

/**
 * Older servers expose an activation barrier. Newer servers removed that
 * route; their plugin inventory is published after the initial activation
 * batch, so wait for that inventory before reading the cold catalog.
 */
export async function awaitOpenCode2Activation(
  client: OpenCode2Client,
  input?: Parameters<OpenCode2Client["plugin"]["awaitActivation"]>[0],
  options?: Parameters<OpenCode2Client["plugin"]["awaitActivation"]>[1],
): Promise<void> {
  options?.signal?.throwIfAborted();
  try {
    await client.plugin.awaitActivation(input, options);
    return;
  } catch (error) {
    // Only the removed endpoint is compatible with inventory polling. Auth,
    // transport, and server failures must still reach the caller.
    if (
      !(error instanceof Error) ||
      error.name !== "ClientError" ||
      !("reason" in error) ||
      error.reason !== "UnexpectedStatus" ||
      !error.cause ||
      typeof error.cause !== "object" ||
      !("status" in error.cause) ||
      error.cause.status !== 404
    ) {
      throw error;
    }
  }

  const signal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)])
    : AbortSignal.timeout(60_000);
  const requestOptions = { ...options, signal };
  for (;;) {
    signal.throwIfAborted();
    const inventory = await client.plugin.list(input, requestOptions);
    if (inventory.data.length > 0) return;
    await delay(250, undefined, { signal });
  }
}
