import { toolPresentationAdapters } from "poracode:tool-presentation-adapters";
import { parseMcpName, type McpInfo } from "./toolCallClassification";
import type { ToolCallPayload, ToolCallWorkflow } from "./contracts";
import type { WorkflowPresentation } from "./workflowPresentation";

/** Pure display hooks. They never change tool identities, routing or stored payloads. */
export interface RuntimeToolPresentationAdapter {
  /** Return undefined for an unrecognized namespace; preserve the transport id elsewhere. */
  normalizeMcpServerIdentifier?: (server: string) => string | undefined;
  /** Recover display metadata from a producer's legacy workflow representation. */
  workflowPresentation?: (payload: ToolCallPayload) => WorkflowPresentation | undefined;
  /** Bounded reference recovery only; must not parse or execute workflow scripts. */
  workflowRegistration?: (payload: ToolCallPayload) => ToolCallWorkflow | undefined;
  /** Canonical name values whose legacy records may need the bounded read. */
  workflowRegistrationNames?: readonly string[];
  /** Decode a producer's wrapped tool rejection; undefined means ordinary output. */
  workflowResultErrorText?: (text: string) => string | undefined;
}

export function workflowResultErrorText(text: string): string | undefined {
  for (const adapter of toolPresentationAdapters) {
    const error = adapter.workflowResultErrorText?.(text);
    if (error !== undefined) return error;
  }
  return undefined;
}

export function normalizeMcpServerIdentifier(server: string): string {
  let result = server;
  for (const adapter of toolPresentationAdapters) {
    result = adapter.normalizeMcpServerIdentifier?.(result) ?? result;
  }
  return result;
}

/** The PWA and advisory native heading read use this exact display policy. */
export function formatMcpToolTitle(info: McpInfo): string {
  return `${normalizeMcpServerIdentifier(info.server).replace(/_/g, " ")}: ${info.tool}`;
}

export function deriveWorkflowPresentation(payload: ToolCallPayload): WorkflowPresentation {
  for (const adapter of toolPresentationAdapters) {
    const result = adapter.workflowPresentation?.(payload);
    if (result) return result;
  }
  return { phases: [], plannedAgents: [], liveAgents: [] };
}

export function deriveWorkflowRegistration(payload: ToolCallPayload): ToolCallWorkflow | undefined {
  if (parseMcpName(payload)) return undefined;
  for (const adapter of toolPresentationAdapters) {
    const result = adapter.workflowRegistration?.(payload);
    if (result) return result;
  }
  return undefined;
}

export function workflowRegistrationNames(): string[] {
  return [
    ...new Set(
      toolPresentationAdapters.flatMap((adapter) => adapter.workflowRegistrationNames ?? []),
    ),
  ].sort();
}
