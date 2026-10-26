import SwiftUI

struct RichChatUploadedAttachment: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let mimeType: String
  let remotePath: String
}

struct RichChatComposerView: View {
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
  @Binding var configuration: ThreadConfig
  let agentStatus: AgentStatusRecord?
  let threadSlashCommands: [RemoteSlashCommand]?
  /// Live negotiated session controls for the open thread; nil keeps every
  /// composer control on the static capability projection.
  let sessionConfigOptions: JSONValue?
  let canConfigure: Bool
  var hasStartedSession: Bool = false
  /// User-saved visibility lists for the model picker; empty keeps the
  /// provider's advertised defaults in charge.
  var hiddenModels: [String: [String]] = [:]
  let fileMentionController: RichChatFileMentionController
  let onSubmissionStarted: () -> Void
  let onSubmissionFinished: (_ succeeded: Bool) -> Void
  let skillPickerContext: RichChatSkillPickerContext?
  /// Neutral live session actions; nil (or an empty inventory) adds no entry.
  var sessionActions: RichChatSessionActionsController?
  /// Explicit draft insertion only; a revise suggestion is never sent by the app.
  var onInsertIntoComposer: (String) -> Void = { _ in }

  @State private var importing = false
  @State private var attachmentError: String?
  @State private var controlsPresented: RichChatComposerControlsPresentation?
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
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .sheet(item: $controlsPresented) { _ in
      RichChatComposerControlsSheet(
        configuration: $configuration,
        agentStatus: agentStatus,
        presentationMode: .gui,
        sessionConfigOptions: sessionConfigOptions,
        hiddenModels: hiddenModels,
        hasStartedSession: hasStartedSession
      )
    }
    .sheet(isPresented: $showsSkillPicker) {
      if let skillPickerContext {
        RichChatComposerSkillPicker(context: skillPickerContext, selection: $skills)
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
    let canOpenControls = agentStatus != nil && canConfigure
    return RichChatAdaptiveComposer(
      text: $draft,
      selection: $draftSelection,
      isExpanded: $composerExpanded,
      hasPrompt: hasPrompt,
      hasTrailingAction: canSend || isTurnActive || controller.state.isSending,
      submit: { send() }
    ) {
      RichChatComposerInlineConfiguration(
        agentKind: agentKind,
        configuration: configuration,
        catalog: slashCommandCatalog,
        canOpen: canOpenControls,
        open: { controlsPresented = .controls }
      )
    } toolbar: {
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
      RichChatComposerInlineConfiguration(
        agentKind: agentKind,
        configuration: configuration,
        catalog: slashCommandCatalog,
        canOpen: canOpenControls,
        showsStatusIcons: false,
        open: { controlsPresented = .controls }
      )
      RichChatComposerConfigurationIcon(
        systemImage: configuration.mode == "plan" ? "list.bullet.clipboard" : "hammer",
        canOpen: canOpenControls,
        open: { controlsPresented = .controls }
      )
      RichChatComposerConfigurationIcon(
        systemImage: "checkmark.shield",
        canOpen: canOpenControls,
        open: { controlsPresented = .controls }
      )
    } trailing: {
      RichChatComposerTrailingAction(
        hasPrompt: canSend,
        isTurnActive: isTurnActive,
        isSending: controller.state.isSending,
        showsSendWhenEmpty: composerExpanded,
        importing: importing,
        isResolvingRequest: requestController.state.resolvingRequestID != nil,
        queue: { send(queueInsteadOfSteer: true) },
        interrupt: { Task { await controller.interrupt() } },
        send: { send() }
      )
    }
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
      compactToolbar: true,
      sessionActionEntries: entries,
      sessionActionsDisabled: sessionActions?.state.pendingActionID != nil,
      sessionActionsFailure: sessionActions?.state.inventoryFailure.map(RichChatStrings.failure),
      openSessionAction: open,
      retrySessionActions: { Task { await sessionActions?.refreshInventory() } }
    )
    .controlSize(.small)
    .frame(width: 32, height: 32)
  }

  private var slashCommandCatalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: agentStatus,
      presentationMode: .gui,
      configuration: configuration,
      threadSlashCommands: threadSlashCommands,
      sessionConfigOptions: sessionConfigOptions
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
    Task {
      if let activeRequest,
        let denial = RichChatPresentation.composerDenyResolution(for: activeRequest)
      {
        guard canResolveRequests,
          await requestController.resolve(denial, request: activeRequest)
        else {
          onSubmissionFinished(false)
          return
        }
      }
      let succeeded: Bool
      if queuesFollowUp {
        succeeded = await controller.queueFollowUp(
          RichSetPendingSteerInput(
            prompt: text,
            segments: segments.isEmpty ? nil : segments,
            config: configuration.richChatObject
          )
        )
      } else if queuesSteer {
        succeeded = await controller.setPendingSteer(
          RichSetPendingSteerInput(
            prompt: text,
            segments: segments.isEmpty ? nil : segments,
            config: configuration.richChatObject
          )
        )
      } else {
        succeeded = await controller.send(
          RichChatSendInput(
            prompt: text,
            config: configuration.richChatObject,
            segments: segments.isEmpty ? nil : segments,
            userMessageItemID: "user-\(UUID().uuidString.lowercased())"
          )
        )
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
    }
  }
}
