import { createHash } from "node:crypto";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";
import {
  appDesktopActionNotStartedSchema,
  type AppDesktopActionNotStarted,
} from "@/shared/contracts/appDesktopAction";
import {
  appExperimentResultSchema,
  type AppExperimentResult,
  type AppExperimentWorkflow,
} from "@/shared/contracts/appExperiment";
import type { RemoteExperimentState } from "@/shared/contracts/experiment";
import {
  commandOutcomeUncertainAfterEffect,
  runRemoteCommand,
} from "@/host/remote/server/remoteCommandIdempotency";
import { resolveThreadInputSegments } from "@/host/threads/threadInputSegments";

export async function runDesktopAppExperiment(
  input: AppExperimentWorkflow,
  callerThreadId: string | undefined,
  read: () => RemoteExperimentState,
  requestNative: (request: BackendNativeRequest) => Promise<unknown>,
): Promise<AppExperimentResult> {
  const token = createHash("sha256").update(input.operationKey).digest("hex").slice(0, 32);
  // The desktop uses the first six characters to distinguish worktree branches.
  const experimentId = input.action === "launch" ? token : input.experimentId;
  const result = await runRemoteCommand<AppExperimentResult | AppDesktopActionNotStarted>({
    commandId: `app-controls:experiment-workflow:${token}`,
    route: "app-controls:manage_experiment",
    principalId: "app-controls",
    requestPayload: input,
    isRetryableResult: (reply) => "type" in reply,
    mapCompletedResponse: (cached) => appExperimentResultSchema.parse(cached),
    operation: async (markDispatched) => {
      const state = read();
      const record = Object.hasOwn(state.experiments, experimentId)
        ? state.experiments[experimentId]
        : undefined;
      if (input.action === "launch") {
        if (record)
          throw new Error(
            `Experiment ${experimentId} already exists. Read it before launching again.`,
          );
      } else {
        if (!record) throw new Error("Experiment not found.");
        if (state.revision !== input.revision)
          throw new Error("Experiment revision changed. Read the experiment again.");
        if (
          (input.action === "merge_winner" ||
            input.action === "discard" ||
            input.action === "retry_cleanup") &&
          record.candidates.some(({ threadId }) => threadId === callerThreadId)
        ) {
          throw new Error("Run this workflow from a thread outside the experiment.");
        }
      }
      const prepared =
        input.action === "launch" && input.segments
          ? { ...input, segments: await resolveThreadInputSegments(input.segments, input.prompt) }
          : input;
      markDispatched();
      try {
        const reply = await requestNative({
          operation: "experiment-workflow",
          payload: { version: 1, input: prepared, experimentId },
        });
        const refused = appDesktopActionNotStartedSchema.safeParse(reply);
        if (refused.success) return refused.data;
        const confirmed = appExperimentResultSchema.parse(reply);
        if (confirmed.experimentId !== experimentId) {
          throw new Error("The desktop answered for a different experiment.");
        }
        return confirmed;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The desktop stopped responding.";
        throw commandOutcomeUncertainAfterEffect(
          new Error(
            `${detail} Inspect experiment ${experimentId} and its Git state before retrying.`,
          ),
        );
      }
    },
  });
  if ("type" in result) throw new Error(result.message);
  return result;
}
