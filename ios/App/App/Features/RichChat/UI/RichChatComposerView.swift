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
  let canConfigure: Bool
  let fileMentionController: RichChatFileMentionController
  let onSubmissionStarted: () -> Void
  let onSubmissionFinished: (_ succeeded: Bool) -> Void
  let skillPickerContext: RichChatSkillPickerContext?

  @State private var importing = false
  @State private var attachmentError: String?
  @State private var controlsPresented: RichChatComposerControlsPresentation?
  @State private var showsSkillPicker = false

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
        presentationMode: .gui
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
    let canOpenControls = agentStatus != nil && canConfigure
    return RichChatAdaptiveComposer(
      text: $draft,
      isExpanded: $composerExpanded,
      hasPrompt: hasPrompt,
      hasTrailingAction: hasPrompt || isTurnActive || controller.state.isSending,
      submit: send
    ) {
      RichChatComposerInlineConfiguration(
        agentKind: agentKind,
        configuration: configuration,
        catalog: slashCommandCatalog,
        canOpen: canOpenControls,
        open: { controlsPresented = .controls }
      )
    } toolbar: {
      RichChatComposerAttachmentButton(
        attachments: $attachments,
        importing: $importing,
        errorMessage: $attachmentError,
        mediaController: mediaController,
        disabled: controller.state.isSending,
        openSkills: skillPickerContext == nil ? nil : { showsSkillPicker = true },
        openControls: canOpenControls ? { controlsPresented = .controls } : nil,
        compactToolbar: true
      )
      .controlSize(.small)
      .frame(width: 32, height: 32)
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
        hasPrompt: hasPrompt,
        isTurnActive: isTurnActive,
        isSending: controller.state.isSending,
        showsSendWhenEmpty: composerExpanded,
        importing: importing,
        isResolvingRequest: requestController.state.resolvingRequestID != nil,
        interrupt: { Task { await controller.interrupt() } },
        send: send
      )
    }
  }

  private var slashCommandCatalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: agentStatus,
      presentationMode: .gui,
      configuration: configuration,
      threadSlashCommands: threadSlashCommands
    )
  }

  private var slashSuggestions: [RichChatSlashCommandOption] {
    Array(slashCommandCatalog.slashSuggestions(for: draft).prefix(6))
  }

  private var slashCommandPanel: some View {
    VStack(spacing: 0) {
      ForEach(slashSuggestions) { command in
        Button {
          if let skill = command.skill {
            if !skills.contains(where: { $0.id == skill.id }) { skills.append(skill) }
            draft = ""
          } else {
            draft = "/\(command.displayID) "
          }
          composerExpanded = true
        } label: {
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("/\(command.displayID)")
              .font(.callout.monospaced().weight(.semibold))
              .foregroundStyle(.primary)
            VStack(alignment: .leading, spacing: 2) {
              Text(command.label)
                .font(.callout)
                .foregroundStyle(.primary)
              if let detail = command.description ?? command.argumentHint {
                Text(detail)
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  .lineLimit(2)
              }
            }
            Spacer(minLength: 0)
          }
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .padding(.horizontal, 10)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("/\(command.displayID), \(command.label)")
        if command.id != slashSuggestions.last?.id { Divider() }
      }
    }
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private var mcpSuggestions: [RichChatMCPMentionOption] {
    RichChatMCPMentionCatalog.suggestions(for: draft)
  }

  private var mentionSuggestionsAreEmpty: Bool {
    mcpSuggestions.isEmpty && fileMentionController.suggestions.isEmpty
  }

  private var mentionSuggestionsPanel: some View {
    RichChatMentionSuggestionsView(
      mcps: mcpSuggestions,
      files: fileMentionController.suggestions,
      selectMCP: selectMCPMention,
      selectFile: selectFileMention
    )
  }

  private func selectMCPMention(_ option: RichChatMCPMentionOption) {
    var nextConfiguration = configuration
    RichChatMCPMentionCatalog.enable(option.configKey, in: &nextConfiguration)
    configuration = nextConfiguration
    let selection = option.selection
    if !mcps.contains(where: { $0.id == selection.id }) { mcps.append(selection) }
    draft = fileMentionController.consumeTrigger(from: draft)
    composerExpanded = true
  }

  private func selectFileMention(_ entry: ProjectWorkspaceEntry) {
    queuedSegments.append(.file(path: entry.path))
    draft = fileMentionController.consumeTrigger(from: draft)
    composerExpanded = true
  }

  private func send() {
    let typedText = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let structuredPrompt =
      queuedSegments.compactMap(\.promptText)
      + skills.map { $0.invocation }
      + mcps.map { "@\($0.name)" }
    let text =
      typedText.isEmpty
      ? structuredPrompt.joined(separator: " ") : typedText
    guard !text.isEmpty else { return }
    let attachmentSegments = attachments.map {
      RichPromptSegment.attachment(path: $0.remotePath, mimeType: $0.mimeType)
    }
    let segments = queuedSegments + skills.map(\.segment) + mcps.map(\.segment) + attachmentSegments
    let queuesSteer = isTurnActive && !controller.state.isSending
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
      if queuesSteer {
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
