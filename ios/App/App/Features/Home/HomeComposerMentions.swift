import SwiftUI

extension HomeQuickComposeView {
  var mcpMentionSuggestions: [RichChatMCPMentionOption] {
    RichChatMCPMentionCatalog.suggestions(for: prompt)
  }

  var hasMentionSuggestions: Bool {
    !mcpMentionSuggestions.isEmpty || !fileMentionController.suggestions.isEmpty
  }

  var mentionSuggestions: some View {
    RichChatMentionSuggestionsView(
      mcps: mcpMentionSuggestions,
      files: fileMentionController.suggestions,
      selectMCP: selectMCPMention,
      selectFile: selectFileMention
    )
  }

  var contextChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(skills) { skill in
          Button {
            skills.removeAll { $0.id == skill.id }
          } label: {
            Label(skill.name, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeSkill): \(skill.name)")
        }

        ForEach(attachments) { attachment in
          Button {
            attachments.removeAll { $0.id == attachment.id }
          } label: {
            Label(attachment.name, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeAttachment): \(attachment.name)")
        }

        ForEach(Array(fileMentions.enumerated()), id: \.offset) { index, path in
          Button {
            fileMentions.remove(at: index)
          } label: {
            Label(path, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeFile): \(path)")
        }

        ForEach(mentionedMCPs) { mcp in
          Button {
            mentionedMCPs.removeAll { $0.id == mcp.id }
            disableMCPMention(mcp.id)
          } label: {
            Label("@\(mcp.name)", systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("\(SettingsIntegrationsStrings.disable): \(mcp.name)")
        }
      }
    }
  }

  func synchronizeFileMentions() {
    fileMentionController.selectProject(selectedProject)
    fileMentionController.update(draft: prompt)
  }

  func selectFileMention(_ entry: ProjectWorkspaceEntry) {
    fileMentions.append(entry.path)
    prompt = fileMentionController.consumeTrigger(from: prompt)
    promptFocused = true
  }

  func selectMCPMention(_ option: RichChatMCPMentionOption) {
    switch option.configKey {
    case .browser: browserMcp = true
    case .crossagents: crossagentMcp = true
    case .chrome: chromeMcp = true
    case .computerUse: computerUse = true
    case nil: break
    }
    let selection = option.selection
    if !mentionedMCPs.contains(where: { $0.id == selection.id }) {
      mentionedMCPs.append(selection)
    }
    prompt = fileMentionController.consumeTrigger(from: prompt)
    promptFocused = true
  }

  func disableMCPMention(_ id: String) {
    switch id {
    case "browser": browserMcp = false
    case "crossagents": crossagentMcp = false
    case "chrome": chromeMcp = false
    case "computer-use": computerUse = false
    default: break
    }
  }
}
