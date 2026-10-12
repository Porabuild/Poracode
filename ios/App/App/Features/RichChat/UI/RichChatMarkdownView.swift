import SwiftUI

struct RichChatMarkdownView: View {
  let source: String

  private var blocks: [RichChatMarkdownBlock] {
    RichChatMarkdownParser.parse(source)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
        blockView(block)
          .padding(.top, blockTopPadding(block, index: index))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
  }

  @ViewBuilder
  private func blockView(_ block: RichChatMarkdownBlock) -> some View {
    switch block {
    case .heading(let level, let text):
      inlineText(text)
        .poracodeChatText(headingRole(level), weight: .semibold)
        .foregroundStyle(.primary)
    case .paragraph(let text):
      inlineText(text)
        .poracodeChatText(.body)
    case .orderedList(let items):
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
          listRow(marker: "\(index + 1).", text: item)
        }
      }
    case .unorderedList(let items):
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
          listRow(marker: "•", text: item)
        }
      }
    case .code(let language, let source):
      RichChatMarkdownCodeBlock(language: language, source: source)
    case .table(let headers, let rows):
      RichChatMarkdownTable(headers: headers, rows: rows)
    case .quote(let text):
      HStack(alignment: .top, spacing: 8) {
        RoundedRectangle(cornerRadius: 1)
          .fill(Color.secondary.opacity(0.35))
          .frame(width: 3)
        inlineText(text)
          .poracodeChatText(.body)
          .italic()
          .foregroundStyle(.secondary)
      }
    }
  }

  private func inlineText(_ text: String) -> Text {
    Text(RichChatAttributedText.presentation(text))
  }

  private func listRow(marker: String, text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(marker)
        .poracodeChatText(.body, weight: .medium)
        .foregroundStyle(.secondary)
        .frame(width: 20, alignment: .trailing)
      inlineText(text)
        .poracodeChatText(.body)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func headingRole(_ level: Int) -> PoracodeChatTextRole {
    switch level {
    case 1: .heading1
    case 2: .heading2
    default: .heading3
    }
  }

  private func blockTopPadding(_ block: RichChatMarkdownBlock, index: Int) -> CGFloat {
    guard index > 0 else { return 0 }
    return switch block {
    case .code: 2
    case .table: 6
    case .quote: 15
    case .paragraph: 11
    default: 0
    }
  }
}

private struct RichChatMarkdownCodeBlock: View {
  let language: String?
  let source: String

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    Text(
      RichChatSyntaxHighlighter.attributed(
        source: source,
        language: language,
        colorScheme: colorScheme
      )
    )
    .font(.system(size: 11.5, design: .monospaced))
    .lineSpacing(1)
    .padding(.horizontal, 8)
    .padding(.vertical, 5)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 6))
  }
}

private struct RichChatMarkdownTable: View {
  let headers: [String]
  let rows: [[String]]

  private var columnCount: Int {
    max(headers.count, rows.map(\.count).max() ?? 0)
  }

  var body: some View {
    Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
      tableRow(headers, isHeader: true)
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        tableRow(row, isHeader: false)
      }
    }
    .frame(maxWidth: .infinity)
    .background(Color.secondary.opacity(0.04))
    .clipShape(RoundedRectangle(cornerRadius: 10))
    .overlay {
      RoundedRectangle(cornerRadius: 10)
        .stroke(Color.secondary.opacity(0.18), lineWidth: 0.5)
    }
  }

  private func tableRow(_ cells: [String], isHeader: Bool) -> some View {
    GridRow {
      ForEach(0..<columnCount, id: \.self) { index in
        Text(
          index < cells.count
            ? RichChatAttributedText.presentation(cells[index]) : AttributedString()
        )
        .poracodeChatText(.metadata, weight: isHeader ? .semibold : .regular)
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(isHeader ? Color.secondary.opacity(0.09) : Color.clear)
        .overlay(alignment: .bottom) {
          Rectangle().fill(Color.secondary.opacity(0.13)).frame(height: 0.5)
        }
      }
    }
  }
}
