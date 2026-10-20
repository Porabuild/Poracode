import type { ForgeRepository } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import type { IpcProcedurePayload } from "@/shared/ipc";

export function reviewSourceIdentity(source: ForgeRepository | undefined): string | undefined {
  return source
    ? JSON.stringify([
        source.forge,
        source.host,
        source.repository,
        source.account?.forge,
        source.account?.host,
        source.account?.login,
      ])
    : undefined;
}

/** Device-local viewed ticks. A sourced review never shares the legacy project key. */
export function reviewViewedScope(
  source: ForgeRepository | undefined,
  projectId: string,
  prNumber: number,
): string {
  const identity = reviewSourceIdentity(source);
  return identity ? `${identity}#${prNumber}` : `legacy:${projectId}#${prNumber}`;
}

/** Cached files and diffs stay hidden until they belong to the row now on screen. */
export function reviewCacheMatchesSource(
  rowSource: ForgeRepository | undefined,
  cachedSource: ForgeRepository | undefined,
): boolean {
  return reviewSourceIdentity(rowSource) === reviewSourceIdentity(cachedSource);
}

/** Optional metadata is the negotiation: old hosts keep the legacy call names. */
export function reviewClient(source?: ForgeRepository) {
  const bridge = readBridge();
  const account = source
    ? {
        forgeRepository: source.repository,
        ...(source.account ? { forgeAccount: source.account } : {}),
      }
    : {};
  return {
    forBranch: (input: IpcProcedurePayload<"ghGetPrForBranch">) =>
      source
        ? bridge.forgeGetPrForBranch({ ...input, ...account })
        : bridge.ghGetPrForBranch(input),
    details: (input: IpcProcedurePayload<"ghGetPrDetails">) =>
      source ? bridge.forgeGetPrDetails({ ...input, ...account }) : bridge.ghGetPrDetails(input),
    threads: (input: IpcProcedurePayload<"ghGetPrReviewComments">) =>
      source
        ? bridge.forgeGetPrReviewComments({ ...input, ...account })
        : bridge.ghGetPrReviewComments(input),
    files: (input: IpcProcedurePayload<"ghGetPrFiles">) =>
      source ? bridge.forgeGetPrFiles({ ...input, ...account }) : bridge.ghGetPrFiles(input),
    diff: (input: IpcProcedurePayload<"ghGetPrDiff">) =>
      source ? bridge.forgeGetPrDiff({ ...input, ...account }) : bridge.ghGetPrDiff(input),
    comment: (input: IpcProcedurePayload<"ghPostPrComment">) =>
      source ? bridge.forgePostPrComment({ ...input, ...account }) : bridge.ghPostPrComment(input),
    review: (input: IpcProcedurePayload<"ghSubmitPrReview">) =>
      source
        ? bridge.forgeSubmitPrReview({ ...input, ...account })
        : bridge.ghSubmitPrReview(input),
    merge: (input: IpcProcedurePayload<"ghMergePr">, expectedHeadSha?: string) => {
      if (expectedHeadSha !== undefined) {
        const payload = { ...input, ...account, expectedHeadSha };
        return source ? bridge.forgeMergePrAtHead(payload) : bridge.ghMergePrAtHead(payload);
      }
      return source ? bridge.forgeMergePr({ ...input, ...account }) : bridge.ghMergePr(input);
    },
    close: (input: IpcProcedurePayload<"ghClosePr">) =>
      source ? bridge.forgeClosePr({ ...input, ...account }) : bridge.ghClosePr(input),
    ready: (input: IpcProcedurePayload<"ghMarkPrReady">) =>
      source ? bridge.forgeMarkPrReady({ ...input, ...account }) : bridge.ghMarkPrReady(input),
    updateBranch: (input: IpcProcedurePayload<"ghUpdatePrBranch">) =>
      source
        ? bridge.forgeUpdatePrBranch({ ...input, ...account })
        : bridge.ghUpdatePrBranch(input),
    edit: (input: IpcProcedurePayload<"forgeEditPr">) =>
      bridge.forgeEditPr(source ? { ...input, ...account } : input),
    editComment: (input: IpcProcedurePayload<"forgeEditPrComment">) =>
      bridge.forgeEditPrComment(source ? { ...input, ...account } : input),
  };
}
