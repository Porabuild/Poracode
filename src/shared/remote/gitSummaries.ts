import type { GitStatusResult, PrData } from "../contracts";
import type { RemoteThreadGitSummary } from "./protocol/core";

/**
 * Wire summary for one thread's checkout, shared by the host projection
 * (`gitSummariesProjection.ts`) and the renderer publisher
 * (`remoteGitSummaries.ts`) so both produce the exact same shape.
 */
export function toRemoteThreadGitSummary(
  status: Pick<
    GitStatusResult,
    "isRepo" | "branch" | "totalInsertions" | "totalDeletions" | "ahead" | "behind"
  >,
  pr: PrData | null,
): RemoteThreadGitSummary {
  return {
    isRepo: status.isRepo,
    branch: status.branch,
    totalInsertions: status.totalInsertions,
    totalDeletions: status.totalDeletions,
    ahead: status.ahead,
    behind: status.behind,
    pr: pr
      ? {
          number: pr.number,
          state: pr.state,
          title: pr.title,
          url: pr.url,
          isDraft: pr.isDraft,
          ...(pr.checksStatus ? { checksStatus: pr.checksStatus } : {}),
        }
      : null,
  };
}
