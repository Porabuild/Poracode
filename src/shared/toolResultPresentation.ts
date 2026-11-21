import { resolveToolTextSource, type ToolTextSource } from "./toolPresentationSource";
import type { ToolTextPart } from "./toolTextFormatting";

export {
  emptyToolTextPart,
  isUnifiedDiffText,
  toolTextPart,
  type ToolTextPart,
} from "./toolTextFormatting";

/** Standard structured text envelope, independent of the supplying provider. */
export interface StructuredToolResult {
  text?: unknown;
  content?: unknown;
  detailedContent?: unknown;
  contents?: Array<{ type?: string; text?: unknown } | undefined>;
}

/**
 * One selection policy for host projections and existing PWA result sections.
 * References remain valid when a live tool replaces its result, and retain
 * complete content without duplicating it on the wire or in persisted rows.
 */
export const TOOL_RESULT_TEXT_SOURCE: ToolTextSource = {
  firstNonempty: [
    { root: "payload", path: ["result"], format: "value", accept: "scalar" },
    { root: "payload", path: ["result", "detailedContent"], format: "value", accept: "string" },
    { root: "payload", path: ["result", "text"], format: "value", accept: "string" },
    { root: "payload", path: ["result", "content"], format: "value", accept: "string" },
    { root: "payload", path: ["result", "content"], format: "text-list", eachPath: ["text"] },
    { root: "payload", path: ["result", "contents"], format: "text-list", eachPath: ["text"] },
    { root: "payload", path: ["result"], format: "json", accept: "object" },
  ],
};

export const TOOL_ARGUMENTS_TEXT_SOURCE: ToolTextSource = {
  firstNonempty: [
    { root: "payload", path: ["args"], format: "value", accept: "string" },
    { root: "payload", path: ["args"], format: "json", accept: "non-string" },
  ],
};

export function presentToolResult(payload: unknown): ToolTextPart {
  return resolveToolTextSource(TOOL_RESULT_TEXT_SOURCE, { payload });
}

export function presentToolArguments(payload: unknown): ToolTextPart {
  return resolveToolTextSource(TOOL_ARGUMENTS_TEXT_SOURCE, { payload });
}
