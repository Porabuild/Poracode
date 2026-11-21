import {
  TOOL_PRESENTATION_MAX_WIRE_BYTES,
  TOOL_PRESENTATION_VERSION,
  toolPresentationSchema,
  type ToolPresentation,
  type ToolPresentationCatalog,
} from "./contracts/toolPresentation";
import { TOOL_ARGUMENTS_TEXT_SOURCE, TOOL_RESULT_TEXT_SOURCE } from "./toolResultPresentation";
import {
  resolveToolTextSource,
  type ToolPresentationDocument,
  type ToolTextSource,
} from "./toolPresentationSource";
import type { ToolTextPart } from "./toolTextFormatting";
import {
  COMMAND_HEADER_INPUTS,
  MCP_TOOL_HEADER_INPUTS,
  WORKFLOW_REGISTRATION_INPUTS,
  WORKFLOW_VIEW_INPUTS,
  TOOL_BODY_INPUTS,
} from "./runtimeHeaderInputs";
import { workflowRegistrationNames } from "./toolPresentationAdapters";
import {
  PRESENTATION_INPUT_MAX_BYTES,
  PRESENTATION_INPUT_MAX_DEPTH,
  PRESENTATION_INPUT_MAX_NODES,
} from "./presentationInput";
import { RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT } from "./contracts/runtimeItemPresentation";

const resultSources =
  "firstNonempty" in TOOL_RESULT_TEXT_SOURCE
    ? TOOL_RESULT_TEXT_SOURCE.firstNonempty
    : [TOOL_RESULT_TEXT_SOURCE];
const commandOutput: ToolTextSource = {
  firstNonempty: [
    { root: "streams", path: ["command_output"], format: "terminal" },
    ...resultSources,
  ],
};

