import type { ThreadConfig } from "@/shared/contracts";
import type { CodexClientRequestMap } from "./protocol";

type ThreadForkParams = CodexClientRequestMap["thread/fork"]["params"];
type ThreadConfigOverrides = Pick<
  ThreadForkParams,
  "model" | "approvalPolicy" | "approvalsReviewer" | "sandbox" | "config"
>;

export function buildCodexThreadOverrides(config: ThreadConfig): ThreadConfigOverrides {
  return {
    model: config.model,
    ...(config.approvalPolicy
      ? {
          approvalPolicy: config.approvalPolicy as NonNullable<ThreadForkParams["approvalPolicy"]>,
        }
      : {}),
    ...(config.approvalsReviewer
      ? {
          approvalsReviewer: config.approvalsReviewer as NonNullable<
            ThreadForkParams["approvalsReviewer"]
          >,
        }
      : {}),
    ...(config.sandboxMode
      ? { sandbox: config.sandboxMode as NonNullable<ThreadForkParams["sandbox"]> }
      : {}),
    config: {
      ...(config.effort ? { model_reasoning_effort: config.effort } : {}),
      model_reasoning_summary: "auto",
    },
  };
}
