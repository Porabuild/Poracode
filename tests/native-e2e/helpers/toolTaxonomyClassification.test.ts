// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import {
  Bot,
  Clock,
  Download,
  Eye,
  FilePlus,
  FolderSearch,
  GitBranch,
  Globe,
  ImageIcon,
  Pencil,
  Plug,
  SearchCode,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import { commandExecutionPayloadSchema } from "@/shared/contracts/runtimeEvent";
import {
  isAskUserQuestionToolName,
  isCrossagentSpawnAgentTool,
  isCrossagentTool,
  isDelegatedAgentTool,
  isSubAgentTool,
  isWorkflowTool,
  parseMcpName,
} from "@/shared/toolCallClassification";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  isVisibleRuntimeItem,
  selectVisibleThreadTimelineEntries,
} from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import {
  CATEGORY_META,
  categorizeItem,
  categorizePersistedToolSummary,
  categorizeToolName,
  categoryFromSummaryLabel,
} from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
import {
  deriveToolDisplay,
  isSkillTool,
} from "@/renderer/components/thread/ChatPane/parts/items/toolDisplay";
import { isContextCompactionToolCall } from "@/renderer/components/thread/ChatPane/parts/items/ContextCompaction";
import { isPlanProposalToolCall } from "@/renderer/components/thread/ChatPane/parts/items/PlanProposal";
import { commandIntentDisplay } from "@/renderer/components/thread/ChatPane/parts/items/commandSummary";
import { imageViewRendersInline } from "@/renderer/components/thread/ChatPane/parts/items/imageViewSource";
import {
  ALL_TAXONOMY_CASES,
  CANONICAL_TOOL_TYPES,
  COMMAND_ROWS,
  COMMAND_RECOGNITION_CASES,
  CROSSAGENT_STATE_CASES,
  EDIT_CATEGORY_NAMES,
  EDIT_PATH,
  taxonomyItem,
  type TaxonomyCase,
} from "../fixtures/tool-taxonomy-workload";
import { toolTypes, payload, selectorState } from "./tool-taxonomy/test-support";

function toolPair(c: TaxonomyCase) {
  // Isolate its grouping eligibility from parent ownership: children have a
  // separate timeline tested in group_child_timeline below.
  const { parentItemId: _parent, ...item } = structuredClone(c.item);
  const neighbor = taxonomyItem("read_full", ":neighbor");
  const state = selectorState([item, neighbor], `pair:${c.id}`);
  return selectVisibleThreadTimelineEntries(state, `pair:${c.id}`);
}

