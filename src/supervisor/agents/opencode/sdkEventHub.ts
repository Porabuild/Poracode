import type { Event } from "@opencode-ai/sdk/v2";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";

interface OpenCodeEventSubscriber {
  directory: string;
  onEvent(event: Event): void;
}

interface QueuedOpenCodeEvent {
  directory: string;
  payload: Event;
}

interface SubscribeOpenCodeServerEventsInput extends OpenCodeEventSubscriber {
  eventClient: OpencodeClient;
}

const hubs = new WeakMap<OpencodeClient, OpenCodeEventHub>();

const FLUSH_FRAME_MS = 16;
const STREAM_YIELD_MS = 8;
const RECONNECT_DELAY_MS = 250;
const HEARTBEAT_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  return (
    error !== null && typeof error === "object" && "name" in error && error.name === "AbortError"
  );
}

function coalescedKey(event: QueuedOpenCodeEvent): string | undefined {
  if (event.payload.type === "lsp.updated") return `lsp.updated:${event.directory}`;
  if (event.payload.type === "message.part.updated") {
    const part = event.payload.properties.part;
    return `message.part.updated:${event.directory}:${part.messageID}:${part.id}`;
  }
  return undefined;
}

function enqueueOpenCodeEvent(queue: QueuedOpenCodeEvent[], event: QueuedOpenCodeEvent): boolean {
  const key = coalescedKey(event);
  const previous = queue[queue.length - 1];
  if (key && previous && coalescedKey(previous) === key) {
    queue[queue.length - 1] = event;
    return false;
  }
  queue.push(event);
  return true;
}

function coalesceOpenCodeEvents(events: QueuedOpenCodeEvent[]): QueuedOpenCodeEvent[] {
  const output: QueuedOpenCodeEvent[] = [];
  for (const event of events) {
    if (event.payload.type !== "message.part.delta") {
      output.push(event);
      continue;
    }

    const previous = output[output.length - 1];
    if (
      !previous ||
      previous.payload.type !== "message.part.delta" ||
      previous.directory !== event.directory ||
      previous.payload.properties.messageID !== event.payload.properties.messageID ||
      previous.payload.properties.partID !== event.payload.properties.partID ||
      previous.payload.properties.field !== event.payload.properties.field
    ) {
      output.push({
        directory: event.directory,
        payload: { ...event.payload, properties: { ...event.payload.properties } },
      });
      continue;
    }

    output[output.length - 1] = {
      directory: event.directory,
      payload: {
        ...event.payload,
        properties: {
          ...event.payload.properties,
          delta: previous.payload.properties.delta + event.payload.properties.delta,
        },
      },
    };
  }
  return output;
}

function unwrapGlobalOpenCodeEvent(raw: unknown): QueuedOpenCodeEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const envelope = raw as { directory?: unknown; payload?: unknown };
  // Server-wide `server.connected` and `server.heartbeat` envelopes have no
  // directory. They keep the stream alive but are not routed to sessions.
  if (typeof envelope.directory !== "string") return undefined;
  if (!envelope.payload || typeof envelope.payload !== "object") return undefined;
  const type = (envelope.payload as { type?: unknown }).type;
  if (typeof type !== "string" || type === "sync") return undefined;
  return { directory: envelope.directory, payload: envelope.payload as Event };
}

class OpenCodeEventHub {
  private readonly eventClient: OpencodeClient;
  private readonly subscribersByDirectory = new Map<string, Set<OpenCodeEventSubscriber>>();
  private queue: QueuedOpenCodeEvent[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private streamAbort: AbortController | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private running = false;
  private generation = 0;
  private lastFlushAt = 0;
  private streamErrorLogged = false;

  constructor(eventClient: OpencodeClient) {
    this.eventClient = eventClient;
  }

  subscribe(subscriber: OpenCodeEventSubscriber): () => void {
    let subscribers = this.subscribersByDirectory.get(subscriber.directory);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribersByDirectory.set(subscriber.directory, subscribers);
    }
    subscribers.add(subscriber);
    if (!this.running) this.start();

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.subscribersByDirectory.delete(subscriber.directory);
      if (this.subscribersByDirectory.size === 0) this.stop();
    };
  }

  private start(): void {
    this.running = true;
    const generation = ++this.generation;
    void this.consume(generation);
  }

  private stop(): void {
    this.running = false;
    this.generation += 1;
    this.streamAbort?.abort();
    this.streamAbort = undefined;
    this.clearHeartbeat();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.queue = [];
    if (hubs.get(this.eventClient) === this) hubs.delete(this.eventClient);
  }

  private async consume(generation: number): Promise<void> {
    while (this.running && this.generation === generation) {
      const streamAbort = new AbortController();
      this.streamAbort = streamAbort;
      try {
        const events = await this.eventClient.global.event({
          signal: streamAbort.signal,
          onSseError: (error) => this.logStreamError(error, streamAbort.signal),
        });
        let yieldedAt = Date.now();
        this.resetHeartbeat(streamAbort);
        for await (const raw of events.stream) {
          // OpenCode's 1.18.3 global route emits an untyped server.heartbeat
          // envelope every 10 seconds. Reset before filtering because that
          // server-wide envelope intentionally has no directory.
          this.resetHeartbeat(streamAbort);
          this.streamErrorLogged = false;
          const event = unwrapGlobalOpenCodeEvent(raw);
          if (event && enqueueOpenCodeEvent(this.queue, event)) this.scheduleFlush();

          if (Date.now() - yieldedAt < STREAM_YIELD_MS) continue;
          yieldedAt = Date.now();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        this.logStreamError(error, streamAbort.signal);
      } finally {
        if (this.streamAbort === streamAbort) this.streamAbort = undefined;
        this.clearHeartbeat();
      }

      if (!this.running || this.generation !== generation) return;
      await new Promise<void>((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }

  private logStreamError(error: unknown, signal: AbortSignal): void {
    if (isAbortError(error) || signal.aborted || this.streamErrorLogged) return;
    this.streamErrorLogged = true;
    console.error("[opencode] global event stream failed:", error);
  }

  private resetHeartbeat(streamAbort: AbortController): void {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.refresh();
      return;
    }
    this.heartbeatTimer = setTimeout(() => streamAbort.abort(), HEARTBEAT_TIMEOUT_MS);
    this.heartbeatTimer.unref?.();
  }

  private clearHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    const elapsed = Date.now() - this.lastFlushAt;
    this.flushTimer = setTimeout(() => this.flush(), Math.max(0, FLUSH_FRAME_MS - elapsed));
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.queue.length === 0) return;

    const events = coalesceOpenCodeEvents(this.queue);
    this.queue = [];
    this.lastFlushAt = Date.now();
    for (const event of events) {
      const subscribers = this.subscribersByDirectory.get(event.directory);
      if (!subscribers) continue;
      for (const subscriber of subscribers) {
        try {
          subscriber.onEvent(event.payload);
        } catch (error) {
          console.error("[opencode] event subscriber failed:", error);
        }
      }
    }
  }
}

export function subscribeOpenCodeServerEvents(
  input: SubscribeOpenCodeServerEventsInput,
): () => void {
  let hub = hubs.get(input.eventClient);
  if (!hub) {
    hub = new OpenCodeEventHub(input.eventClient);
    hubs.set(input.eventClient, hub);
  }
  return hub.subscribe({ directory: input.directory, onEvent: input.onEvent });
}
