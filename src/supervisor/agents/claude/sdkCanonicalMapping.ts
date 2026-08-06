// Barrel re-export for the Claude canonical mapping module. The implementation
// is split by concern under `./canonicalMapping/*`; this file preserves the
// original public API surface so importers (sdkSession, tests) are unaffected.
export { createClaudeMapperState, type ClaudeMapperState } from "./sdkCanonicalMappingState";
export { startClaudeTurn } from "./canonicalMapping/turn";
export { closeClaudeOpenItems } from "./canonicalMapping/textItems";
export {
  ACCEPT_SUGGESTION_OPTION_PREFIX,
  mapClaudePermissionRequest,
} from "./canonicalMapping/permissions";
export {
  buildClaudeQuestionAnswerEvents,
  mapClaudeQuestionRequest,
  parseClaudeQuestions,
  type ClaudeQuestion,
} from "./canonicalMapping/questions";
export {
  accumulateActiveGoalAssistantSpend,
  completeActiveGoalOnTaskDrainEvents,
  emitActiveGoalTick,
} from "./canonicalMapping/goal";
export {
  extractResultErrorMessage,
  isApiErrorResult,
  mapClaudeContextUsageResponse,
  nonDiagnosticErrors,
} from "./canonicalMapping/result";
export { mapClaudeSdkMessage, readParentToolUseId } from "./canonicalMapping/dispatch";
export {
  ClaudeUsageScopeTracker,
  createClaudeUsageSpentEvent,
} from "./canonicalMapping/usageSpent";
