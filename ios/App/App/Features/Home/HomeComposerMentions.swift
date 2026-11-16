import SwiftUI

extension HomeQuickComposeView {
  var mcpMentionSuggestions: [RichChatMCPMentionOption] {
    RichChatMCPMentionCatalog.suggestions(for: draft.prompt)
  }

  var hasMentionSuggestions: Bool {
    !mcpMentionSuggestions.isEmpty || !draft.fileMentionController.suggestions.isEmpty
  }

  var mentionSuggestions: some View {
    RichChatMentionSuggestionsView(
      mcps: mcpMentionSuggestions,
      files: draft.fileMentionController.suggestions,
      selectMCP: selectMCPMention,
      selectFile: selectFileMention
    )
  }

  var contextChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(Array(draft.additionalSegments.enumerated()), id: \.offset) { index, segment in
          if let label = segment.composerChipLabel {
            Button { draft.additionalSegments.remove(at: index) } label: {
              Label(label, systemImage: "xmark.circle.fill").font(.caption2)
            }
            .poracodeSurfaceButtonStyle()
            .controlSize(.small)
          }
        }
        ForEach(draft.skills) { skill in
          Button {
            draft.skills.removeAll { $0.id == skill.id }
          } label: {
            Label(skill.name, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .poracodeSurfaceButtonStyle()
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeSkill): \(skill.name)")
        }

        ForEach(draft.attachments) { attachment in
          Button {
            draft.attachments.removeAll { $0.id == attachment.id }
          } label: {
            Label(attachment.name, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .poracodeSurfaceButtonStyle()
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeAttachment): \(attachment.name)")
        }

        ForEach(Array(draft.fileMentions.enumerated()), id: \.offset) { index, path in
          Button {
            draft.fileMentions.remove(at: index)
          } label: {
            Label(path, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .poracodeSurfaceButtonStyle()
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeFile): \(path)")
        }

        ForEach(draft.mentionedMCPs) { mcp in
          Button {
            draft.mentionedMCPs.removeAll { $0.id == mcp.id }
            disableMCPMention(mcp.id)
          } label: {
            Label("@\(mcp.name)", systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .poracodeSurfaceButtonStyle()
          .controlSize(.small)
          .accessibilityLabel("\(SettingsIntegrationsStrings.disable): \(mcp.name)")
        }
      }
    }
  }

  func synchronizeFileMentions() {
    draft.fileMentionController.selectProject(selectedProject)
    draft.fileMentionController.update(draft: draft.prompt)
  }

  func selectFileMention(_ entry: ProjectWorkspaceEntry) {
    draft.fileMentions.append(entry.path)
    draft.prompt = draft.fileMentionController.consumeTrigger(from: draft.prompt)
    draft.promptFocused = true
  }

  func selectMCPMention(_ option: RichChatMCPMentionOption) {
    switch option.configKey {
    case .browser: setMCP(.browser, enabled: true)
    case .crossagents: setMCP(.crossagents, enabled: true)
    case .chrome: setMCP(.chrome, enabled: true)
    case .computerUse: setMCP(.computerUse, enabled: true)
    case nil: break
    }
    let selection = option.selection
    if !draft.mentionedMCPs.contains(where: { $0.id == selection.id }) {
      draft.mentionedMCPs.append(selection)
    }
    draft.prompt = draft.fileMentionController.consumeTrigger(from: draft.prompt)
    draft.promptFocused = true
  }

  func disableMCPMention(_ id: String) {
    switch id {
    case "browser": setMCP(.browser, enabled: false)
    case "crossagents": setMCP(.crossagents, enabled: false)
    case "chrome": setMCP(.chrome, enabled: false)
    case "computer-use": setMCP(.computerUse, enabled: false)
    default: break
    }
  }
}
