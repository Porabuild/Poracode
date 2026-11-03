import type { SentryEventLike } from "./sentryPrivacy";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_EVENTS_PER_SIGNATURE = 3;
const DEFAULT_MAX_EVENTS_PER_PROCESS = 20;
const DEFAULT_MAX_HANDLED_EVENTS_PER_PROCESS = 15;
const DEFAULT_MAX_TRACKED_SIGNATURES = 256;

type SentryEventLimiterOptions = {
  now?: () => number;
  windowMs?: number;
  maxEventsPerSignature?: number;
  maxEventsPerProcess?: number;
  maxHandledEventsPerProcess?: number;
  maxTrackedSignatures?: number;
};

function hashSignature(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    first = Math.imul(first ^ character, 0x01000193);
    second = Math.imul(second ^ (character + first), 0x85ebca6b);
  }
  return `${first >>> 0}:${second >>> 0}`;
}

function eventSignature(event: SentryEventLike): string {
  const fingerprint = event.fingerprint;
  const diagnosticTags = [
    event.platform,
    event.tags?.["event.process"],
    event.tags?.["poracode.process"],
    event.tags?.["poracode.provider"],
    event.tags?.["poracode.runtime_kind"],
  ];
  const values = event.exception?.values?.slice(0, 3).map((value) => ({
    type: value.type,
    value: value.value?.slice(0, 512),
    frames: value.stacktrace?.frames?.slice(-8).map((frame) => ({
      function: frame.function,
      filename: frame.filename,
      lineno: frame.lineno,
      colno: frame.colno,
    })),
  }));

  return hashSignature(
    JSON.stringify([
      diagnosticTags,
      Array.isArray(fingerprint) && fingerprint.length > 0
        ? ["fingerprint", fingerprint]
        : [
            "event",
            event.message?.slice(0, 512),
            event.type,
            values,
            event.tags?.["poracode.failure_domain"],
            event.tags?.["poracode.operation"],
            event.tags?.["poracode.feature_area"],
          ],
    ]) ?? "",
  );
}

function isHighPriorityEvent(event: SentryEventLike): boolean {
  return (
    event.platform === "native" ||
    event.level === "fatal" ||
    (event.exception?.values?.some((value) => value.mechanism?.handled === false) ?? false)
  );
}

function removeExpired(timestamps: number[], cutoff: number): void {
  while (timestamps.length > 0 && timestamps[0]! <= cutoff) {
    timestamps.shift();
  }
}

export function createSentryEventLimiter(options: SentryEventLimiterOptions = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxEventsPerSignature = options.maxEventsPerSignature ?? DEFAULT_MAX_EVENTS_PER_SIGNATURE;
  const maxEventsPerProcess = options.maxEventsPerProcess ?? DEFAULT_MAX_EVENTS_PER_PROCESS;
  const maxHandledEventsPerProcess =
    options.maxHandledEventsPerProcess ?? DEFAULT_MAX_HANDLED_EVENTS_PER_PROCESS;
  const maxTrackedSignatures = options.maxTrackedSignatures ?? DEFAULT_MAX_TRACKED_SIGNATURES;
  const processEvents: number[] = [];
  const handledEvents: number[] = [];
  const signatureEvents = new Map<string, number[]>();

  return (event: SentryEventLike): boolean => {
    const timestamp = now();
    const cutoff = timestamp - windowMs;
    removeExpired(processEvents, cutoff);
    removeExpired(handledEvents, cutoff);

    for (const [signature, timestamps] of signatureEvents) {
      removeExpired(timestamps, cutoff);
      if (timestamps.length === 0) signatureEvents.delete(signature);
    }

    let signature: string;
    try {
      signature = eventSignature(event);
    } catch {
      return true;
    }

    const signatureTimestamps = signatureEvents.get(signature) ?? [];
    if (signatureTimestamps.length >= maxEventsPerSignature) return false;
    if (processEvents.length >= maxEventsPerProcess) return false;
    const highPriority = isHighPriorityEvent(event);
    if (!highPriority && handledEvents.length >= maxHandledEventsPerProcess) return false;

    signatureTimestamps.push(timestamp);
    signatureEvents.delete(signature);
    signatureEvents.set(signature, signatureTimestamps);
    while (signatureEvents.size > maxTrackedSignatures) {
      const oldest = signatureEvents.keys().next().value;
      if (oldest === undefined) break;
      signatureEvents.delete(oldest);
    }
    processEvents.push(timestamp);
    if (!highPriority) handledEvents.push(timestamp);
    return true;
  };
}