/** Only layout and references; never copies output, arguments, images or paths. */
export function canonicalToolPresentation(itemType: string): ToolPresentation | undefined {
  const generic = [
    { kind: "code", label: "args", source: TOOL_ARGUMENTS_TEXT_SOURCE },
    { kind: "code", label: "result", source: TOOL_RESULT_TEXT_SOURCE },
  ];
  let sections: unknown;
  let header: unknown;
  switch (itemType) {
    case "command_execution":
      header = { label: "run", source: { root: "payload", path: ["command"], format: "value" } };
      sections = [
        {
          kind: "terminal",
          label: "command",
          prefix: "$ ",
          source: { root: "payload", path: ["command"], format: "value" },
        },
        { kind: "terminal", label: "output", source: commandOutput },
        {
          kind: "code",
          label: "error",
          source: { root: "payload", path: ["errorMessage"], format: "value" },
        },
      ];
      break;
    case "file_change":
      header = {
        label: "edit",
        labelChoice: {
          source: { root: "payload", path: ["changeKind"], format: "value" },
          labels: { create: "create", edit: "edit", delete: "delete" },
        },
        path: true,
        source: { root: "payload", path: ["path"], format: "value" },
      };
      sections = [
        {
          kind: "code",
          label: "changes",
          replaceFollowing: true,
          source: { root: "streams", path: ["file_change_output"], format: "value" },
        },
        {
          kind: "code",
          label: "changes",
          onlyLanguage: "diff",
          replaceFollowing: true,
          source: TOOL_RESULT_TEXT_SOURCE,
        },
        { kind: "code", label: "args", source: TOOL_ARGUMENTS_TEXT_SOURCE },
        { kind: "code", label: "result", source: TOOL_RESULT_TEXT_SOURCE },
      ];
      break;
    case "tool_call":
    case "dynamic_tool_call":
    case "mcp_tool_call":
      header = {
        context: { root: "payload", path: ["serverId"], format: "value", accept: "string" },
        source: {
          firstNonempty: [
            { root: "payload", path: ["title"], format: "value", accept: "string" },
            { root: "payload", path: ["name"], format: "value", accept: "string" },
          ],
        },
      };
      sections = generic;
      break;
    case "web_search":
      header = { label: "search", source: { root: "payload", path: ["query"], format: "value" } };
      sections = [
        {
          kind: "code",
          label: "args",
          source: { root: "payload", path: ["query"], format: "value" },
        },
        { kind: "code", label: "content", source: { root: "payload", path: [], format: "json" } },
      ];
      break;
    case "image_view":
      header = {
        label: "view",
        path: true,
        source: { root: "payload", path: ["path"], format: "value" },
      };
      sections = [];
      break;
    default:
      return undefined;
  }
  const presentation = toolPresentationSchema.parse({
    version: TOOL_PRESENTATION_VERSION,
    header,
    sections,
    ...(["tool_call", "dynamic_tool_call"].includes(itemType) &&
    workflowRegistrationNames().length > 0
      ? {
          workflowProjection: {
            version: 3,
            maxItems: RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT,
            maxInputBytes: PRESENTATION_INPUT_MAX_BYTES,
            maxDepth: PRESENTATION_INPUT_MAX_DEPTH,
            maxNodes: PRESENTATION_INPUT_MAX_NODES,
            inputs: WORKFLOW_REGISTRATION_INPUTS,
            conditions: [
              { root: "payload", path: ["name"], values: workflowRegistrationNames() },
              { root: "payload", path: ["serverId"], values: [null, ""] },
              { root: "payload", path: ["workflow"], values: [null] },
            ],
          },
          workflowViewProjection: {
            version: 4,
            maxItems: RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT,
            maxInputBytes: PRESENTATION_INPUT_MAX_BYTES,
            maxDepth: PRESENTATION_INPUT_MAX_DEPTH,
            maxNodes: PRESENTATION_INPUT_MAX_NODES,
            inputs: WORKFLOW_VIEW_INPUTS,
            conditions: [
              { root: "payload", path: ["name"], values: workflowRegistrationNames() },
              { root: "payload", path: ["serverId"], values: [null, ""] },
            ],
          },
          bodyProjection: {
            version: 5,
            maxItems: RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT,
            maxInputBytes: PRESENTATION_INPUT_MAX_BYTES,
            maxDepth: PRESENTATION_INPUT_MAX_DEPTH,
            maxNodes: PRESENTATION_INPUT_MAX_NODES,
            inputs: TOOL_BODY_INPUTS,
            conditions: [
              { root: "payload", path: ["name"], values: workflowRegistrationNames() },
              { root: "payload", path: ["serverId"], values: [null, ""] },
            ],
          },
        }
      : {}),
    ...(["command_execution", "tool_call", "dynamic_tool_call", "mcp_tool_call"].includes(itemType)
      ? {
          headerProjection: {
            version: itemType === "command_execution" ? 1 : 2,
            maxItems: RUNTIME_ITEM_PRESENTATION_BATCH_LIMIT,
            maxInputBytes: PRESENTATION_INPUT_MAX_BYTES,
            maxDepth: PRESENTATION_INPUT_MAX_DEPTH,
            maxNodes: PRESENTATION_INPUT_MAX_NODES,
            inputs:
              itemType === "command_execution" ? COMMAND_HEADER_INPUTS : MCP_TOOL_HEADER_INPUTS,
          },
        }
      : {}),
    mediaSources: [{ root: "payload", path: itemType === "image_view" ? ["path"] : ["images"] }],
  });
  if (
    new TextEncoder().encode(JSON.stringify(presentation)).length > TOOL_PRESENTATION_MAX_WIRE_BYTES
  ) {
    throw new Error("Canonical tool presentation exceeds its declared expansion bound.");
  }
  return presentation;
}

/** One connection advertisement serves historical and live canonical items. */
export function canonicalToolPresentationCatalog(): ToolPresentationCatalog {
  const itemTypes = [
    "command_execution",
    "file_change",
    "tool_call",
    "dynamic_tool_call",
    "mcp_tool_call",
    "web_search",
    "image_view",
  ];
  return {
    version: TOOL_PRESENTATION_VERSION,
    itemTypes: itemTypes.map((itemType) => ({
      itemType,
      presentation: canonicalToolPresentation(itemType)!,
    })),
  };
}

export function resolveToolPresentationSections(
  presentation: ToolPresentation,
  document: ToolPresentationDocument,
) {
  const sections: Array<{
    index: number;
    section: ToolPresentation["sections"][number];
    part: ToolTextPart;
  }> = [];
  for (const [index, section] of presentation.sections.entries()) {
    const part = resolveToolTextSource(section.source, document);
    if (!part.text || (section.onlyLanguage && section.onlyLanguage !== part.language)) continue;
    sections.push({ index, section, part });
    if (section.replaceFollowing) break;
  }
  return sections;
}
