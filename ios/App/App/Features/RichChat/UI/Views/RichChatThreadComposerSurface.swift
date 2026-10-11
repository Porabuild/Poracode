import SwiftUI

/// Leaf composer binding for a thread page. Draft edits invalidate this view,
/// not the transcript, toolbar, or responsive page layout.
struct RichChatThreadComposerSurface: View {
  @Bindable var state: RichChatThreadDraftState
  @Binding var isExpanded: Bool
  let baseConfiguration: ThreadConfig
  let canOperate: Bool
  let isTurnActive: Bool
  let controller: RichChatConversationController
  let requestController: RichChatRequestController
  let activeRequest: RichOpenRequest?
  let canResolveRequests: Bool
  let mediaController: RichChatMediaController
  let agentKind: String
  let agentStatus: AgentStatusRecord?
  let threadSlashCommands: [RemoteSlashCommand]?
  /// Live negotiated session controls retained on the thread row; nil keeps
  /// every composer control on the static capability projection.
  let sessionConfigOptions: JSONValue?
  let canConfigure: Bool
  /// User-saved visibility lists for the model picker; empty keeps the
  /// provider's advertised defaults in charge.
  var hiddenModels: [String: [String]] = [:]
  let fileMentionController: RichChatFileMentionController
  let skillPickerContext: RichChatSkillPickerContext?
  var sessionActions: RichChatSessionActionsController?
  var onInsertIntoComposer: (String) -> Void = { _ in }

  var body: some View {
    RichChatComposerView(
      draft: $state.text,
      attachments: $state.attachments,
      skills: $state.skills,
      mcps: $state.mcps,
      queuedSegments: $state.segments,
      composerExpanded: $isExpanded,
      canOperate: canOperate,
      isTurnActive: isTurnActive,
      controller: controller,
      requestController: requestController,
      activeRequest: activeRequest,
      canResolveRequests: canResolveRequests,
      mediaController: mediaController,
      agentKind: agentKind,
      configuration: configuration,
      agentStatus: agentStatus,
      threadSlashCommands: threadSlashCommands,
      sessionConfigOptions: sessionConfigOptions,
      canConfigure: canConfigure,
      hiddenModels: hiddenModels,
      fileMentionController: fileMentionController,
      onSubmissionStarted: state.beginSubmission,
      onSubmissionFinished: { state.finishSubmission(succeeded: $0) },
      skillPickerContext: skillPickerContext,
      sessionActions: sessionActions,
      onInsertIntoComposer: onInsertIntoComposer
    )
  }

  private var configuration: Binding<ThreadConfig> {
    Binding(
      get: { state.configuration ?? baseConfiguration },
      set: { state.configuration = $0 }
    )
  }
}
