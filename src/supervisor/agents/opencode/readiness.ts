import { setTimeout as delay } from "node:timers/promises";
import type { OpenCodeClient } from "./clientTypes";

/** The server publishes its plugin inventory after the initial activation batch. */
export async function awaitOpenCodeActivation(
  client: OpenCodeClient,
  input?: Parameters<OpenCodeClient["plugin"]["list"]>[0],
  options?: Parameters<OpenCodeClient["plugin"]["list"]>[1],
): Promise<void> {
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