describe("production classification, recognition, and timeline eligibility", () => {
  it.each([...ALL_TAXONOMY_CASES, ...CROSSAGENT_STATE_CASES])(
    "$id: matches authored category and row treatment",
    (c) => {
      const { item, expected: e } = c;
      expect(categorizeItem(item)).toBe(e.category);
      expect(isVisibleRuntimeItem(item)).toBe(e.visible);
      const pair = toolPair(c);
      expect(pair.some((entry) => entry.kind === "tool_call_group")).toBe(
        e.visible && e.groupEligible,
      );
    },
  );

  const iconMap = {
    Bot,
    Clock,
    Download,
    Eye,
    FilePlus,
    FolderSearch,
    GitBranch,
    Globe,
    ImageIcon,
    Pencil,
    Plug,
    SearchCode,
    Sparkles,
    Terminal,
    Trash2,
    Wrench,
  };
  const checks = [
    ["subagent", (item: RuntimeChatItem) => isSubAgentTool(item.payload as ToolCallPayload)],
    ["crossagent", (item: RuntimeChatItem) => isCrossagentTool(item.payload as ToolCallPayload)],
    ["workflow", (item: RuntimeChatItem) => isWorkflowTool(item.payload as ToolCallPayload)],
    ["skill", (item: RuntimeChatItem) => isSkillTool(item.payload as ToolCallPayload)],
    [
      "spawnTransport",
      (item: RuntimeChatItem) => isCrossagentSpawnAgentTool(item.payload as ToolCallPayload),
    ],
    [
      "questionName",
      (item: RuntimeChatItem) => isAskUserQuestionToolName((item.payload as ToolCallPayload).name),
    ],
    ["compaction", isContextCompactionToolCall],
    ["planProposal", isPlanProposalToolCall],
    ["inlineImage", (item: RuntimeChatItem) => imageViewRendersInline(item.payload)],
  ] as const;
  for (const [key, recognize] of checks) {
    it.each(
      [...ALL_TAXONOMY_CASES, ...CROSSAGENT_STATE_CASES].filter(
        (c) => c.expected[key] !== undefined,
      ),
    )(`$id: ${key} recognition`, ({ item, expected }) => {
      expect(recognize(item)).toBe(expected[key]);
    });
  }
  it.each(ALL_TAXONOMY_CASES.filter((c) => c.expected.title !== undefined))(
    "$id: display title",
    ({ item, expected }) => {
      expect(deriveToolDisplay(item.payload as ToolCallPayload).title).toBe(expected.title);
    },
  );
  it.each(ALL_TAXONOMY_CASES.filter((c) => c.expected.icon !== undefined))(
    "$id: display icon",
    ({ item, expected }) => {
      expect(deriveToolDisplay(item.payload as ToolCallPayload).Icon).toBe(
        iconMap[expected.icon as keyof typeof iconMap],
      );
    },
  );

  it("separates category names, special dispatch, title aliases, and MCP precedence", () => {
    for (const name of EDIT_CATEGORY_NAMES) expect(categorizeToolName(name)).toBe("edited");
    expect(categorizeToolName("apply-patch")).toBe("other");
    expect(deriveToolDisplay(payload("patch-title:apply-patch")).title).toBe(`Edit: ${EDIT_PATH}`);
    for (const type of CANONICAL_TOOL_TYPES.filter((t) => toolTypes.has(t))) {
      const compaction = { ...taxonomyItem("compaction"), type };
      const plan = { ...taxonomyItem("plan_proposal"), type };
      expect(isContextCompactionToolCall(compaction)).toBe(type === "tool_call");
      expect(isPlanProposalToolCall(plan)).toBe(type === "tool_call");
    }
    const mcp = payload("mcp-spelling:0");
    expect(parseMcpName(mcp)).toEqual({ server: "fixture_server", tool: "lookup" });
    expect(isDelegatedAgentTool(mcp)).toBe(false);
    expect(isDelegatedAgentTool({ ...payload("crossagent_flagged"), isSubAgent: true })).toBe(true);
    expect(isSubAgentTool({ ...payload("crossagent_flagged"), isSubAgent: true })).toBe(false);
  });

  it("round-trips all summary labels and applies dominant-count/tie priority", () => {
    for (const [category, meta] of Object.entries(CATEGORY_META)) {
      expect(categoryFromSummaryLabel(meta.singular)).toBe(category);
      expect(categoryFromSummaryLabel(meta.plural)).toBe(category);
    }
    expect(categorizePersistedToolSummary("2 edits, 3 commands, 1 view")).toBe("executed");
    expect(categorizePersistedToolSummary("2 edits, 2 views")).toBe("viewed");
    expect(categorizePersistedToolSummary("2 MCPs, 2 thoughts")).toBe("mcp");
    expect(categorizePersistedToolSummary("2 unknown")).toBeNull();
    expect(categorizePersistedToolSummary("edits 2")).toBeNull();
  });

  it.each(COMMAND_ROWS)(
    "%s command intent has its own classification",
    (intent, _command, category) => {
      const item = taxonomyItem(`command_${intent}`);
      const p = commandExecutionPayloadSchema.parse(item.payload);
      expect(commandIntentDisplay(p.command).kind).toBe(intent);
      expect(categorizeItem(item)).toBe(category);
      expect(item.streams.command_output).toBe("command-start-marker\ncommand-end-marker");
    },
  );
  it.each(COMMAND_RECOGNITION_CASES.filter((c) => c.id.startsWith("command-check:")))(
    "$id: named check script intent",
    ({ item }) => {
      expect(
        commandIntentDisplay(commandExecutionPayloadSchema.parse(item.payload).command).kind,
      ).toBe("check");
    },
  );
});
