import type { CanonicalItemType, RuntimeContentStreamKind } from "@/shared/contracts";
import type { RuntimeStreamRetention } from "./runtimeStreamRetention";

// Type-only module so presentation code (and the TUI transcript, which runs the
// desktop's presentation modules) can name chat items without loading the slice.

/** Per-thread record of canonical chat items, derived from RuntimeEvent streams. */
export interface RuntimeChatItem {
  /** Presentation-only marker; full stored bodies are loaded on expansion. */
  detailsDeferred?: true;
  id: string;
  type: CanonicalItemType;
  /** "started" / "updated" land on items that haven't ended yet; "completed" → final. */
  state: "started" | "updated" | "completed";
  /** Local wall-clock timing for delegated-agent parents. Not persisted; provider duration is the reload fallback. */
  startedAt?: number;
  completedAt?: number;
  /** Last payload object reported via `item.started` or `item.updated`. */
  payload?: unknown;
  /** Streamed content buckets (markdown text, command output, etc.). */
  streams: Partial<Record<RuntimeContentStreamKind, string>>;
  /**
   * Session-local offsets/counts for bounded stream projections. Stored on the
   * item so eviction/reset also releases them; never serialized or persisted.
   * The strings above remain the display/copy representation, including gaps.
   */
  streamRetention?: Partial<Record<RuntimeContentStreamKind, RuntimeStreamRetention>>;
  /**
   * Identifier of a parent tool_call row when this item was emitted by a
   * sub-agent (e.g. items inside a Claude `Task` tool use). Set on
   * `item.started` and immutable thereafter. The chat timeline groups children
   * under their parent row instead of listing them as top-level entries.
   */
  parentItemId?: string;
  /**
   * True when this item was first seen via the LIVE event stream in the current
   * app session (`item.started`), as opposed to being seeded from the DB on
   * thread open (`hydrateThreadRuntimeItems`). Scopes background-workflow
   * liveness: a detached workflow only keeps running if THIS session launched
   * it, so a row replayed from a prior session's transcript must never light
   * the working spinner (manifest status can't tell - a crashed run stays
   * pinned "running" on disk). Never persisted; absent on DB-hydrated items.
   */
  observedLive?: boolean;
}
