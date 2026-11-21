import { selectThreadForkSnapshot } from "../../../src/shared/threadFork.ts";
import { LabHttpError } from "./labAuth.ts";

interface ForkRecord {
  readonly commandId: string;
  readonly request: Record<string, unknown>;
  readonly history: Record<string, unknown>;
}

export class LabThreadForkState {
  enabled = false;
  private readonly forks = new Map<string, ForkRecord>();

  reset(): void {
    this.enabled = false;
    this.forks.clear();
  }

  rows(): unknown[] {
    return [...this.forks.values()].map((fork) => structuredClone(fork.history.thread));
  }

  has(id: string): boolean {
    return this.forks.has(id);
  }

  snapshot(id: string, snapshotSeq: number): Record<string, unknown> | undefined {
    const fork = this.forks.get(id);
    return fork ? { ...structuredClone(fork.history), snapshotSeq } : undefined;
  }

  requests(): Record<string, unknown>[] {
    return [...this.forks.values()].map((fork) => structuredClone(fork.request));
  }

  create(
    id: string,
    commandId: string,
    request: Record<string, unknown>,
    source: Record<string, unknown>,
  ): void {
    const thread = source.thread as { id: string; title: string };
    if (
      !this.enabled ||
      !commandId ||
      thread.id !== request.sourceThreadId ||
      request.threadId !== id
    ) {
      throw new LabHttpError("invalid_fork", "Invalid fixture fork.", 400);
    }
    const prior = this.forks.get(id);
    if (prior) {
      if (
        prior.commandId === commandId &&
        prior.request.title === request.title &&
        prior.request.sourceThreadId === request.sourceThreadId &&
        prior.request.throughItemId === request.throughItemId
      )
        return;
      throw new LabHttpError("thread_already_exists", "Thread already exists.", 409);
    }
    const selected = selectThreadForkSnapshot(
      source.runtimeItems as Parameters<typeof selectThreadForkSnapshot>[0],
      source.completedTurns as Parameters<typeof selectThreadForkSnapshot>[1],
      typeof request.throughItemId === "string" ? request.throughItemId : undefined,
    );
    this.forks.set(id, {
      commandId,
      request: structuredClone(request),
      history: {
        ...source,
        runtimeItems: selected.items,
        completedTurns: selected.turns,
        thread: {
          ...thread,
          id,
          title: request.title,
          status: "inactive",
          forkedFrom: {
            version: 1,
            threadId: thread.id,
            title: thread.title,
            throughItemId: selected.throughItemId,
            inheritedTurnCount: selected.turns.length,
            contextStrategy: "transcript",
          },
        },
      },
    });
  }
}
