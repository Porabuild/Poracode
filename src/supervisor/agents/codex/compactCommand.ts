import type { RuntimeEvent } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { StructuredTurnResult } from "../base";

/**
 * Codex's manual `/compact`. Only the bare command is intercepted: the Codex
 * TUI's `/compact` takes no arguments, so `/compact <text>` keeps its literal
 * meaning and reaches the model as an ordinary prompt.
 */
export function isCodexCompactCommand(prompt: string): boolean {
  return prompt.trim() === "/compact";
}

/** Session operations the compact command needs; supplied by `CodexStructuredSession`. */
export interface CodexCompactCommandHost {
  readonly localThreadId: string;
  /** True while any turn (user, goal, or internal compaction) runs on the thread. */
  hasActiveTurn(): boolean;
  /** `thread/compact/start` for the provider thread. */
  startCompaction(): Promise<unknown>;
  emitRuntimeEvents(events: RuntimeEvent[]): void;
  /** Mark the thread working until the server's compact turn settles it. */
  markWorking(): void;
  /** Settle the thread after a compaction that never started. */
  settleWithoutTurn(): void;
}

const COMPLETED_WITHOUT_TURN: StructuredTurnResult = { outcome: "completed-without-turn" };

/**
 * Run `/compact` through `thread/compact/start`. The server executes compaction
 * as its own turn (`turn/started` → `contextCompaction` item → `turn/completed`),
 * so the normal notification path renders the compaction row and settles the
 * thread; only the user's command bubble is painted locally.
 *
 * Verified against app-server 0.155.1: `thread/compact/start` does NOT reject
 * while a turn is running — it interrupts that turn and compacts instead. A
 * running turn is therefore refused here, before the request, with a notice.
 */
export async function runCodexCompactCommand(
  host: CodexCompactCommandHost,
  userEvents: readonly RuntimeEvent[],
): Promise<void | StructuredTurnResult> {
  host.emitRuntimeEvents([...userEvents]);
  if (host.hasActiveTurn()) {
    host.emitRuntimeEvents([
      {
        type: "error",
        threadId: host.localThreadId,
        message: msg("codex.compactUnavailableDuringTurn"),
      },
    ]);
    return COMPLETED_WITHOUT_TURN;
  }

  host.markWorking();
  try {
    await host.startCompaction();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    host.emitRuntimeEvents([
      {
        type: "error",
        threadId: host.localThreadId,
        message: msg("codex.compactFailed", { detail }),
      },
    ]);
    host.settleWithoutTurn();
    return COMPLETED_WITHOUT_TURN;
  }
  // The server owns the compact turn's lifecycle from here.
  return undefined;
}
