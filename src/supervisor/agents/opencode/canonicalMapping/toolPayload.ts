/**
 * Build the canonical payload for a tool item based on its current state.
 *
 * Mirrors `buildAcpToolCallPayload`: every payload carries `name`/`args`/
 * `status` (and `result` when complete) so the unified accordion body can
 * surface the full request/response, with the canonical type-specific fields
 * (`command`, `path`, `query`, etc.) layered on top for renderers that key off
 * of them.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import type { ToolState } from "@opencode-ai/sdk/v2";
import { readDiffSummary, readFileChangePath } from "../../fileChangeSummary";
import { normalizeOpenCodeFileChangeMetadata } from "../sdkCanonicalFileChangeMetadata";
import { inferFileChangeKind } from "./fileChangeKind";
import { normalizeToolName, readStringField, toolStateStatus } from "./readers";
import {
  extractOpenCodePlanSteps,
  openCodeToolKind,
  openCodeToolLocations,
  openCodeToolTitle,
} from "./toolClassification";

export function toolPayload(
  itemType: CanonicalItemType,
  toolName: string,
  state: ToolState,
  partMetadata?: Record<string, unknown>,
): Record<string, unknown> {
  const status = toolStateStatus(state);
  const input = state.input as Record<string, unknown> | undefined;
  const title = openCodeToolTitle(
    toolName,
    input,
    "title" in state && typeof state.title === "string" ? state.title : undefined,
  );
  const result =
    state.status === "completed"
      ? state.output
      : state.status === "error"
        ? state.error
        : undefined;
  const metadata =
    "metadata" in state && state.metadata && typeof state.metadata === "object"
      ? (state.metadata as Record<string, unknown>)
      : partMetadata;
  const errorMessage = state.status === "error" ? state.error : undefined;
  const kind = openCodeToolKind(toolName);
  const locations = openCodeToolLocations(toolName, input);
  const base: Record<string, unknown> = {
    name: normalizeToolName(toolName) === "skill" ? "Skill" : title,
    args: input,
    status,
    ...(title !== toolName ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations ? { locations } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(metadata ? { metadata } : {}),
  };

  if (itemType === "command_execution") {
    const command = readStringField(input, "command", "cmd") ?? "";
    const cwd = readStringField(input, "cwd");
    const md =
      (state.status === "completed" || state.status === "error"
        ? (state.metadata as Record<string, unknown> | undefined)
        : undefined) ?? undefined;
    const durationMs =
      (state.status === "completed" || state.status === "error") && state.time?.end !== undefined
        ? state.time.end - state.time.start
        : undefined;
    const exitCode =
      md && typeof md.exit === "number"
        ? (md.exit as number)
        : md && typeof md.exitCode === "number"
          ? (md.exitCode as number)
          : undefined;
    return {
      ...base,
      command,
      ...(cwd ? { cwd } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };
  }
  if (itemType === "file_change") {
    const fileChangeMetadata = normalizeOpenCodeFileChangeMetadata(metadata);
    const path =
      readFileChangePath(fileChangeMetadata, input, result, metadata, partMetadata, title) ?? "";
    const diffSummary = readDiffSummary(fileChangeMetadata, input, result, metadata, partMetadata);
    return {
      ...base,
      ...(fileChangeMetadata ? { metadata: fileChangeMetadata } : {}),
      // OpenCode's edit/write tools overwrite `state.title` on completion
      // with the human-readable result message ("Success. Updated the
      // following files: M src/foo.ts"). The path is extracted separately
      // and rendered as the row title, so anchor `name` to the tool name
      // instead of the polluted title.
      name: toolName,
      path,
      changeKind: inferFileChangeKind(
        toolName,
        input,
        result,
        fileChangeMetadata,
        metadata,
        partMetadata,
      ),
      ...(diffSummary ? { diffSummary } : {}),
    };
  }
  if (itemType === "web_search") {
    const query =
      readStringField(input, "query", "q", "url") ??
      (normalizeToolName(toolName) === "webfetch" ? title : "");
    return { ...base, query };
  }
  if (itemType === "plan") {
    // PlanItemPayload is strictly `{ steps }` — surfacing `name`/`args` here
    // would fail schema validation, so the plan branch returns the canonical
    // shape directly. The dock reads `steps`, the runtime ignores the rest.
    return { steps: extractOpenCodePlanSteps(state.input as Record<string, unknown> | undefined) };
  }
  if (normalizeToolName(toolName) === "task") {
    return { ...base, name: "Agent", isSubAgent: true };
  }
  return base;
}
