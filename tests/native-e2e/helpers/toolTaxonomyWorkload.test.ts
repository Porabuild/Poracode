// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { CanonicalItemType, FileChangePayload, ToolCallPayload } from "@/shared/contracts";
import {
  acpToolKindSchema,
  canonicalItemTypeSchema,
  canonicalRequestTypeSchema,
  commandExecutionPayloadSchema,
  errorItemPayloadSchema,
  fileChangeKindSchema,
  fileChangePayloadSchema,
  goalItemPayloadSchema,
  goalStatusSchema,
  messageItemPayloadSchema,
  planItemPayloadSchema,
  providerHandoffItemPayloadSchema,
  questionAnswerItemPayloadSchema,
  reasoningItemPayloadSchema,
  subAgentStatusSchema,
  toolCallPayloadSchema,
  toolCallStatusSchema,
  webSearchPayloadSchema,
} from "@/shared/contracts/runtimeEvent";
import {
  workflowAgentStateSchema,
  workflowRunStatusSchema,
} from "@/shared/contracts/workflowTranscript";
import {
  ALL_TAXONOMY_CASES,
  COMPACTION_NAMES,
  COMMAND_RECOGNITION_CASES,
  CONTROL_STATE_CASES,
  CROSSAGENT_CATALOG_NAMES,
  CROSSAGENT_STATE_CASES,
  EXECUTION_SCENARIOS_NOT_RUN,
  GROUPING_SCENARIOS,
  IMAGE_ARRAY_KEYS,
  IMAGE_FORM_CASES,
  IMAGE_RESULT_KEYS,
  KIND_CASES,
  KIND_EXPECTATIONS,
  NAME_ALIAS_CASES,
  PATH_ARGUMENT_KEYS,
  PAYLOAD_CASES,
  RAW_TITLE_NAMES,
  READ_END_KEYS,
  READ_RESULT_PATH_KEYS,
  READ_START_KEYS,
  READ_TEXT_KEYS,
  READ_WRAPPER_KEYS,
  REQUEST_CASES,
  SPAWN_ALIASES,
  SUMMARY_CASES,
  TAXONOMY_EVIDENCE,
  TOOL_NAME_CASES,
  VERB_PREFIX_ROWS,
  WORKFLOW_RUN_CASES,
} from "../fixtures/tool-taxonomy-workload";
import { toolTypes, payload } from "./tool-taxonomy/test-support";

const payloadSchemas: Record<CanonicalItemType, z.ZodType> = {
  tool_call: toolCallPayloadSchema,
  mcp_tool_call: toolCallPayloadSchema,
  dynamic_tool_call: toolCallPayloadSchema,
  image_view: toolCallPayloadSchema,
  command_execution: commandExecutionPayloadSchema,
  file_change: fileChangePayloadSchema,
  web_search: webSearchPayloadSchema,
  reasoning: reasoningItemPayloadSchema,
  assistant_message: messageItemPayloadSchema,
  user_message: messageItemPayloadSchema,
  plan: planItemPayloadSchema,
  goal: goalItemPayloadSchema,
  question_answer: questionAnswerItemPayloadSchema,
  error: errorItemPayloadSchema,
  provider_handoff: providerHandoffItemPayloadSchema,
};

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, "../../../src", path), "utf8");
}
function casesInFunction(text: string, name: string): string[] {
  const start = text.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n}", start + 1);
  return [...text.slice(start, end < 0 ? undefined : end).matchAll(/case "([^"]+)"/g)].map(
    (m) => m[1]!,
  );
}

