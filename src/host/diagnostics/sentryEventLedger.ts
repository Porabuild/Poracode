import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lockSync } from "proper-lockfile";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  createSentryEventLimiter,
  type SentryEventLimiterState,
} from "@/shared/diagnostics/sentryEventLimiter";
import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";

// First diagnostic-only ledger. Older releases have no ledger; unknown versions
// remain untouched and use the bounded in-memory fallback for this process.
const SENTRY_EVENT_LEDGER_VERSION = 1;
const MAX_LEDGER_BYTES = 16_384;

function timestamps(value: unknown, max: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => Number.isSafeInteger(item) && item >= 0)
  );
}

function readState(path: string): SentryEventLimiterState {
  let value: unknown;
  try {
    if (statSync(path).size > MAX_LEDGER_BYTES) throw new Error("Oversized Sentry ledger");
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { processEvents: [], handledEvents: [], signatureEvents: new Map() };
    }
    throw error;
  }
  if (!value || typeof value !== "object") throw new Error("Invalid Sentry ledger");
  const record = value as Record<string, unknown>;
  if (
    record.formatVersion !== SENTRY_EVENT_LEDGER_VERSION ||
    !timestamps(record.processEvents, 20) ||
    !timestamps(record.handledEvents, 15) ||
    !Array.isArray(record.signatureEvents) ||
    record.signatureEvents.length > 20
  ) {
    throw new Error("Invalid Sentry ledger");
  }
  const signatureEvents = new Map<string, number[]>();
  for (const entry of record.signatureEvents) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      !/^\d{1,10}:\d{1,10}$/u.test(entry[0]) ||
      signatureEvents.has(entry[0]) ||
      !timestamps(entry[1], 3)
    ) {
      throw new Error("Invalid Sentry ledger");
    }
    signatureEvents.set(entry[0], entry[1]);
  }
  const admitted = [...signatureEvents.values()].flat().sort((a, b) => a - b);
  if (
    JSON.stringify(admitted) !== JSON.stringify([...record.processEvents].sort((a, b) => a - b)) ||
    record.handledEvents.some((timestamp) => {
      const index = admitted.indexOf(timestamp);
      if (index < 0) return true;
      admitted.splice(index, 1);
      return false;
    })
  ) {
    throw new Error("Inconsistent Sentry ledger");
  }
  return {
    processEvents: record.processEvents,
    handledEvents: record.handledEvents,
    signatureEvents,
  };
}

/** Separate file per transmission owner; shared by successive processes of that owner. */
export function createPersistentSentryEventLimiter(path: string, now: () => number = Date.now) {
  let memory: SentryEventLimiterState = {
    processEvents: [],
    handledEvents: [],
    signatureEvents: new Map(),
  };
  let storageUnavailable = false;
  function fallBackToMemory() {
    if (!storageUnavailable) {
      // Never report this through Sentry: a telemetry storage failure must not recurse.
      console.warn(
        "[poracode] Sentry budget storage unavailable; restart limits are not enforced.",
      );
      storageUnavailable = true;
    }
  }

  return (event: SentryEventLike): boolean => {
    // Repeated errors exhausted by this process must not hit the filesystem.
    // Only commit this candidate after admission; lock contention spends nothing.
    const candidate = structuredClone(memory);
    if (!createSentryEventLimiter({ now, state: candidate })(event)) return false;
    if (storageUnavailable) {
      memory = candidate;
      return true;
    }
    let release: (() => void) | undefined;
    let nextMemory = candidate;
    try {
      mkdirSync(dirname(path), { recursive: true });
      // Do not wait on another reporting process. A busy lock drops this event,
      // rather than allocating a fresh allowance. Crashed locks expire after 10s.
      release = lockSync(path, { realpath: false, retries: 0, stale: 10_000 });
      const state = readState(path);
      const admitted = createSentryEventLimiter({ now, state })(event);
      // Cache prior processes' spent allowance too, including refusals, so a
      // restarted poller does not keep reopening an already exhausted ledger.
      nextMemory = state;
      memory = state;
      if (!admitted) return false;
      // Charge before admission, so an immediate process exit cannot reset it.
      // Atomic rename protects process restarts, not sudden power loss (no fsync).
      writeFileAtomic(
        path,
        JSON.stringify({
          formatVersion: SENTRY_EVENT_LEDGER_VERSION,
          processEvents: state.processEvents,
          handledEvents: state.handledEvents,
          signatureEvents: [...state.signatureEvents],
        }),
        { mode: 0o600 },
      );
      return true;
    } catch (error) {
      const failure = error as NodeJS.ErrnoException;
      if (failure.code === "ELOCKED") return false;
      // Windows can return EPERM while another process's lock directory is
      // delete-pending. Failed lock ownership must not allocate a new budget.
      if (
        !release &&
        process.platform === "win32" &&
        failure.code === "EPERM" &&
        failure.syscall === "mkdir" &&
        failure.path === resolve(`${path}.lock`)
      ) {
        return false;
      }
      // Preserve crash visibility when the local disk is unusable. This weakens
      // the restart bound, but the original per-process limiter still applies.
      fallBackToMemory();
      memory = nextMemory;
      return true;
    } finally {
      try {
        release?.();
      } catch {
        fallBackToMemory();
      }
    }
  };
}
