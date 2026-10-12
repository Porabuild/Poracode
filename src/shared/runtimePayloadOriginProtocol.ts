import type { RuntimeEvent } from "./contracts";
import type { SupervisorEvent } from "./ipc/events";

/** Private custody format, deliberately independent of public hop16/wire12. */
export const RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION = 1;
export const RUNTIME_PAYLOAD_FORMAT_OWNER_KEY_MAX_LENGTH = 128;
export const RUNTIME_PAYLOAD_ORIGIN_MAX_ENTRIES = 20_000;
export const RUNTIME_PAYLOAD_ORIGIN_GENERATION_MAX_LENGTH = 128;
const PRIVATE_FIELD = "runtimePayloadOrigins";

export interface RuntimePayloadOrigin {
  readonly formatOwnerKey: string;
  readonly originFormatVersion: typeof RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION;
}

// Symbols travel with the bounded event itself (including object-spread retags),
// never in public/native data or JSON. No side map or independently ordered relay.
const producerOrigin = Symbol("captured runtime payload producer");
const admittedOrigin = Symbol("owned runtime payload admission");
const admissionBrand = Symbol("trusted runtime payload admission");
type CustodyEvent = RuntimeEvent & {
  [producerOrigin]?: RuntimePayloadOrigin;
  [admittedOrigin]?: RuntimePayloadOrigin;
};

export interface TrustedRuntimePayloadAdmission {
  readonly [admissionBrand]: true;
  readonly event: SupervisorEvent;
  /** Publication owns the decoded original; queued proof owns a separate payload clone. */
  readonly publicEvent: SupervisorEvent;
}

interface PrivateOrigins {
  version: typeof RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION;
  generation: string;
  /** Sparse, ordered positions in the FINAL coalesced/chunked envelope. */
  entries: Array<[batchIndex: number, eventIndex: number, formatOwnerKey: string]>;
}

export interface RuntimePayloadOriginNegotiation {
  control: "enable-runtime-payload-origins";
  version: typeof RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION;
  generation: string;
}

export function isRuntimePayloadOriginNegotiation(
  message: unknown,
): message is RuntimePayloadOriginNegotiation {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.control === "enable-runtime-payload-origins" &&
    candidate.version === RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION &&
    isRuntimePayloadOriginGeneration(candidate.generation)
  );
}

export function runtimePayloadOriginEnvelopeBytes(event: SupervisorEvent): number {
  let bytes = 0;
  for (const batch of runtimeBatches(event))
    for (const runtimeEvent of batch.events) bytes += runtimePayloadOriginEventBytes(runtimeEvent);
  return bytes;
}

export function isRuntimePayloadFormatOwnerKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= RUNTIME_PAYLOAD_FORMAT_OWNER_KEY_MAX_LENGTH &&
    /^[a-z0-9]/.test(value) &&
    !/[^a-z0-9._/-]/.test(value)
  );
}

export function isRuntimePayloadOriginGeneration(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= RUNTIME_PAYLOAD_ORIGIN_GENERATION_MAX_LENGTH &&
    !/[^\x21-\x7e]/.test(value)
  );
}

function ownsPayload(event: RuntimeEvent): boolean {
  if (event.type === "item.started" && event.itemType === "user_message") return false;
  return (
    (event.type === "item.started" ||
      event.type === "item.updated" ||
      event.type === "item.completed") &&
    event.payload !== undefined
  );
}

/** Internal SOURCE hook: call only after the actual adapter's generation guards. */
export function captureRuntimePayloadOrigin(
  event: RuntimeEvent,
  actualProducerFormatOwnerKey: string | undefined,
): RuntimeEvent {
  const clean = stripRuntimeEventPayloadOrigin(event);
  if (!ownsPayload(clean) || !isRuntimePayloadFormatOwnerKey(actualProducerFormatOwnerKey))
    return clean;
  return {
    ...clean,
    [producerOrigin]: Object.freeze({
      formatOwnerKey: actualProducerFormatOwnerKey,
      originFormatVersion: RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
    }),
  } as CustodyEvent;
}

/** Public/generic intake can never manufacture or replay private authority. */
export function stripRuntimeEventPayloadOrigin(event: RuntimeEvent): RuntimeEvent {
  const tagged = event as CustodyEvent & { runtimePayloadOrigins?: unknown };
  if (!(producerOrigin in tagged) && !(admittedOrigin in tagged) && !(PRIVATE_FIELD in tagged))
    return event;
  const clean = { ...tagged };
  delete clean[producerOrigin];
  delete clean[admittedOrigin];
  delete clean.runtimePayloadOrigins;
  return clean;
}

/** Only the writer's owned admission mark is SQL authority. */
export function readAdmittedRuntimePayloadOrigin(
  event: RuntimeEvent,
): RuntimePayloadOrigin | undefined {
  return (event as CustodyEvent)[admittedOrigin];
}

/** Covers sparse tuple/key, generation/header, and retained private object costs. */
export function runtimePayloadOriginEventBytes(event: RuntimeEvent): number {
  const tagged = event as CustodyEvent;
  const origin = tagged[admittedOrigin] ?? tagged[producerOrigin];
  return origin ? 512 + origin.formatOwnerKey.length * 2 : 0;
}

function runtimeBatches(
  event: SupervisorEvent,
): ReadonlyArray<{ threadId: string; events: RuntimeEvent[] }> {
  switch (event.type) {
    case "thread-runtime-event":
      return [{ threadId: event.threadId, events: [event.event] }];
    case "thread-runtime-events":
      return [{ threadId: event.threadId, events: event.events }];
    case "thread-runtime-events-multi":
      return event.batches;
    default:
      return [];
  }
}