describe("finite normalized taxonomy declarations", () => {
  it("has unique identities, an exact inventory linkage, and independent expectation tables", () => {
    const all = [...ALL_TAXONOMY_CASES, ...CROSSAGENT_STATE_CASES];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(TOOL_NAME_CASES).toHaveLength(35);
    expect(new Set(TOOL_NAME_CASES.map((c) => payload(c.id).name)).size).toBe(35);
    expect(RAW_TITLE_NAMES).toHaveLength(27);
    expect(SPAWN_ALIASES).toHaveLength(10);
    expect(SUMMARY_CASES).toHaveLength(14);
    expect(KIND_CASES).toHaveLength(10);
    expect(new Set(NAME_ALIAS_CASES.map((c) => c.id)).size).toBe(NAME_ALIAS_CASES.length);
    expect(GROUPING_SCENARIOS).toHaveLength(13);
    expect(EXECUTION_SCENARIOS_NOT_RUN).toHaveLength(14);
    expect(IMAGE_FORM_CASES.filter((c) => c.id.startsWith("image-array:"))).toHaveLength(44);
    const links = [...PAYLOAD_CASES, ...REQUEST_CASES]
      .flatMap((c) => c.inventoryIds)
      .concat("background_tasks_dock");
    expect(links).toHaveLength(85);
    expect(new Set(links).size).toBe(85);
    expect(links).not.toContain("image_jpeg_synthetic");
    expect(links).toContain("image_jpeg_photo");
    for (const [id, refs] of EXECUTION_SCENARIOS_NOT_RUN) {
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs)
        expect(
          all.some((c) => c.id === ref),
          `${id}:${ref}`,
        ).toBe(true);
    }
    expect(TAXONOMY_EVIDENCE).toEqual({
      level: "normalized_fixture",
      actualToolExecution: false,
      actualDelegationExecution: false,
      actualWorkflowExecution: false,
      uiQualified: false,
    });
  });

  it("fails on silent additions to the production's finite name/kind/type declarations", () => {
    const display = source("renderer/components/thread/ChatPane/parts/items/toolDisplay.ts");
    const categorizer = source(
      "renderer/components/thread/ChatPane/parts/items/toolCallCategorization.ts",
    );
    expect(casesInFunction(display, "mapClaudeRawTool").toSorted()).toEqual(
      [...RAW_TITLE_NAMES].toSorted(),
    );
    const classifiedNames = casesInFunction(categorizer, "categorizeToolName");
    expect(new Set(classifiedNames).size).toBe(classifiedNames.length);
    expect(TOOL_NAME_CASES.map((c) => payload(c.id).name)).toEqual(
      expect.arrayContaining(classifiedNames),
    );
    expect(Object.keys(KIND_EXPECTATIONS).toSorted()).toEqual(acpToolKindSchema.options.toSorted());
    expect(new Set(ALL_TAXONOMY_CASES.map((c) => c.item.type))).toEqual(
      new Set(canonicalItemTypeSchema.options),
    );
    const registry = source("supervisor/crossagentMcp/toolRegistry.ts");
    const catalog = new Set(
      [...registry.matchAll(/(?:name:|case) "([a-z_]+)"/g)].map((m) => m[1]!),
    );
    expect(new Set(CROSSAGENT_CATALOG_NAMES)).toEqual(catalog);
    const compaction = source(
      "renderer/components/thread/ChatPane/parts/items/ContextCompaction.tsx",
    );
    const keys = /COMPACTION_NAME_KEYS[^=]*= \[([\s\S]*?)\];/.exec(compaction)?.[1];
    expect(keys).toBeDefined();
    expect([...keys!.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(
      COMPACTION_NAMES.map((n) => n.toLowerCase()),
    );
    const inline = source("shared/inlineImagePayload.ts");
    for (const [name, expected] of [
      ["RESULT_STRING_KEYS", IMAGE_RESULT_KEYS],
      ["RESULT_ARRAY_KEYS", IMAGE_ARRAY_KEYS],
    ] as const) {
      const block = new RegExp(`${name} = \\[([\\s\\S]*?)\\]`).exec(inline)?.[1];
      expect(block).toBeDefined();
      expect([...block!.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(expected);
    }
    expect(PATH_ARGUMENT_KEYS).toHaveLength(7);
    expect(READ_START_KEYS).toHaveLength(8);
    expect(READ_END_KEYS).toHaveLength(5);
    expect(READ_WRAPPER_KEYS).toHaveLength(4);
    expect(READ_TEXT_KEYS).toHaveLength(3);
    expect(READ_RESULT_PATH_KEYS).toHaveLength(5);
    for (const functionName of ["pickIconByVerbPrefix", "categorizeVerbPrefix"]) {
      const text = functionName === "pickIconByVerbPrefix" ? display : categorizer;
      const body = text.slice(text.indexOf(`function ${functionName}(`));
      const prefixes = [...body.matchAll(/t\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]!);
      expect(VERB_PREFIX_ROWS.map(([prefix]) => prefix.toLowerCase())).toEqual(
        expect.arrayContaining(prefixes),
      );
    }
    const pathArgs = /function readPathArg[\s\S]*?return readStr\(\s*args,([\s\S]*?)\);/.exec(
      display,
    )?.[1];
    expect(pathArgs).toBeDefined();
    expect([...pathArgs!.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(PATH_ARGUMENT_KEYS);
    const lineRange = display.slice(
      display.indexOf("function readLineRange("),
      display.indexOf("function readInt("),
    );
    const ranges = [...lineRange.matchAll(/readInt\(\s*args,([\s\S]*?)\)/g)].map((m) =>
      [...m[1]!.matchAll(/"([^"]+)"/g)].map((key) => key[1]),
    );
    expect(ranges).toEqual([[...READ_START_KEYS], [...READ_END_KEYS], ["limit"]]);
    const checks = /CHECK_SCRIPTS = new Set\(\[([\s\S]*?)\]/.exec(
      source("renderer/components/thread/ChatPane/parts/items/commandSummary.ts"),
    )?.[1];
    expect(checks).toBeDefined();
    expect(
      COMMAND_RECOGNITION_CASES.filter((c) => c.id.startsWith("command-check:")).map((c) =>
        c.id.slice("command-check:".length),
      ),
    ).toEqual([...checks!.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  });

  it("uses all canonical status enums with distinct payloads rather than repeated success rows", () => {
    expect(
      new Set(
        ALL_TAXONOMY_CASES.filter((c) => toolTypes.has(c.item.type)).map(
          (c) => (c.item.payload as ToolCallPayload).status,
        ),
      ),
    ).toEqual(new Set(toolCallStatusSchema.options));
    expect(
      new Set(
        PAYLOAD_CASES.filter((c) => c.id.startsWith("subagent_"))
          .map((c) => (c.item.payload as ToolCallPayload).subAgentStatus)
          .filter(Boolean),
      ),
    ).toEqual(new Set(subAgentStatusSchema.options));
    expect(
      new Set(
        CROSSAGENT_STATE_CASES.map((c) => (c.item.payload as ToolCallPayload).crossagentStatus),
      ),
    ).toEqual(new Set(["running", "completed", "failed", "cancelled"]));
    expect(
      new Set(
        PAYLOAD_CASES.filter((c) => c.item.type === "file_change").map(
          (c) => (c.item.payload as FileChangePayload).changeKind,
        ),
      ),
    ).toEqual(new Set(fileChangeKindSchema.options));
    expect(
      new Set(
        [...PAYLOAD_CASES, ...CONTROL_STATE_CASES]
          .filter((c) => c.item.type === "goal")
          .map((c) => (c.item.payload as { status: string }).status),
      ),
    ).toEqual(new Set(goalStatusSchema.options));
    expect(new Set(WORKFLOW_RUN_CASES.map((c) => c.run.status))).toEqual(
      new Set(workflowRunStatusSchema.options),
    );
    expect(
      new Set(WORKFLOW_RUN_CASES[0]!.run.phases.flatMap((p) => p.agents.map((a) => a.state))),
    ).toEqual(new Set(workflowAgentStateSchema.options));
    expect(new Set(REQUEST_CASES.map((c) => c.requestType))).toEqual(
      new Set(canonicalRequestTypeSchema.options),
    );
  });

  it.each([...ALL_TAXONOMY_CASES, ...CROSSAGENT_STATE_CASES])(
    "$id: parses the actual canonical payload schema",
    ({ item }) => {
      expect(payloadSchemas[item.type].safeParse(item.payload).success).toBe(true);
    },
  );
});
