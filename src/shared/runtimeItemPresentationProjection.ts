import { createHash } from "node:crypto";
import { deriveCommandPayloadIntent } from "@/shared/commandPresentation/payload";
import { encodePresentationInput } from "@/shared/presentationInput";
import { runtimeHeaderInput } from "@/shared/runtimeHeaderInputs";
import {
  runtimeItemPresentationEntrySchema,
  runtimeToolPresentationEntrySchema,
  runtimeWorkflowPresentationEntrySchema,
  runtimeWorkflowViewEntrySchema,
  type RuntimeItemPresentationEntry,
  type RuntimeToolPresentationEntry,
  type RuntimeWorkflowPresentationEntry,
  type RuntimeWorkflowViewEntry,
} from "@/shared/contracts/runtimeItemPresentation";
import { readToolValuePath } from "@/shared/toolPresentationSource";
import { parseMcpName } from "@/shared/toolCallClassification";
import {
  formatMcpToolTitle,
  deriveWorkflowRegistration,
  deriveWorkflowPresentation,
  workflowRegistrationNames,
} from "@/shared/toolPresentationAdapters";
import { toolCallPayloadSchema } from "@/shared/contracts/runtimeEvent";

export function runtimePresentationDigest(
  type: string,
  state: string,
  payload: unknown,
  version: 1 | 2 | 3 | 4 | 5 = 1,
): string {
  return createHash("sha256")
    .update(encodePresentationInput(runtimeHeaderInput(type, state, payload, version)))
    .digest("hex");
}

const legacyWorkflowInput = toolCallPayloadSchema.partial({ status: true });

/** Explicit viewer read; the producer hook is shared with the PWA. Nothing is
 * executed, and the original canonical row is never repaired or rewritten. */
export function presentRuntimeWorkflowView(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest: string,
): RuntimeWorkflowViewEntry {
  if (!["tool_call", "dynamic_tool_call"].includes(type))
    return { status: "unavailable", itemId, reason: "unsupported" };
  let inputDigest: string;
  try {
    inputDigest = runtimePresentationDigest(type, state, payload, 4);
  } catch {
    return { status: "unavailable", itemId, reason: "too_large" };
  }
  if (inputDigest !== expectedDigest) return { status: "unavailable", itemId, reason: "changed" };
  const parsed = legacyWorkflowInput.safeParse(payload);
  if (!parsed.success) return { status: "unavailable", itemId, reason: "unsupported" };
  const input = { ...parsed.data, status: parsed.data.status ?? ("success" as const) };
  if (parseMcpName(input) || (!input.workflow && !workflowRegistrationNames().includes(input.name)))
    return { status: "unavailable", itemId, reason: "unsupported" };
  const entry = runtimeWorkflowViewEntrySchema.safeParse({
    status: "ready",
    itemId,
    inputDigest,
    header: { workflowView: deriveWorkflowPresentation(input) },
  });
  return entry.success ? entry.data : { status: "unavailable", itemId, reason: "too_large" };
}

/** A current-row registration hint. Scripts are never interpreted by this read,
 * and no source import or persisted metadata repair is performed. */
export function presentRuntimeWorkflow(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest: string,
): RuntimeWorkflowPresentationEntry {
  if (!["tool_call", "dynamic_tool_call"].includes(type))
    return { status: "unavailable", itemId, reason: "unsupported" };
  let inputDigest: string;
  try {
    inputDigest = runtimePresentationDigest(type, state, payload, 3);
  } catch {
    return { status: "unavailable", itemId, reason: "too_large" };
  }
  if (inputDigest !== expectedDigest) return { status: "unavailable", itemId, reason: "changed" };
  const parsed = legacyWorkflowInput.safeParse(payload);
  if (!parsed.success) return { status: "unavailable", itemId, reason: "unsupported" };
  const input = { ...parsed.data, status: parsed.data.status ?? ("success" as const) };
  if (parseMcpName(input)) return { status: "unavailable", itemId, reason: "unsupported" };
  const workflow = deriveWorkflowRegistration(input);
  if (!workflow) return { status: "unavailable", itemId, reason: "unsupported" };
  const entry = runtimeWorkflowPresentationEntrySchema.safeParse({
    status: "ready",
    itemId,
    inputDigest,
    header: { workflow },
  });
  return entry.success ? entry.data : { status: "unavailable", itemId, reason: "too_large" };
}

/** Display only: no provider selection, mutation, stream read or payload rewrite. */
export function presentRuntimeMcpTool(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest?: string,
): RuntimeToolPresentationEntry {
  if (!["tool_call", "dynamic_tool_call", "mcp_tool_call"].includes(type))
    return { status: "unavailable", itemId, reason: "unsupported" };
  let inputDigest: string;
  try {
    inputDigest = runtimePresentationDigest(type, state, payload, 2);
  } catch {
    return { status: "unavailable", itemId, reason: "too_large" };
  }
  if (expectedDigest !== undefined && inputDigest !== expectedDigest)
    return { status: "unavailable", itemId, reason: "changed" };
  const name = readToolValuePath(payload, ["name"]),
    serverId = readToolValuePath(payload, ["serverId"]);
  if (typeof name !== "string") return { status: "unavailable", itemId, reason: "unsupported" };
  const info = parseMcpName({
    name,
    status: "success",
    ...(typeof serverId === "string" ? { serverId } : {}),
  });
  if (!info) return { status: "unavailable", itemId, reason: "unsupported" };
  const entry = runtimeToolPresentationEntrySchema.safeParse({
    status: "ready",
    itemId,
    inputDigest,
    header: {
      tool: { kind: "mcp", title: formatMcpToolTitle(info) },
      failed: readToolValuePath(payload, ["status"]) === "error",
    },
  });
  return entry.success ? entry.data : { status: "unavailable", itemId, reason: "too_large" };
}

/** Shared with the controlled peer; production source reads remain fenced below. */
export function presentRuntimeCommand(
  itemId: string,
  type: string,
  state: string,
  payload: unknown,
  expectedDigest?: string,
): RuntimeItemPresentationEntry {
  if (type !== "command_execution") return { status: "unavailable", itemId, reason: "unsupported" };
  let inputDigest: string;
  try {
    inputDigest = runtimePresentationDigest(type, state, payload);
  } catch {
    return { status: "unavailable", itemId, reason: "too_large" };
  }
  if (expectedDigest !== undefined && inputDigest !== expectedDigest)
    return { status: "unavailable", itemId, reason: "changed" };
  const duration = readToolValuePath(payload, ["durationMs"]);
  const exit = readToolValuePath(payload, ["exitCode"]);
  const entry = runtimeItemPresentationEntrySchema.safeParse({
    status: "ready",
    itemId,
    inputDigest,
    header: {
      command: deriveCommandPayloadIntent(payload, { retainInput: false }),
      failed:
        readToolValuePath(payload, ["status"]) === "error" ||
        (typeof exit === "number" && exit !== 0),
      ...(typeof duration === "number" && Number.isFinite(duration) && duration >= 0
        ? { durationMs: duration }
        : {}),
    },
  });
  return entry.success ? entry.data : { status: "unavailable", itemId, reason: "too_large" };
}
