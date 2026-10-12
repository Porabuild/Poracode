import type {
  CommandExecutionPayload,
  ErrorItemPayload,
  FileChangePayload,
  GoalItemPayload,
  MessageItemPayload,
  PlanItemPayload,
  ProviderHandoffItemPayload,
  QuestionAnswerItemPayload,
  ReasoningItemPayload,
  ToolCallPayload,
  WebSearchPayload,
} from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { GroupCategory } from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";

// Auxiliary body fields are already consumed by acpToolPayload/collapsedHeaderCache.
// Core canonical schemas intentionally do not enumerate these retained details.
type BodyDetails = {
  name?: string;
  title?: string;
  args?: unknown;
  result?: unknown;
  editOldText?: string;
  editNewText?: string;
};
export type Payloads = {
  tool_call: ToolCallPayload;
  mcp_tool_call: ToolCallPayload;
  dynamic_tool_call: ToolCallPayload;
  image_view: ToolCallPayload;
  file_change: FileChangePayload & BodyDetails;
  command_execution: CommandExecutionPayload & BodyDetails;
  web_search: WebSearchPayload & BodyDetails;
  reasoning: ReasoningItemPayload;
  user_message: MessageItemPayload;
  assistant_message: MessageItemPayload;
  question_answer: QuestionAnswerItemPayload;
  plan: PlanItemPayload;
  goal: GoalItemPayload;
  error: ErrorItemPayload;
  provider_handoff: ProviderHandoffItemPayload;
};
export interface TaxonomyExpectation {
  category: GroupCategory;
  visible: boolean;
  groupEligible: boolean;
  title?: string;
  icon?: string;
  subagent?: boolean;
  crossagent?: boolean;
  workflow?: boolean;
  skill?: boolean;
  spawnTransport?: boolean;
  questionName?: boolean;
  compaction?: boolean;
  planProposal?: boolean;
  inlineImage?: boolean;
}
export interface TaxonomyCase {
  id: string;
  item: RuntimeChatItem;
  expected: TaxonomyExpectation;
  /** Explicit links to the proposal, including renamed synthetic image cases. */
  inventoryIds: readonly string[];
}

export interface TaxonomyFrame {
  label: string;
  items: readonly RuntimeChatItem[];
  /** Strings are standalone rows; arrays are exact grouped membership/order. */
  rows: readonly (string | readonly string[])[];
  parentItemId?: string;
}
export interface GroupingScenario {
  id: string;
  frames: readonly TaxonomyFrame[];
  uiChecksNotRun: readonly string[];
}
