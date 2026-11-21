import {
  presentRuntimeCommand as projectRuntimeCommand,
  presentRuntimeMcpTool as projectRuntimeMcpTool,
} from "@/shared/runtimeItemPresentationProjection";
import { presentRuntimeToolBody as projectRuntimeToolBody } from "@/shared/runtimeToolBodyProjection";

/** Persisted HTTP reads always require the caller's expected input digest.
 * Only the shared, locally derived snapshot path may omit that comparison. */
export function presentRuntimeCommand(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest: string,
) {
  return projectRuntimeCommand(itemId, type, state, payload, expectedDigest || "");
}

export function presentRuntimeMcpTool(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest: string,
) {
  return projectRuntimeMcpTool(itemId, type, state, payload, expectedDigest || "");
}

export function presentRuntimeToolBody(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest: string,
) {
  return projectRuntimeToolBody(itemId, type, state, payload, expectedDigest || "");
}

export {
  presentRuntimeWorkflow,
  presentRuntimeWorkflowView,
  runtimePresentationDigest,
} from "@/shared/runtimeItemPresentationProjection";
