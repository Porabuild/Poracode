import { z } from "zod";
import {
  forgeEditPrCommentPayloadSchema,
  forgeGetPrCommitDiffPayloadSchema,
  forgeListPrReviewerCandidatesPayloadSchema,
  forgePrViewedFilesResultSchema,
  forgeRequestPrReviewersPayloadSchema,
  forgeScopedPrPayloadSchema,
  forgeSetPrFileViewedPayloadSchema,
  forgeSetPrLabelsPayloadSchema,
  forgeSetPrReactionPayloadSchema,
  forgeSubmitPrReviewDraftPayloadSchema,
  ghGetPrDetailsResultSchema,
} from "@/shared/contracts";
import { runRemoteCommand } from "@/host/remote/server/remoteCommandIdempotency";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { syncPullRequest } from "./github";
import { scopedReviewContext } from "./reviews";
import { capDiff, requireAppRuntime, requireProject, type AppControlsToolContext } from "./types";

const target = forgeScopedPrPayloadSchema
  .omit({ projectLocation: true })
  .extend({ projectId: z.string().min(1) })
  .strict();
const write = target.extend({ operationKey: z.string().min(8).max(128) });
const reviewActionSchema = z.discriminatedUnion("action", [
  target.extend({ action: z.literal("list_labels") }),
  target.extend({
    action: z.literal("list_reviewers"),
    ...forgeListPrReviewerCandidatesPayloadSchema.pick({ query: true }).shape,
  }),
  target.extend({ action: z.literal("viewed_files") }),
  target.extend({
    action: z.literal("commit_diff"),
    ...forgeGetPrCommitDiffPayloadSchema.pick({ commit: true }).shape,
  }),
  write.extend({
    action: z.literal("set_labels"),
    ...forgeSetPrLabelsPayloadSchema.pick({ add: true, remove: true }).shape,
  }),
  write.extend({
    action: z.literal("request_reviewers"),
    ...forgeRequestPrReviewersPayloadSchema.pick({ add: true, remove: true }).shape,
  }),
  write.extend({ action: z.literal("convert_to_draft") }),
  write.extend({
    action: z.literal("set_file_viewed"),
    ...forgeSetPrFileViewedPayloadSchema.pick({ path: true, fingerprint: true }).shape,
  }),
  write.extend({
    action: z.literal("edit_comment"),
    ...forgeEditPrCommentPayloadSchema.pick({
      commentId: true,
      threadId: true,
      body: true,
      expectedBody: true,
    }).shape,
  }),
  write.extend({
    action: z.literal("set_reaction"),
    ...forgeSetPrReactionPayloadSchema.pick({ subjectId: true, content: true, reacted: true })
      .shape,
  }),
  write.extend({
    action: z.literal("submit_draft"),
    ...forgeSubmitPrReviewDraftPayloadSchema.pick({
      decision: true,
      body: true,
      expectedHeadSha: true,
      comments: true,
    }).shape,
  }),
]);
type ReviewAction = z.infer<typeof reviewActionSchema>;
type ReviewMutation = Extract<ReviewAction, { operationKey: string }>;

const mutationResultSchema = ghGetPrDetailsResultSchema.partial().extend({
  updated: z.literal(true),
  syncWarning: z.string().optional(),
  viewedFiles: forgePrViewedFilesResultSchema.optional(),
});

function resolveReviewTarget(input: ReviewAction, ctx: AppControlsToolContext) {
  return {
    projectLocation: requireProject(ctx, input.projectId).location,
    forgeAccount: input.forgeAccount,
    forgeRepository: input.forgeRepository,
    prNumber: input.prNumber,
  };
}

async function mutateReview(
  input: ReviewMutation,
  ctx: AppControlsToolContext,
  markDispatched: () => void,
) {
  const scope = resolveReviewTarget(input, ctx);
  const runtime = requireAppRuntime(ctx);
  markDispatched();
  switch (input.action) {
    case "set_labels":
      await runtime.call("forgeSetPrLabels", { ...scope, add: input.add, remove: input.remove });
      break;
    case "request_reviewers":
      await runtime.call("forgeRequestPrReviewers", {
        ...scope,
        add: input.add,
        remove: input.remove,
      });
      break;
    case "convert_to_draft":
      await runtime.call("forgeConvertPrToDraft", scope);
      break;
    case "set_file_viewed": {
      const viewedFiles = await runtime.call("forgeSetPrFileViewed", {
        ...scope,
        path: input.path,
        fingerprint: input.fingerprint,
      });
      return { updated: true as const, viewedFiles };
    }
    case "edit_comment":
      await runtime.call("forgeEditPrComment", {
        ...scope,
        commentId: input.commentId,
        ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
        body: input.body,
        expectedBody: input.expectedBody,
      });
      break;
    case "set_reaction":
      await runtime.call("forgeSetPrReaction", {
        ...scope,
        ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
        content: input.content,
        reacted: input.reacted,
      });
      break;
    case "submit_draft":
      await runtime.call("forgeSubmitPrReviewDraft", {
        ...scope,
        decision: input.decision,
        body: input.body,
        expectedHeadSha: input.expectedHeadSha,
        comments: input.comments,
      });
      break;
  }
  return {
    updated: true as const,
    ...(await syncPullRequest(scopedReviewContext(ctx, input), input.projectId, input.prNumber)),
  };
}

export const reviewActionTools = appControlToolDomain(
  defineAppControlTool({
    name: "review_manage",
    description:
      "Use the app’s account-scoped review controls. Pass the exact forgeAccount and forgeRepository returned by review_repository, plus projectId and prNumber. list_labels and list_reviewers return eligible choices. commit_diff reads one commit. viewed_files returns file marks and current fingerprints. Mutations can set_labels, request_reviewers, convert_to_draft, set_file_viewed, edit_comment, set_reaction, or submit_draft with inline comments and the expected head. Use a null fingerprint to clear a viewed mark. The user’s request must authorize published changes. Reuse the same operationKey if a mutation’s response is lost.",
    input: reviewActionSchema,
    run: async (input, ctx) => {
      if ("operationKey" in input) {
        const { operationKey, ...requestPayload } = input;
        return runRemoteCommand({
          commandId: `app-controls:review-manage:${operationKey}`,
          route: "app-controls:review-manage",
          principalId: "app-controls",
          requestPayload,
          mapCompletedResponse: (cached) => mutationResultSchema.parse(cached),
          operation: (markDispatched) => mutateReview(input, ctx, markDispatched),
        });
      }
      const scope = resolveReviewTarget(input, ctx);
      const runtime = requireAppRuntime(ctx);
      switch (input.action) {
        case "list_labels":
          return runtime.call("forgeListPrLabelCandidates", scope);
        case "list_reviewers":
          return runtime.call("forgeListPrReviewerCandidates", {
            ...scope,
            ...(input.query === undefined ? {} : { query: input.query }),
          });
        case "viewed_files":
          return runtime.call("forgeGetPrViewedFiles", scope);
        case "commit_diff": {
          const { diff } = await runtime.call("forgeGetPrCommitDiff", {
            ...scope,
            commit: input.commit,
          });
          return capDiff(diff);
        }
      }
    },
  }),
);
