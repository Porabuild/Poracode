import SwiftUI

struct RichChatUploadedAttachment: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let mimeType: String
  let remotePath: String
}

struct RichChatComposerView: View {
  @Environment(\.composerVoiceHost) private var voiceHost
  @Environment(\.composerPreferences) var preferences
  @Binding var draft: String
  @Binding var attachments: [RichChatUploadedAttachment]
  @Binding var skills: [RichChatSelectedSkill]
  @Binding var mcps: [RichChatSelectedMCP]
  @Binding var queuedSegments: [RichPromptSegment]
  @Binding var composerExpanded: Bool
  let canOperate: Bool
  let isTurnActive: Bool
  let controller: RichChatConversationController
  let requestController: RichChatRequestController
  let activeRequest: RichOpenRequest?
  let canResolveRequests: Bool
  let mediaController: RichChatMediaController
  let agentKind: String
  var agentInstanceID: String? = nil
  @Binding var configuration: ThreadConfig
  let agentStatus: AgentStatusRecord?
  let threadSlashCommands: [RemoteSlashCommand]?
  let sessionConfigOptions: JSONValue?
  let canConfigure: Bool
  var hasStartedSession: Bool = false
  var launchConfiguration = ThreadConfig.empty
  var hiddenModels: [String: [String]] = [:]
  let fileMentionController: RichChatFileMentionController
  let onSubmissionStarted: () -> Void
  let onSubmissionFinished: (_ succeeded: Bool) -> Void
  let skillPickerContext: RichChatSkillPickerContext?
  var sessionActions: RichChatSessionActionsController?
  var onInsertIntoComposer: (String) -> Void = { _ in }
  var resumeContext = RichChatComposerResumeContext()
  var openSideChat: (() -> Void)?
  var sideQuestion: ((String) async -> Bool)?
  var crewContext: RichChatCrewComposerContext?
  var controlsDestination: Binding<RichChatComposerControlsPresentation?>?

  @State private var importing = false
  @State var transferringSideQuestion = false
  @State private var attachmentError: String?
  @State var localControlsPresented: RichChatComposerControlsPresentation?
  @State private var showsSkillPicker = false
  @State private var draftSelection: NSRange?

