import { codexContextWindowOverrides } from "@/shared/agents/codexContextWindows";
import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { getProjectPosixPath } from "@/shared/wsl";
import { buildCodexMcp } from "./mcpConfig";
import type { CodexClientRequestMap } from "./protocol";

type ThreadForkParams = CodexClientRequestMap["thread/fork"]["params"];
type ThreadConfigOverrides = Pick<
  ThreadForkParams,
  "model" | "cwd" | "approvalPolicy" | "approvalsReviewer" | "sandbox" | "config"
>;

export function buildCodexThreadOverrides(
  config: ThreadConfig,
  options?: {
    projectLocation?: ProjectLocation;
    mcpServers?: readonly ResolvedMcpServer[];
  },
): ThreadConfigOverrides {
  const mcpConfig = options?.mcpServers ? buildCodexMcp(options.mcpServers).config : {};
  const approvalsReviewer = config.approvalPolicy === "never" ? "user" : config.approvalsReviewer;
  return {
    model: config.model,
    ...(options?.projectLocation ? { cwd: getProjectPosixPath(options.projectLocation) } : {}),
    ...(config.approvalPolicy
      ? {
          approvalPolicy: config.approvalPolicy as NonNullable<ThreadForkParams["approvalPolicy"]>,
        }
      : {}),
    ...(approvalsReviewer
      ? {
          approvalsReviewer: approvalsReviewer as NonNullable<
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
      ...codexContextWindowOverrides(config.contextSize),
      ...mcpConfig,
    },
  };
}
