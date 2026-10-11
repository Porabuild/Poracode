import { remoteShellSnapshotSchema } from "../../../src/shared/remote/protocol.ts";
import { buildShellSnapshot } from "./labFixtures.ts";

export interface ParitySnapshotExtras {
  readonly gitSummariesByThread?: Record<string, unknown>;
  readonly gitState?: Record<string, unknown>;
  /** Additive fixture seam; this key is not part of the current generated snapshot contract. */
  readonly agentCaches?: Record<string, unknown>;
}

export function buildParitySnapshot(
  snapshotSeq: number,
  extras: ParitySnapshotExtras = {},
): Record<string, unknown> {
  const snapshot = {
    ...buildShellSnapshot(snapshotSeq),
    ...(extras.gitSummariesByThread
      ? { gitSummariesByThread: structuredClone(extras.gitSummariesByThread) }
      : {}),
    ...(extras.gitState ? { gitState: structuredClone(extras.gitState) } : {}),
    ...(extras.agentCaches ? { agentCaches: structuredClone(extras.agentCaches) } : {}),
  };
  validateParitySnapshot(snapshot);
  return snapshot;
}

export function validateParitySnapshot(snapshot: Record<string, unknown>): void {
  const { agentCaches: _agentCaches, ...canonicalEnvelope } = snapshot;
  remoteShellSnapshotSchema.parse(canonicalEnvelope);
}
