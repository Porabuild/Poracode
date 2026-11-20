import { runtimePresentationDigest } from "./runtimeItemPresentationProjection";
import {
  runtimeToolBodyEntrySchema,
  type RuntimeToolBodyEntry,
} from "./contracts/runtimeItemPresentation";
import { workflowRegistrationNames } from "./toolPresentationAdapters";
import { readToolValuePath } from "./toolPresentationSource";
import { presentToolResult } from "./toolResultPresentation";
import { workflowResultBody } from "./workflowResultBody";

/** Display-only interpretation of one complete canonical result. */
export function presentRuntimeToolBody(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest?: string,
): RuntimeToolBodyEntry {
  if (
    !["tool_call", "dynamic_tool_call"].includes(type) ||
    state !== "completed" ||
    readToolValuePath(payload, ["status"]) === "running"
  )
    return { status: "unavailable", itemId, reason: "unsupported" };
  const name = readToolValuePath(payload, ["name"]);
  const server = readToolValuePath(payload, ["serverId"]);
  if (
    typeof name !== "string" ||
    !workflowRegistrationNames().includes(name) ||
    (server != null && server !== "")
  )
    return { status: "unavailable", itemId, reason: "unsupported" };
  let inputDigest: string;
  try {
    inputDigest = runtimePresentationDigest(type, state, payload, 5);
  } catch {
    return { status: "unavailable", itemId, reason: "too_large" };
  }
  if (expectedDigest !== undefined && expectedDigest !== inputDigest)
    return { status: "unavailable", itemId, reason: "changed" };
  const entry = runtimeToolBodyEntrySchema.safeParse({
    status: "ready",
    itemId,
    inputDigest,
    body: workflowResultBody(presentToolResult(payload).text),
  });
  return entry.success ? entry.data : { status: "unavailable", itemId, reason: "too_large" };
}