/** Remove private envelope/batch/event fields on EVERY public publication branch. */
export function stripRuntimePayloadOriginMetadata<E extends { type: string }>(event: E): E {
  const clean = { ...event } as E & { runtimePayloadOrigins?: unknown };
  delete clean.runtimePayloadOrigins;
  const canonical = clean as unknown as SupervisorEvent;
  if (canonical.type === "thread-runtime-event") {
    canonical.event = stripRuntimeEventPayloadOrigin(canonical.event);
  } else if (canonical.type === "thread-runtime-events") {
    canonical.events = canonical.events.map(stripRuntimeEventPayloadOrigin);
  } else if (canonical.type === "thread-runtime-events-multi") {
    canonical.batches = canonical.batches.map((batch) => {
      const publicBatch = { ...batch } as typeof batch & { runtimePayloadOrigins?: unknown };
      delete publicBatch.runtimePayloadOrigins;
      publicBatch.events = batch.events.map(stripRuntimeEventPayloadOrigin);
      return publicBatch;
    });
  }
  return clean;
}

/** Called by the sender BEFORE enqueue/serialization, only after exact-boot negotiation. */
export function serializeRuntimePayloadOrigins(
  event: SupervisorEvent,
  generation: string | null,
): SupervisorEvent {
  const clean = stripRuntimePayloadOriginMetadata(event);
  if (!isRuntimePayloadOriginGeneration(generation)) return clean;
  const entries: PrivateOrigins["entries"] = [];
  runtimeBatches(event).forEach((batch, batchIndex) => {
    batch.events.forEach((runtimeEvent, eventIndex) => {
      const origin = (runtimeEvent as CustodyEvent)[producerOrigin];
      if (origin && ownsPayload(runtimeEvent))
        entries.push([batchIndex, eventIndex, origin.formatOwnerKey]);
    });
  });
  if (entries.length === 0 || entries.length > RUNTIME_PAYLOAD_ORIGIN_MAX_ENTRIES) return clean;
  return {
    ...clean,
    [PRIVATE_FIELD]: { version: RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION, generation, entries },
  } as SupervisorEvent & { runtimePayloadOrigins: PrivateOrigins };
}

/** Internal OWNED IPC boundary. A stale/unnegotiated/malformed envelope is wholly unknown. */
export function admitRuntimePayloadOriginEnvelope(
  event: SupervisorEvent,
  negotiatedGeneration: string | null,
): TrustedRuntimePayloadAdmission | undefined {
  if (!isRuntimePayloadOriginGeneration(negotiatedGeneration)) return undefined;
  const metadata = (event as SupervisorEvent & { runtimePayloadOrigins?: PrivateOrigins })
    .runtimePayloadOrigins;
  if (
    !metadata ||
    metadata.version !== RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION ||
    metadata.generation !== negotiatedGeneration ||
    !Array.isArray(metadata.entries) ||
    metadata.entries.length === 0 ||
    metadata.entries.length > RUNTIME_PAYLOAD_ORIGIN_MAX_ENTRIES
  )
    return undefined;
  const clean = stripRuntimePayloadOriginMetadata(event);
  const batches = runtimeBatches(clean);
  let previousBatch = -1;
  let previousEvent = -1;
  // Validate every binding BEFORE conferring any authority, including duplicates/order.
  for (const entry of metadata.entries) {
    if (!Array.isArray(entry) || entry.length !== 3) return undefined;
    const [batchIndex, eventIndex, key] = entry;
    if (
      !Number.isInteger(batchIndex) ||
      !Number.isInteger(eventIndex) ||
      batchIndex < 0 ||
      eventIndex < 0 ||
      batchIndex < previousBatch ||
      (batchIndex === previousBatch && eventIndex <= previousEvent) ||
      !isRuntimePayloadFormatOwnerKey(key)
    )
      return undefined;
    const runtimeEvent = batches[batchIndex]?.events[eventIndex];
    if (!runtimeEvent || !ownsPayload(runtimeEvent)) return undefined;
    previousBatch = batchIndex;
    previousEvent = eventIndex;
  }
  for (const [batchIndex, eventIndex, key] of metadata.entries) {
    const batch = batches[batchIndex]!;
    batch.events[eventIndex] = {
      // Own the decoded event independently of its public publication. A main/
      // WS subscriber mutating a published payload cannot alter queued proof.
      ...structuredClone(batch.events[eventIndex]!),
      [admittedOrigin]: Object.freeze({
        formatOwnerKey: key,
        originFormatVersion: RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
      }),
    } as CustodyEvent;
  }
  // A single envelope's temporary [event] array needs its changed element installed.
  if (clean.type === "thread-runtime-event") clean.event = batches[0]!.events[0]!;
  return {
    [admissionBrand]: true,
    event: clean,
    publicEvent: stripRuntimePayloadOriginMetadata(event),
  };
}

export function admittedRuntimePayloadBatch(
  admission: TrustedRuntimePayloadAdmission,
  batchIndex: number,
): { threadId: string; events: RuntimeEvent[] } {
  if (admission[admissionBrand] !== true)
    throw new Error("Runtime payload custody requires owned IPC admission.");
  const batch = runtimeBatches(admission.event)[batchIndex];
  if (!batch) throw new Error("Runtime payload custody batch does not exist.");
  return batch;
}
