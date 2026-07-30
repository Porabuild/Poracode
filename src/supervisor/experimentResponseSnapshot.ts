import { createHash } from "node:crypto";
import type { JudgeExperimentCandidate, JudgeExperimentSnapshotPayload } from "@/shared/contracts";
import { msg } from "@/shared/messages";

export interface ExperimentResponseSnapshot {
  hash: string;
  candidates: JudgeExperimentCandidate[];
}

export function captureExperimentResponseSnapshot(
  payload: JudgeExperimentSnapshotPayload,
  readTerminalScrollback: (threadId: string) => string,
  onCaptured?: (candidate: { threadId: string; characters: number }) => void,
): ExperimentResponseSnapshot {
  const responseByThreadId = new Map(
    payload.responses?.map((candidate) => [candidate.threadId, candidate.response] as const),
  );
  const candidates = payload.candidates.map((candidate) => {
    const response =
      responseByThreadId.get(candidate.threadId)?.trim() ||
      readTerminalScrollback(candidate.threadId).trim();
    if (!response) {
      throw new Error(msg("experiment.judge.noResponse", { threadId: candidate.threadId }));
    }
    onCaptured?.({ threadId: candidate.threadId, characters: response.length });
    return { threadId: candidate.threadId, diff: response };
  });
  const hash = createHash("sha256");
  for (const candidate of candidates) {
    hash.update(candidate.threadId);
    hash.update("\0");
    hash.update(candidate.diff);
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), candidates };
}
