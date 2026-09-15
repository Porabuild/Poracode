import SwiftUI

struct RichChatReasoningRow: View {
  let text: String
  let isWorking: Bool

  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          Image(systemName: "brain.head.profile")
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

  private var preview: String {
    let lines = text.split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    let source = isWorking ? lines.last ?? "" : lines.joined(separator: " ")
    return source.count > 90 ? "\(source.prefix(87))…" : source
  }

  private func toggleExpanded() {
    guard !text.isEmpty else { return }
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

struct RichChatActivityRow: View {
  let title: String
  let text: String
  let systemImage: String
  let duration: String?
  let isWorking: Bool

  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          Image(systemName: systemImage)
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
