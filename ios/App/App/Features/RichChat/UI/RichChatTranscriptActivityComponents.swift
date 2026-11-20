import SwiftUI

private struct RichChatActivityHeaderLayout: ViewModifier {
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  func body(content: Content) -> some View {
    content
      .frame(minHeight: dynamicTypeSize.isAccessibilitySize ? 44 : (sizeClass == .regular ? 28 : 32))
      .contentShape(Rectangle())
  }
}

extension View {
  func richChatActivityHeaderLayout() -> some View { modifier(RichChatActivityHeaderLayout()) }
}

struct RichChatReasoningRow: View {
  let text: String
  let isWorking: Bool
  var disclosureID: String? = nil

  @State private var localExpanded = false
  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.richChatFindHighlight) private var find
  @Environment(\.richChatActivityGrouped) private var isGrouped
  private var expansion: Binding<Bool> { TranscriptDisclosureContext.binding(disclosures, id: disclosureID, fallback: $localExpanded) }
  private var expanded: Bool { expansion.wrappedValue || find.revealsItem }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Button(action: toggleExpanded) {
        HStack(spacing: isGrouped ? 4 : 6) {
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
        .richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)

      if expanded && !text.isEmpty {
        find.text(RichChatAttributedText.presentation(text), part: .body)
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
    withAnimation(.snappy(duration: 0.22)) { expansion.wrappedValue = !expanded }
  }
}

struct RichChatActivityRow: View {
  let title: String
  let text: String
  let icon: RichChatIcon.Kind
  let duration: String?
  let isWorking: Bool
  var disclosureID: String? = nil
  var expandedBinding: Binding<Bool>? = nil
  var detailsAvailable = false
  var accessibilityID: String? = nil

  @State private var localExpanded = false
  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.richChatActivityGrouped) private var isGrouped
  private var expansion: Binding<Bool> {
    expandedBinding ?? TranscriptDisclosureContext.binding(disclosures, id: disclosureID, fallback: $localExpanded)
  }
  private var expanded: Bool { expansion.wrappedValue }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button(action: toggleExpanded) {
        HStack(spacing: isGrouped ? 4 : 6) {
          RichChatIcon(icon)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(minWidth: isGrouped ? 13 : 14)
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
          if detailsAvailable || !text.isEmpty {
            Image(systemName: "chevron.down")
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(.tertiary)
              .rotationEffect(.degrees(expanded ? 180 : 0))
              .accessibilityHidden(true)
          }
        }
        .poracodeChatText(.metadata)
        .richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier(accessibilityID ?? "native-e2e.activity-row")
      .accessibilityValue(detailsAvailable || !text.isEmpty
        ? (expanded ? ToolPresentationStrings.expanded : ToolPresentationStrings.collapsed) : "")

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
  }

  private func toggleExpanded() {
    guard detailsAvailable || !text.isEmpty else { return }
    withAnimation(.snappy(duration: 0.22)) { expansion.wrappedValue = !expanded }
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
    case check = "ChatCheck"
    case package = "ChatPackage"
    case list = "ChatList"
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