  var body: some View {
    VStack(spacing: 6) {
      if !attachments.isEmpty || !skills.isEmpty || !mcps.isEmpty || !queuedSegments.isEmpty {
        RichChatComposerContextBar(
          attachments: $attachments,
          skills: $skills,
          mcps: $mcps,
          queuedSegments: $queuedSegments,
          configuration: $configuration
        )
      }
      if let attachmentError {
        Text(attachmentError).poracodeChatText(.metadata).foregroundStyle(.red)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if canOperate {
        if !slashSuggestions.isEmpty { slashCommandPanel }
        if !mentionSuggestionsAreEmpty { mentionSuggestionsPanel }
        composerRow
      } else {
        PoracodeStatusBubble {
          Label(RichChatStrings.readOnly, systemImage: "lock")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(.leading, 16)
    .padding(.trailing, 8)
    .padding(.bottom, 8)
    .sheet(item: controlsBinding) { presentation in
      if presentation == .crew {
        crewRosterSheet.poracodeFormSheetSizing()
      } else {
        RichChatComposerControlsSheet(
          configuration: $configuration,
          agentStatus: agentStatus,
          presentationMode: .gui,
          sessionConfigOptions: sessionConfigOptions,
          hiddenModels: hiddenModels,
          hasStartedSession: hasStartedSession, bindingsReadOnly: true,
          agentInstanceID: agentInstanceID
        )
        .poracodeFormSheetSizing()
      }
    }
    .sheet(isPresented: $showsSkillPicker) {
      if let skillPickerContext {
        RichChatComposerSkillPicker(context: skillPickerContext, selection: $skills)
          .poracodeFormSheetSizing()
      }
    }
    .onAppear { fileMentionController.update(draft: draft) }
    .onChange(of: draft) { _, value in fileMentionController.update(draft: value) }
  }

  private var composerRow: some View {
    let hasPrompt =
      !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !queuedSegments.isEmpty || !skills.isEmpty || !mcps.isEmpty
    let canSend = hasPrompt || !attachments.isEmpty
    let resume = resumeAction(canSend: canSend)
    let placeholder =
      (agentStatus?.label).map { RichChatStrings.messageAgent($0) } ?? RichChatStrings.message
    return RichChatAdaptiveComposer(
      text: $draft,
      selection: $draftSelection,
      isExpanded: $composerExpanded, controlsVisible: controlsPresented != nil || voiceHost?.request?.controller.owner == voiceOwner,
      hasPrompt: hasPrompt,
      hasTrailingAction: canSend || isTurnActive || controller.state.isSending || resume != nil,
      placeholder: placeholder,
      submit: { send() }
    ) {
      composerSelectors(expandsComposer: true)
    } leading: {
      if let sessionActions {
        RichChatSessionActionsControls(
          controller: sessionActions,
          agentKind: agentKind,
          isDisabled: !canOperate || controller.state.isSending,
          insertIntoComposer: onInsertIntoComposer
        ) { entries, open in
          attachmentButton(entries: entries, open: open)
        }
      } else {
        attachmentButton()
      }
    } configuration: {
      composerSelectors()
    } voice: {
      ComposerVoiceButton(owner: voiceOwner, text: $draft, selection: $draftSelection,
        isEnabled: canOperate && !controller.state.isSending)
    } trailing: {
      RichChatComposerTrailingAction(
        hasPrompt: canSend,
        isTurnActive: isTurnActive,
        isSending: controller.state.isSending || transferringSideQuestion,
        showsSendWhenEmpty: composerExpanded,
        importing: importing,
        isResolvingRequest: requestController.state.resolvingRequestID != nil,
        queue: { send(queueInsteadOfSteer: true) },
        resume: resume,
        interrupt: { Task { await controller.interrupt() } },
        send: { send() }
      )
    }
  }

  private var voiceOwner: VoiceInputOwner? {
    controller.state.target.map { .init(lease: $0.lease, conversationID: $0.threadID) }
  }

  private func composerSelectors(expandsComposer: Bool = false) -> some View {
    RichChatComposerSelectors(
      configuration: $configuration, agentKind: agentKind, catalog: slashCommandCatalog,
      canConfigure: agentStatus != nil && canConfigure, hasStartedSession: hasStartedSession,
      openAll: { if ThreadCrewBinding(wire: configuration.crew) != nil { openCrewEditor() } else { controlsPresented = .controls } },
      expandComposer: expandsComposer ? { composerExpanded = true } : nil,
      openCrew: ThreadCrewBinding(wire: configuration.crew) == nil ? nil : { openCrewEditor() }
    )
  }

  private func attachmentButton(
    entries: [RichChatSessionActionEntryTarget] = [],
    open: @escaping (RichChatSessionActionPanelKind) -> Void = { _ in }
  ) -> some View {
    let canOpenControls = agentStatus != nil && canConfigure
    return RichChatComposerAttachmentButton(
      attachments: $attachments,
      importing: $importing,
      errorMessage: $attachmentError,
      mediaController: mediaController,
      disabled: controller.state.isSending,
      openSkills: skillPickerContext == nil ? nil : { showsSkillPicker = true },
      openControls: canOpenControls ? { controlsPresented = .controls } : nil,
      configuration: $configuration,
      launchConfiguration: launchConfiguration,
      planModes: canOpenControls ? slashCommandCatalog.modeOptions(for: configuration.model) : [],
      openCrew: crewPresentation == nil ? nil : { openCrewEditor() },
      openSideChat: openSideChat,
      compactToolbar: true,
      sessionActionEntries: entries,
      sessionActionsDisabled: sessionActions?.state.pendingActionID != nil,
      sessionActionsFailure: sessionActions?.state.inventoryFailure.map(RichChatStrings.failure),
      openSessionAction: open,
      retrySessionActions: { Task { await sessionActions?.refreshInventory() } }
    )
    .controlSize(.small)
    .frame(width: 44, height: 44)
  }

  var slashCommandCatalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: agentStatus,
      presentationMode: .gui,
      configuration: configuration,
      threadSlashCommands: threadSlashCommands,
      sessionConfigOptions: sessionConfigOptions, hiddenModels: hiddenModels,
      agentInstanceID: agentInstanceID,
      modelPreferences: preferences?.modelPreferences(for: .init(agentKind: agentKind,
        agentInstanceID: agentInstanceID, presentationMode: .gui)) ?? [:]
    )
  }

  private var slashSuggestions: [RichChatSlashCommandOption] {
    Array(slashCommandCatalog.slashSuggestions(for: draft, selection: draftSelection).prefix(6))
  }

  private var slashCommandPanel: some View {
    VStack(spacing: 0) {
      ForEach(slashSuggestions) { command in
        Button {
          if let skill = command.skill {
            if !skills.contains(where: { $0.id == skill.id }) { skills.append(skill) }
            if let reference = RichChatSkillReference.atCaret(in: draft, selection: draftSelection) {
              draft = reference.removingToken(from: draft)
              draftSelection = NSRange(location: reference.range.location, length: 0)
            } else {
              draft = ""
              draftSelection = nil
            }
          } else {
            draft = "/\(command.displayID) "
          }
          composerExpanded = true
        } label: {
          RichChatSlashCommandRow(command: command)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("/\(command.displayID), \(command.label)")
        if command.id != slashSuggestions.last?.id { Divider() }
      }
    }
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private func send(queueInsteadOfSteer: Bool = false) {
    guard !transferringSideQuestion, !transferSideQuestionIfPresent() else { return }
    let typedText = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let structuredPrompt =
      queuedSegments.compactMap(\.promptText)
      + skills.map { $0.invocation }
      + mcps.map { "@\($0.name)" }
    let text =
      typedText.isEmpty
      ? structuredPrompt.joined(separator: " ") : typedText
    let attachmentSegments = attachments.map {
      RichPromptSegment.attachment(path: $0.remotePath, mimeType: $0.mimeType)
    }
    guard !text.isEmpty || !attachmentSegments.isEmpty else { return }
    let textSegments: [RichPromptSegment] = typedText.isEmpty ? [] : [.text(content: draft)]
    let contextSegments = (queuedSegments + skills.map(\.segment) + mcps.map(\.segment))
      .flatMap { [$0, RichPromptSegment.text(content: " ")] }
    let segments = contextSegments + textSegments + attachmentSegments
    let turnActive = isTurnActive && !controller.state.isSending
    let queuesSteer = turnActive && !queueInsteadOfSteer
    let queuesFollowUp = turnActive && queueInsteadOfSteer
    onSubmissionStarted()
    let steerInput = RichSetPendingSteerInput(
      prompt: text,
      segments: segments.isEmpty ? nil : segments,
      config: configuration.richChatObject
    )
    let sentConfiguration = configuration
    let input = RichChatSendInput(prompt: text, config: sentConfiguration.richChatObject,
      segments: segments.isEmpty ? nil : segments, userMessageItemID: "user-\(UUID().uuidString.lowercased())")
    let resume = resumeContext
    Task {
      guard await declinePendingApproval() else {
        onSubmissionFinished(false)
        return
      }
      var succeeded: Bool
      if queuesFollowUp {
        succeeded = await controller.queueFollowUp(steerInput)
      } else if queuesSteer {
        succeeded = await controller.setPendingSteer(steerInput)
      } else {
        succeeded = await controller.send(input)
        if !succeeded { succeeded = await resume.relaunchRefused(input, sentConfiguration) }
      }
      if succeeded {
        draft = ""
        attachments = []
        skills = []
        mcps = []
        queuedSegments = []
        composerExpanded = false
      }
      onSubmissionFinished(succeeded)
      resumeContext.sendSettled(succeeded)
    }
  }
}
