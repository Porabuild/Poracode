import type { AiActionType, UsageEventInputPayload } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

/**
 * Buffers interactive AI git-action usage events (`ai_commit`, `ai_pr`,
 * `ai_conflict`) triggered from the Git Review UI and flushes them to the host
 * `usage_events` log.
 *
 * Canonical runtime usage (`thread_started`, `turn`, `message`, `goal`,
 * `skill`, `subagent`, `workflow`, `mcp`) is captured directly on the host in
 * `src/host/profile/runtimeUsageRecorder.ts` so desktop (open or zero-window
 * tray), standalone CLI, and remote clients record identical facts.
 */

const FLUSH_IDLE_TIMEOUT_MS = 2000;
const MAX_BUFFER = 1000;

let buffer: UsageEventInputPayload[] = [];
let scheduled: { cancel: () => void } | null = null;

function flush(): void {
  if (scheduled) {
    scheduled.cancel();
    scheduled = null;
  }
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  try {
    void readBridge()
      .appendUsageEvents({ events })
      .catch(() => undefined);
  } catch {
    // Fire-and-forget semantics if the bridge is already torn down.
  }
}

function scheduleFlush(): void {
  if (scheduled) return;
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(
      () => {
        scheduled = null;
        flush();
      },
      { timeout: FLUSH_IDLE_TIMEOUT_MS },
    );
    scheduled = { cancel: () => cancelIdleCallback(id) };
  } else {
    const id = setTimeout(() => {
      scheduled = null;
      flush();
    }, FLUSH_IDLE_TIMEOUT_MS);
    scheduled = { cancel: () => clearTimeout(id) };
  }
}

function push(event: UsageEventInputPayload): void {
  buffer.push(event);
  if (buffer.length >= MAX_BUFFER) flush();
  else scheduleFlush();
}

// Don't lose buffered events when the window is hidden or closed.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Record an AI-performed git action (commit / PR / conflict) into the buffer. */
export function recordAiAction(type: AiActionType, provider: string, model: string): void {
  push({ ts: Date.now(), kind: `ai_${type}`, provider, model, value: 1 });
}
