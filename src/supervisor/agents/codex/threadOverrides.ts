import { codexContextWindowOverrides } from "@/shared/agents/codexContextWindows";
import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { getProjectPosixPath } from "@/shared/wsl";
import {
  buildCodexBundledSidecarThreadConfig,
  type DetectedCodexBundledSidecars,
} from "./bundledSidecars";
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
    nativeMcpNames?: readonly string[];
    detectedSidecars?: DetectedCodexBundledSidecars;
  },
): ThreadConfigOverrides {
  const mcpConfig = options?.mcpServers
    ? buildCodexMcp(options.mcpServers, options.nativeMcpNames).config
    : {};
  const bundledSidecarConfig = buildCodexBundledSidecarThreadConfig({
    ...(options?.detectedSidecars ? { detected: options.detectedSidecars } : {}),
    ...(options?.mcpServers ? { mcpServers: options.mcpServers } : {}),
  });
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
      ...bundledSidecarConfig,
      ...mcpConfig,
    },
  };
}
