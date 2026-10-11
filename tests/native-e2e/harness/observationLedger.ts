import { sortedUniqueCodePoints } from "./sort.ts";
import { NATIVE_E2E_OBSERVATION_JOURNAL_VERSION } from "./versions.ts";

export interface GitStateInterestObservation {
  readonly messageId: string;
  readonly socketId: string;
  readonly sessionId: string;
  readonly interests: readonly Record<string, unknown>[];
  readonly cleared: boolean;
  readonly targetKeys: readonly string[];
  readonly duplicateTargetKeys: readonly string[];
  readonly targetLimitExceeded: boolean;
}

export interface ObservationJournalSnapshot {
  readonly formatVersion: typeof NATIVE_E2E_OBSERVATION_JOURNAL_VERSION;
  readonly operationIds: readonly string[];
  readonly operations: readonly WireOperationObservation[];
  readonly messages: readonly GitStateInterestObservation[];
}

export interface WireOperationObservation {
  readonly ordinal: number;
  readonly operationId: string;
  readonly method?: string;
  readonly path?: string;
  readonly lastSeenSeq?: number | null;
}

/**
 * Host-local wire observations. The operation index is sorted/deduplicated,
 * but message payloads retain arrival order and the exact interest ordering.
 */
export class ObservationLedger {
  private readonly messagesValue: GitStateInterestObservation[] = [];
  private readonly operationsValue: WireOperationObservation[] = [];
  private readonly operationAuditValue: WireOperationObservation[] = [];
  private readonly operationIdsValue = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private nextMessage = 0;

  get listenerCount(): number {
    return this.listeners.size;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recordOperation(
    operationId: string,
    details?: Omit<WireOperationObservation, "ordinal" | "operationId">,
  ): void {
    const observation = {
      ordinal: this.operationAuditValue.length + 1,
      operationId,
      ...details,
    };
    this.operationsValue.push(observation);
    this.operationAuditValue.push(observation);
    this.notify();
  }

  recordGitStateInterests(
    socketId: string,
    sessionId: string,
    interests: readonly Record<string, unknown>[],
  ): void {
    const targetKeys = interests
      .filter((interest) => interest.kind === "target")
      .map(
        (interest) => `${String(interest.projectId)}\u0000${String(interest.worktreePath ?? "")}`,
      );
    const seen = new Set<string>();
    const duplicateTargetKeys = targetKeys.filter((key) => {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    this.messagesValue.push({
      messageId: `git-state-interests-${String(++this.nextMessage)}`,
      socketId,
      sessionId,
      interests: structuredClone(interests),
      cleared: interests.length === 0,
      targetKeys: [...targetKeys],
      duplicateTargetKeys: [...duplicateTargetKeys],
      targetLimitExceeded: targetKeys.length > 4,
    });
    this.operationIdsValue.add("ws-client:git-state-interests");
    this.notify();
  }

  snapshot(): ObservationJournalSnapshot {
    return {
      formatVersion: NATIVE_E2E_OBSERVATION_JOURNAL_VERSION,
      operationIds: sortedUniqueCodePoints(this.operationIdsValue),
      operations: structuredClone(this.operationsValue),
      messages: structuredClone(this.messagesValue),
    };
  }

  auditOperations(): readonly WireOperationObservation[] {
    return structuredClone(this.operationAuditValue);
  }

  reset(): void {
    this.messagesValue.length = 0;
    this.operationsValue.length = 0;
    this.operationIdsValue.clear();
    this.nextMessage = 0;
    this.notify();
  }

  dispose(): void {
    this.messagesValue.length = 0;
    this.operationsValue.length = 0;
    this.operationAuditValue.length = 0;
    this.operationIdsValue.clear();
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
