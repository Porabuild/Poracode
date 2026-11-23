import SwiftUI

/// Specialized compact tool presentation cards for file diffs, command execution,
/// and web search summaries when tool metadata is present.
struct RichChatToolDiffPreviewCard: View {
  let path: String
  let diff: String
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button { expanded.toggle() } label: {
        HStack(spacing: 8) {
          Image(systemName: "doc.text.magnifyingglass")
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(path).font(.caption.monospaced()).lineLimit(1)
          Spacer()
          Image(systemName: expanded ? "chevron.up" : "chevron.down")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
      .buttonStyle(.plain)
      if expanded {
        ScrollView(.horizontal, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 1) {
            ForEach(Array(diff.components(separatedBy: "\n").prefix(120).enumerated()), id: \.offset) { _, line in
              Text(line)
                .font(.caption2.monospaced())
                .foregroundStyle(lineColor(line))
            }
          }
        }
        .padding(8)
        .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 6))
      }
    }
    .padding(8)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
  }

  private func lineColor(_ line: String) -> Color {
    if line.hasPrefix("+") && !line.hasPrefix("+++") { return .green }
    if line.hasPrefix("-") && !line.hasPrefix("---") { return .red }
    if line.hasPrefix("@@") { return .accentColor }
    return .primary
  }
}

struct RichChatToolCommandCard: View {
  let command: String
  let exitCode: Int?
  let output: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Image(systemName: "terminal")
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(command).font(.caption.monospaced()).lineLimit(2)
        Spacer()
        if let exitCode {
          Text("exit \(exitCode)")
            .font(.caption2.monospacedDigit().weight(.semibold))
            .foregroundStyle(exitCode == 0 ? .green : .red)
        }
      }
      if let output, !output.isEmpty {
        Text(output.prefix(600))
          .font(.caption2.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(8)
      }
    }
    .padding(8)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
  }
}
