import type { Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AsyncPromptQueue } from "./promptQueue";
import { readFastAvailabilityAt, writeFastAvailabilityAt } from "./fastModeCacheCore";

/**
 * Decide whether fast mode is available for the authenticated account, shared by
 * the native probe and the WSL probe worker.
 *
 * The gate is per account/org and has no static signal — the SDK init still
 * advertises `supportsFastMode` on the model regardless. The only reliable read
 * is the runtime `fast_mode_state` after requesting fast on, which needs a live
 * turn, so the answer is cached per account at `cachePath` and the turn runs at
 * most once until an explicit refresh clears the cache.
 *
 * Returns `true`/`false` for available/unavailable, or `undefined` when unknown
 * (no account, timeout, or a CLI that predates the flag) — callers must treat
 * `undefined` as ungated (fail-open: never gate on uncertainty).
 */
export async function resolveFastAvailability(
  runtime: Query,
  queue: AsyncPromptQueue,
  accountEmail: string | undefined,
  cachePath: string,
): Promise<boolean | undefined> {
  if (!accountEmail) return undefined;

  const cached = await readFastAvailabilityAt(cachePath, accountEmail);
  if (cached !== undefined) return cached;

  try {
    // Fast mode only applies to Opus, and that's the only family the Fast toggle
    // is offered for. Pin the probe turn to Opus so an account whose default is
    // Sonnet (no fast support) doesn't read as "fast disabled".
    await runtime.setModel("opus");
  } catch {
    // Older transports may reject live model changes — fall back to the default.
  }
  try {
    await runtime.applyFlagSettings({ fastMode: true });
  } catch {
    return undefined; // CLI predates the flag — leave fast ungated.
  }
  queue.push({
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content: "Respond with the single word: ok" },
  } as SDKUserMessage);

  for await (const message of runtime) {
    if (message.type !== "result") continue;
    const available = (message as { fast_mode_state?: string }).fast_mode_state === "on";
    await writeFastAvailabilityAt(cachePath, accountEmail, available);
    return available;
  }

  // Aborted/timed out before a result: don't cache a spurious "disabled".
  return undefined;
}
