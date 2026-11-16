import SwiftUI

struct RichChatReasoningRow: View {
  let text: String
  let isWorking: Bool

  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          RichChatIcon(.thought)
            .font(.caption)
            .symbolEffect(.pulse, options: .repeating, isActive: isWorking)
          Text(isWorking ? RichChatStrings.thinking : RichChatStrings.reasoning)
            .fontWeight(.medium)
          if !expanded, !preview.isEmpty {
            Text(preview)
              .lineLimit(1)
              .foregroundStyle(.tertiary)
          }
          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 180 : 0))
        }
        .poracodeChatText(.metadata)
        .foregroundStyle(.secondary)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if expanded && !text.isEmpty {
        Text(RichChatAttributedText.presentation(text))
          .poracodeChatText(.command)
          .italic()
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.leading, 12)
          .overlay(alignment: .leading) {
            Rectangle()
              .fill(.quaternary)
              .frame(width: 1)
          }
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
  }

  private static let previewMaxLength = 500

  private var preview: String {
    let lines = text.split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    let source = isWorking ? lines.last ?? "" : lines.joined(separator: " ")
    guard source.count > Self.previewMaxLength else { return source }
    return "\(source.prefix(Self.previewMaxLength - 1))…"
  }

  private func toggleExpanded() {
    guard !text.isEmpty else { return }
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

struct RichChatActivityRow: View {
  let title: String
  let text: String
  let icon: RichChatIcon.Kind
  let duration: String?
  let isWorking: Bool

  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          RichChatIcon(icon)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(width: 14)
          Text(title)
            .fontWeight(.medium)
            .foregroundStyle(.secondary)
          if let duration {
            Text("·")
              .foregroundStyle(.quaternary)
            Text(duration)
              .monospacedDigit()
              .foregroundStyle(.secondary)
          }
          if isWorking {
            ProgressView()
              .controlSize(.mini)
              .tint(.secondary)
          }
          if !text.isEmpty {
            Image(systemName: "chevron.down")
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(.tertiary)
              .rotationEffect(.degrees(expanded ? 180 : 0))
          }
        }
        .poracodeChatText(.metadata)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if expanded && !text.isEmpty {
        Text(RichChatAttributedText.presentation(text))
          .poracodeChatText(.command)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 6)
          .overlay(alignment: .top) {
            Divider()
          }
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.leading, 16)
    .padding(.vertical, 4)
  }

  private func toggleExpanded() {
    guard !text.isEmpty else { return }
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

/// Template vectors generated from the same Lucide source as the PWA/Android.
struct RichChatIcon: View {
  enum Kind: String {
    case copy = "ChatCopy"
    case truncate = "ChatTruncate"
    case fork = "ChatFork"
    case gitBranch = "ChatGitBranch"
    case view = "ChatView"
    case search = "ChatSearch"
    case edit = "ChatEdit"
    case command = "ChatCommand"
    case mcp = "ChatMcp"
    case tool = "ChatTool"
    case thought = "ChatThought"
    case arrowDown = "ChatArrowDown"

    init(category: RichChatStrings.RichChatActivityCategory) {
      self = switch category {
      case .view: .view
      case .search: .search
      case .edit: .edit
      case .command: .command
      case .mcp: .mcp
      case .tool: .tool
      case .thought: .thought
      }
    }
  }

  let kind: Kind
  @ScaledMetric(relativeTo: .caption) private var size: CGFloat = 13

  init(_ kind: Kind) { self.kind = kind }

  var body: some View {
    Image(kind.rawValue)
      .resizable()
      .renderingMode(.template)
      .scaledToFit()
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}
