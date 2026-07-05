/**
 * OpenCode context-usage event construction.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../../contextUsage";

export function createOpenCodeContextUsageEvent(
  threadId: string,
  info: unknown,
): RuntimeEvent | undefined {
  if (!info || typeof info !== "object") return undefined;
  const tokens = (info as { tokens?: unknown }).tokens;
  if (!tokens || typeof tokens !== "object") return undefined;
  const obj = tokens as Record<string, unknown>;
  const cache =
    obj.cache && typeof obj.cache === "object" ? (obj.cache as Record<string, unknown>) : {};
  return createContextUsageEvent(
    threadId,
    usageFromTokenCounts({
      inputTokens: readNonNegativeInteger(obj.input),
      outputTokens: readNonNegativeInteger(obj.output),
      thoughtTokens: readNonNegativeInteger(obj.reasoning),
      cachedReadTokens: readNonNegativeInteger(cache.read),
      cachedWriteTokens: readNonNegativeInteger(cache.write),
    }),
  );
}
