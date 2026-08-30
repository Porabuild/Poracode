import SwiftUI

enum RichChatComposerControlsPresentation: String, Identifiable {
  case controls
  var id: String { rawValue }
}

/// Reusable structured-context strip shared by native rich-chat composers.
/// Each token owns its removal action while the parent composer owns sending.
struct RichChatComposerContextBar: View {
  @Binding var attachments: [RichChatUploadedAttachment]
  @Binding var skills: [RichChatSelectedSkill]
  @Binding var mcps: [RichChatSelectedMCP]
  @Binding var queuedSegments: [RichPromptSegment]
  @Binding var configuration: ThreadConfig

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(skills) { skill in
          removalButton(
            label: skill.pluginName ?? skill.name,
            accessibilityLabel: "\(RichChatStrings.removeSkill): \(skill.name)"
          ) {
            skills.removeAll { $0.id == skill.id }
          }
        }
        ForEach(mcps) { mcp in
          removalButton(
            label: "@\(mcp.name)",
            accessibilityLabel: "\(SettingsIntegrationsStrings.disable): \(mcp.name)"
          ) {
            mcps.removeAll { $0.id == mcp.id }
            var nextConfiguration = configuration
            RichChatMCPMentionCatalog.disable(mcp.id, in: &nextConfiguration)
            configuration = nextConfiguration
          }
        }
        ForEach(attachments) { attachment in
          removalButton(
            label: attachment.name,
            accessibilityLabel: "\(RichChatStrings.removeAttachment): \(attachment.name)"
          ) {
            attachments.removeAll { $0.id == attachment.id }
          }
        }
        ForEach(Array(queuedSegments.enumerated()), id: \.offset) { index, segment in
          if let label = segment.composerChipLabel {
            removalButton(
              label: label,
              accessibilityLabel: "\(segment.composerRemovalLabel): \(label)"
            ) {
              queuedSegments.remove(at: index)
            }
          }
        }
      }
    }
  }

  private func removalButton(
    label: String,
    accessibilityLabel: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(label, systemImage: "xmark.circle.fill")
        .poracodeChatText(.metadata)
    }
    .buttonStyle(.bordered)
    .tint(.secondary)
    .accessibilityLabel(accessibilityLabel)
  }
}

extension RichPromptSegment {
  var composerChipLabel: String? {
    switch self {
    case .file(let path): path
    case .diffComment(let path, let lineNumber, _, _, _): "\(path):\(lineNumber)"
    default: nil
    }
  }

  var composerRemovalLabel: String {
    if case .file = self { return RichChatStrings.removeFile }
    return RichChatStrings.removeReviewComment
  }

  var promptText: String? {
    switch self {
    case .file(let path): "@\(path)"
    case .diffComment(_, _, _, _, let body): body
    default: nil
    }
  }
}
