import SwiftUI

struct RichChatUploadedAttachment: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let mimeType: String
  let remotePath: String

  var segment: RichPromptSegment { .attachment(path: remotePath, mimeType: mimeType) }
}

struct RichChatDraftRestorationAction: View {
  let isRevertedPrompt: Bool
  let activate: () -> Void

  var body: some View {
    Button(action: activate) {
      Label(
        isRevertedPrompt ? RichChatStrings.restoreRevertedPrompt : RichChatStrings.restorePreviousDraft,
        systemImage: isRevertedPrompt ? "arrow.uturn.forward" : "arrow.uturn.backward"
      )
      .poracodeChatText(.metadata, weight: .medium)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(Color.primary.opacity(0.09), in: Capsule())
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("native-e2e.composer-alternate-draft")
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

enum RichChatComposerControlsPresentation: String, Identifiable {
  case controls
  case crew
  case models
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
    .poracodeSurfaceButtonStyle(tint: .secondary)
    .accessibilityLabel(accessibilityLabel)
  }
}

extension RichPromptSegment {
  var composerChipLabel: String? {
    switch self {
    case .selectedText(let text): "“\(text.prefix(80))”"
    case .file(let path): path
    case .diffComment(let path, let lineNumber, _, _, _): "\(path):\(lineNumber)"
    case .thread(_, let title): title
    default: nil
    }
  }

  var composerRemovalLabel: String {
    if case .selectedText = self { return SideChatStrings.removeQuote }
    if case .file = self { return RichChatStrings.removeFile }
    return RichChatStrings.removeReviewComment
  }

  var promptText: String? {
    switch self {
    case .text(let text), .selectedText(let text): text
    case .skill(_, _, let invocation, _, _, _, _): invocation
    case .mcp(_, let name): "@\(name)"
    case .file(let path): "@\(path)"
    case .diffComment(_, _, _, _, let body): body
    case .thread(_, let title): "@\(title)"
    default: nil
    }
  }
}
