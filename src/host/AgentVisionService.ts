import {
  AGENT_VISION_VERSION,
  AGENT_VISION_STREAM_VERSION,
  AGENT_VISION_FRAME_INTERVAL_MS,
  agentVisionSchema,
  type AgentVision,
  type AgentVisionFrame,
} from "@/shared/agentVision";

interface VisionEntry {
  state: AgentVision;
  capture?: () => Promise<AgentVisionFrame | null>;
  pending?: Promise<void>;
  lastCapture: number;
}

interface VisionObservation {
  target?: string;
  capture?: () => Promise<AgentVisionFrame | null>;
  failed?: boolean;
}

/** Host-owned, bounded observations. Captures run only while a client watches. */
export class AgentVisionService {
  private readonly entries = new Map<string, VisionEntry>();

  begin(
    threadId: string,
    source: AgentVision["source"],
    toolName: string,
    observation: Omit<VisionObservation, "failed"> = {},
  ): {
    finish: (options?: VisionObservation) => void;
  } {
    const entry: VisionEntry = {
      state: {
        version: AGENT_VISION_VERSION,
        streamVersion: AGENT_VISION_STREAM_VERSION,
        source,
        toolName,
        status: "running",
        updatedAt: Date.now(),
        ...(observation.target ? { target: observation.target } : {}),
      },
      ...(observation.capture ? { capture: observation.capture } : {}),
      lastCapture: 0,
    };
    this.entries.delete(threadId);
    this.entries.set(threadId, entry);
    while (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
    return {
      finish: (options = {}) => {
        if (this.entries.get(threadId) !== entry) return;
        if (options.target && options.target !== entry.state.target) {
          delete entry.state.image;
          delete entry.state.capturedAt;
        }
        entry.state = {
          ...entry.state,
          status: options.failed ? "error" : "idle",
          updatedAt: Date.now(),
          ...(options.target ? { target: options.target } : {}),
        };
        if (options.capture) entry.capture = options.capture;
      },
    };
  }

  stop(threadId: string): void {
    // Replacing the entry fences a capture already in flight.
    const entry = this.entries.get(threadId);
    if (entry)
      this.entries.set(threadId, {
        state: { ...entry.state, status: "idle", updatedAt: Date.now() },
        lastCapture: entry.lastCapture,
      });
  }

  stopAll(): void {
    for (const threadId of this.entries.keys()) this.stop(threadId);
  }

  async read(threadId: string, preview = true, streaming = false): Promise<AgentVision | null> {
    const entry = this.entries.get(threadId);
    if (!entry) return null;
    if (entry.state.status !== "running" && Date.now() - entry.state.updatedAt > 5 * 60_000) {
      this.entries.delete(threadId);
      return null;
    }
    if (
      preview &&
      entry.capture &&
      (entry.state.status === "running" || Date.now() - entry.state.updatedAt < 30_000) &&
      Date.now() - entry.lastCapture >= (streaming ? AGENT_VISION_FRAME_INTERVAL_MS : 1000)
    ) {
      if (!entry.pending) {
        const observedState = entry.state;
        entry.lastCapture = Date.now();
        entry.pending = entry
          .capture()
          .then((frame) => {
            if (this.entries.get(threadId) !== entry || entry.state !== observedState || !frame)
              return;
            const state = agentVisionSchema.safeParse({
              ...entry.state,
              ...frame,
              capturedAt: Date.now(),
            });
            if (state.success) entry.state = state.data;
          })
          .catch(() => {
            // A closed tab or revoked window must not fail the agent's tool call.
          })
          .finally(() => {
            delete entry.pending;
          });
      }
    }
    if (preview) await entry.pending;
    if (this.entries.get(threadId) !== entry) return this.read(threadId, false);
    if (!preview) {
      const metadata = { ...entry.state };
      delete metadata.image;
      return metadata;
    }
    return entry.state;
  }

  dispose(): void {
    this.entries.clear();
  }
}
