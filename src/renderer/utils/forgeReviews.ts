import type { ForgeAccountRef, ForgeRepository } from "@/shared/contracts";
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
    reopen: (input: IpcProcedurePayload<"ghReopenPr">) =>
      source ? bridge.forgeReopenPr({ ...input, ...account }) : bridge.ghReopenPr(input),
  };
}

type ScopedInput<Name extends keyof ScopedProcedures> = Omit<
  IpcProcedurePayload<Name>,
  "forgeAccount" | "forgeRepository"
>;
interface ScopedProcedures {
  forgeListPrLabelCandidates: true;
  forgeListPrReviewerCandidates: true;
  forgeSetPrLabels: true;
  forgeRequestPrReviewers: true;
  forgeConvertPrToDraft: true;
  forgeGetPrCommitDiff: true;
  forgeSetPrReaction: true;
  forgeSubmitPrReviewDraft: true;
}

/**
 * Operations that exist only on account-scoped hosts. Callers check the matching
 * capability first; a source without an account has none of them.
 */
export function scopedReviewClient(source: ForgeRepository & { account: ForgeAccountRef }) {
  const bridge = readBridge();
  const scope = { forgeAccount: source.account, forgeRepository: source.repository };
  return {
    labelCandidates: (input: ScopedInput<"forgeListPrLabelCandidates">) =>
      bridge.forgeListPrLabelCandidates({ ...input, ...scope }),
    reviewerCandidates: (input: ScopedInput<"forgeListPrReviewerCandidates">) =>
      bridge.forgeListPrReviewerCandidates({ ...input, ...scope }),
    setLabels: (input: ScopedInput<"forgeSetPrLabels">) =>
      bridge.forgeSetPrLabels({ ...input, ...scope }),
    requestReviewers: (input: ScopedInput<"forgeRequestPrReviewers">) =>
      bridge.forgeRequestPrReviewers({ ...input, ...scope }),
    convertToDraft: (input: ScopedInput<"forgeConvertPrToDraft">) =>
      bridge.forgeConvertPrToDraft({ ...input, ...scope }),
    commitDiff: (input: ScopedInput<"forgeGetPrCommitDiff">) =>
      bridge.forgeGetPrCommitDiff({ ...input, ...scope }),
    react: (input: ScopedInput<"forgeSetPrReaction">) =>
      bridge.forgeSetPrReaction({ ...input, ...scope }),
    submitDraft: (input: ScopedInput<"forgeSubmitPrReviewDraft">) =>
      bridge.forgeSubmitPrReviewDraft({ ...input, ...scope }),
  };
}

/** The scoped client when this source has a pinned account, otherwise undefined. */
export function scopedReviewSource(
  source: ForgeRepository | undefined,
): (ForgeRepository & { account: ForgeAccountRef }) | undefined {
  return source?.account ? (source as ForgeRepository & { account: ForgeAccountRef }) : undefined;
}
