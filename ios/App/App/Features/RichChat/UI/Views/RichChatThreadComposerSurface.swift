import SwiftUI

/// Leaf composer binding for a thread page. Draft edits invalidate this view,
/// not the transcript, toolbar, or responsive page layout.
struct RichChatThreadComposerSurface: View {
  @Environment(\.composerPreferences) private var preferences
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
  var agentInstanceID: String? = nil
  let agentStatus: AgentStatusRecord?
  let threadSlashCommands: [RemoteSlashCommand]?
  /// Live negotiated session controls retained on the thread row; nil keeps
  /// every composer control on the static capability projection.
  let sessionConfigOptions: JSONValue?
  let canConfigure: Bool
  var hasStartedSession: Bool = false
  /// User-saved visibility lists for the model picker; empty keeps the
  /// provider's advertised defaults in charge.
  var hiddenModels: [String: [String]] = [:]
  let fileMentionController: RichChatFileMentionController
  let skillPickerContext: RichChatSkillPickerContext?
  var sessionActions: RichChatSessionActionsController?
  var onInsertIntoComposer: (String) -> Void = { _ in }
  /// Resume for a cut-off turn, gated on the thread and transcript by the page.
  var resumeContext = RichChatComposerResumeContext()
  var openSideChat: (() -> Void)?
  var sideQuestion: ((String) async -> Bool)?
  var crewContext: RichChatCrewComposerContext?
  var isConnectingHost = false

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
      agentInstanceID: agentInstanceID,
      configuration: configuration,
      agentStatus: agentStatus,
      threadSlashCommands: threadSlashCommands,
      sessionConfigOptions: sessionConfigOptions,
      canConfigure: canConfigure,
      hasStartedSession: hasStartedSession,
      launchConfiguration: baseConfiguration,
      hiddenModels: hiddenModels,
      fileMentionController: fileMentionController,
      onSubmissionStarted: state.beginSubmission,
      onSubmissionFinished: { state.finishSubmission(succeeded: $0) },
      skillPickerContext: skillPickerContext,
      sessionActions: sessionActions,
      onInsertIntoComposer: onInsertIntoComposer,
      resumeContext: resumeContext,
      openSideChat: openSideChat,
      sideQuestion: sideQuestion,
      crewContext: crewContext,
      controlsDestination: $state.composerControlDestination,
      stateOwnerID: ObjectIdentifier(state),
      isConnectingHost: isConnectingHost,
      restoredPromptOrder: state.restoredPromptOrder,
      draftRestoration: state.alternateDraftIsRevertedPrompt.map { isRevertedPrompt in
        .init(isRevertedPrompt: isRevertedPrompt, activate: state.switchRestoredDraft)
      }
    )
    .onChange(of: restorablePromptID, initial: true) { _, id in
      guard id != nil else { return }
      let catalog = RichChatComposerControlCatalog(
        agentStatus: agentStatus, presentationMode: .gui, configuration: configuration.wrappedValue,
        threadSlashCommands: threadSlashCommands, sessionConfigOptions: sessionConfigOptions,
        agentInstanceID: agentInstanceID
      )
      if state.restoreRevertedPrompt(availableSkills: catalog.slashCommands.compactMap(\.skill)) {
        isExpanded = true
      }
    }
  }

  private var restorablePromptID: UUID? {
    guard canOperate, controller.state.activeMutation == nil, !controller.state.isSending else { return nil }
    return state.pendingRevertedPromptID
  }

  private var configuration: Binding<ThreadConfig> {
    Binding(
      get: { ModelSelectionBindings.validated(state.configuration ?? baseConfiguration, owner: selectionOwner) },
      set: {
        let value = ModelSelectionBindings.validated($0, owner: selectionOwner)
        state.configuration = value
        if canOperate { preferences?.rememberModel(value, owner: selectionOwner) }
      }
    )
  }

  private var selectionOwner: ModelSelectionOwner {
    .init(agentKind: agentKind, agentInstanceID: agentInstanceID, presentationMode: .gui)
  }
}
