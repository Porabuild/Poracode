import { create } from "zustand";
import { TranscriptBuffer } from "@/shared/transcriptBuffer";

/**
 * Renderer-side append-only PTY scrollback for agent (terminal-presentation)
 * threads and action-owned terminal tabs.
 *
 * The supervisor keeps a raw byte transcript (`outputTranscript`) for every
 * live session, but agent thread panes are unmounted when the user switches
 * away, so the xterm buffer is destroyed and the only restore source is a
 * bridge round-trip that (a) can be invalidated by the `thread-reset` emitted
 * on every spawn and (b) truncates to 100k chars. Repaint-in-place TUIs
 * (Claude no-flicker, Command Code) only ever write their current frame, so
 * replaying raw bytes gives the latest frame but no scrollback.
 *
 * This store keeps a bounded append-only copy of each thread's PTY bytes.
 * The global supervisor-event handler feeds subscribed `thread-output` here,
 * and action launch routing does the same for local and remote action
 * terminals. Hidden local threads no longer cross the UI-process boundary;
 * `XTermSurface` falls back to the supervisor transcript when it remounts.
 */
interface ThreadOutputState {
  /** threadId -> raw PTY bytes, oldest to newest, capped at MAX_BYTES. */
  buffers: Record<string, TranscriptBuffer>;
  appendOutput: (threadId: string, data: string) => void;
  clearOutput: (threadId: string) => void;
  retainOutputs: (threadIds: ReadonlySet<string>) => void;
  readTail: (threadId: string, limit: number) => string;
}

/**
 * Per-thread byte cap. xterm's own buffer is 5,000 lines and the supervisor
 * transcript is 200k chars; a renderer copy anywhere near those keeps a
 * long Command Code session scrollback without unbounded memory growth.
 */
const MAX_BYTES = 500_000;

export const useThreadOutputStore = create<ThreadOutputState>()((set, get) => ({
  buffers: {},

  appendOutput: (threadId, data) => {
    if (!data) return;
    const existing = get().buffers[threadId];
    if (existing) {
      existing.append(data);
      return;
    }
    set((state) => {
      const buffer = new TranscriptBuffer(MAX_BYTES);
      buffer.append(data);
      return { buffers: { ...state.buffers, [threadId]: buffer } };
    });
  },

  clearOutput: (threadId) =>
    set((state) => {
      if (!(threadId in state.buffers)) return {};
      const buffers = { ...state.buffers };
      delete buffers[threadId];
      return { buffers };
    }),

  retainOutputs: (threadIds) =>
    set((state) => {
      const entries = Object.entries(state.buffers).filter(([threadId]) => threadIds.has(threadId));
      if (entries.length === Object.keys(state.buffers).length) return {};
      return { buffers: Object.fromEntries(entries) };
    }),

  readTail: (threadId, limit) => {
    if (limit <= 0) return "";
    return get().buffers[threadId]?.readTail(limit) ?? "";
  },
}));
