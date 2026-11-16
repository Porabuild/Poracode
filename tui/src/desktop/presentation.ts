/**
 * The desktop chat's presentation semantics, consumed as-is so transcript rows
 * read the same in both clients: titles, icons, categories, group summaries,
 * and diff/output extraction come from the renderer's own modules. Only
 * framework-free modules belong here; React components and app-store state
 * stay out (see `bunPlugin.ts` for the Lingui shim these rely on). Some
 * bridged modules value-import `lucide-react` icon components — `iconGlyph`
 * maps their `displayName` to glyphs — so lucide-react is bundled into the
 * TUI even though none of it executes as React UI.
 */
export type { RuntimeChatItem } from "@/renderer/state/slices/runtimeChatItem";
export {
  extractAcpAddedFileText,
  extractAcpArgsPart,
  extractAcpDiffResultPart,
  extractAcpResultPart,
  extractAcpResultText,
  extractReadFileResultPart,
  type DiffSummary,
} from "@/renderer/components/thread/ChatPane/parts/items/acpToolPayload";
export {
  getCommandExecutionCollapsedHeader,
  getFileChangeCollapsedHeader,
  getToolCallCollapsedHeader,
} from "@/renderer/components/thread/ChatPane/parts/items/collapsedHeaderCache";
export type { CommandIntentKind } from "@/renderer/components/thread/ChatPane/parts/items/commandSummary";
export {
  formatCompactionSummary,
  isContextCompactionToolCall,
} from "@/renderer/components/thread/ChatPane/parts/items/contextCompactionToolCall";
export { isPlanProposalToolCall } from "@/renderer/components/thread/ChatPane/parts/items/planProposalToolCall";
export {
  getReasoningInlinePreview,
  getReasoningLastLine,
  getReasoningPreview,
} from "@/renderer/components/thread/ChatPane/parts/items/reasoningPreview";
export { isToolGroupItem as isChatToolGroupItem } from "@/renderer/components/thread/ChatPane/chatToolGroupItem";
export {
  analyzeEditToolGroup,
  categorizeItem,
  isToolGroupItem,
  segmentToolGroupRows,
  summarizeToolCalls,
  type GroupCategory,
  type GroupSection,
  type SameFileEditGroupSummary,
  type ToolGroupRowSegment,
} from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
export {
  buildSubAgentProgressParts,
  buildSubAgentRowText,
  formatSubAgentEffortLabel,
  formatSubAgentModelLabel,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
  splitAgentTitleMeta,
  type SubAgentProgressPart,
  type SubAgentProgressPartKind,
  type SubAgentRowText,
} from "@/renderer/components/thread/ChatPane/parts/items/subAgentProgress";
export { delegatedAgentResultText } from "@/renderer/components/thread/ChatPane/parts/items/delegatedAgentResult";
export {
  deriveToolDisplay,
  isCrewRun,
  isCrossagentTool,
  isDelegatedAgentTool,
  isWorkflowTool,
  readSubAgentType,
  type ToolDisplay,
} from "@/renderer/components/thread/ChatPane/parts/items/toolDisplay";
export { parseWorkflowInfo } from "@/renderer/components/thread/ChatPane/parts/items/workflowDisplay";
export {
  pickLabel as pickWorkflowResultLabel,
  pickResultDetail,
  summarizeObject as summarizeWorkflowResult,
  workflowResultView,
  type ResultList as WorkflowResultList,
  type WorkflowResultView,
} from "@/renderer/components/thread/ChatPane/parts/items/workflowResult";
export { deriveWebSearchDisplay } from "@/renderer/components/thread/ChatPane/parts/items/webSearchDisplay";
export { toProjectRelativeDisplayPath } from "@/renderer/components/thread/ChatPane/chatPathUtils";
export {
  fallbackChatLinkLabel,
  shouldResolveChatLinkTitle,
} from "@/renderer/components/thread/ChatPane/parts/items/chatLinkLabel";
export { parsePathRefUrl } from "@/renderer/components/thread/ChatPane/parts/items/markdownPathRefs";
export {
  PROJECT_PATH_TOKEN_SOURCE,
  parseChatPathRef,
  parseProjectPathRef,
  type ProjectPathRef,
} from "@/renderer/components/thread/ChatPane/parts/items/parseProjectPathRef";
export { isReadLikeToolPayload } from "@/renderer/components/thread/ChatPane/parts/items/readLikeToolPayload";
export { getBasename } from "@/shared/pathUtils";
export { formatDuration, formatElapsed } from "@/renderer/utils/formatTime";
export { formatEffortLabel } from "@/renderer/components/common/effortLabel";
export { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
export { getToolLikePayload, isVisibleRuntimeItem } from "@/shared/runtimeItemVisibility";
export { stripAnsiPreservingLayout } from "@/shared/ansi";
export { splitPath } from "@/shared/pathUtils";
export { i18n } from "./i18n";
