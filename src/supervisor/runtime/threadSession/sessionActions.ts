import {
  invokeThreadSessionActionResultSchema,
  listThreadSessionActionsResultSchema,
  type InvokeThreadSessionActionPayload,
  type InvokeThreadSessionActionResult,
  type ListThreadSessionActionsResult,
} from "@/shared/contracts/sessionActions";
import { attachErrorDetails, msg } from "@/shared/messages";
import type { ThreadPresentationMode } from "@/shared/contracts";
import type { StructuredSessionHandle } from "../../agents/base";

export interface SessionActionOwner {
  presentationMode?: ThreadPresentationMode | undefined;
  structuredSession?:
    | Pick<StructuredSessionHandle, "listSessionActions" | "invokeSessionAction">
    | undefined;
}

/** Only the active presentation's structured session may own GUI actions. */
export function listSessionActions(
  session: SessionActionOwner | undefined,
): ListThreadSessionActionsResult {
  return listThreadSessionActionsResultSchema.parse({
    actions:
      session?.presentationMode === "gui"
        ? (session.structuredSession?.listSessionActions?.() ?? [])
        : [],
  });
}

export async function invokeSessionAction(
  readCurrentSession: () => SessionActionOwner | undefined,
  payload: InvokeThreadSessionActionPayload,
): Promise<InvokeThreadSessionActionResult> {
  const session = readCurrentSession();
  if (
    !session ||
    session.presentationMode !== "gui" ||
    !session.structuredSession?.invokeSessionAction
  ) {
    throw new Error(msg("thread.sessionActionUnavailable"));
  }
  const structured = session.structuredSession;
  let result: Record<string, unknown>;
  try {
    result = await structured.invokeSessionAction!(payload.actionId, payload.payload);
  } catch (error) {
    throw new Error(
      attachErrorDetails(
        msg("thread.sessionActionFailed"),
        error instanceof Error ? error.message : String(error),
      ),
      { cause: error },
    );
  }
  if (
    readCurrentSession() !== session ||
    session.presentationMode !== "gui" ||
    session.structuredSession !== structured
  ) {
    throw new Error(msg("thread.sessionActionUnavailable"));
  }
  return invokeThreadSessionActionResultSchema.parse(result);
}
