import SwiftUI
import UIKit

struct RichChatMarkdownView: View {
  let source: String
  var visualIndex = 0

  @Environment(\.poracodeAccent) private var accent
  @Environment(\.richChatProjectLinkLocation) private var projectLinkLocation

  private var blocks: [RichChatMarkdownBlock] {
    RichChatMarkdownParser.parse(source)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
        blockView(block, index: index)
          .padding(.top, blockTopPadding(block, index: index))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
    .tint(accent)
  }

  @ViewBuilder
  private func blockView(_ block: RichChatMarkdownBlock, index: Int) -> some View {
    switch block {
    case .heading(let level, let text):
      inlineText(text, block: index)
        .poracodeChatText(headingRole(level), weight: .semibold)
        .foregroundStyle(.primary)
    case .paragraph(let text):
      let videos = RichChatVideoPresentation.markdownVideos(text)
      let attributed = RichChatAttributedText.presentation(text, projectLocation: projectLinkLocation)
      if videos.isEmpty, let reference = RichChatAttributedText.standaloneSourceReference(
        in: attributed, projectLocation: projectLinkLocation
      ) {
        RichChatSourceReferenceChip(reference: reference, findPart: part(block: index))
      } else {
        Group {
          if block.hasParagraphText(videos: videos) {
            RichChatInlineLinkText(text: attributed, part: part(block: index))
              .poracodeChatText(.body)
          }
          ForEach(Array(videos.enumerated()), id: \.offset) { _, video in
            RichChatInlineVideo(video: video)
          }
        }
      }
    case .fileCard(let ref):
      RichChatFileCard(ref: ref, findPart: part(block: index))
    case .fileCardList(let refs):
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(refs.enumerated()), id: \.offset) { piece, ref in
          RichChatFileCard(ref: ref, findPart: part(block: index, piece: piece))
        }
      }
    case .orderedList(let items):
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(items.enumerated()), id: \.offset) { piece, item in
          listRow(marker: "\(piece + 1).", text: item, block: index, piece: piece)
        }
      }
    case .unorderedList(let items):
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(items.enumerated()), id: \.offset) { piece, item in
          if let link = RichChatFilePolicy.markdownLink(in: item),
            let ref = RichChatFilePolicy.markdownFileRef(src: link.destination, name: nil)
          {
            HStack(alignment: .center, spacing: 8) {
              Text("•")
                .poracodeChatText(.body, weight: .medium)
                .foregroundStyle(.secondary)
                .frame(width: 20, alignment: .trailing)
              RichChatFileCard(ref: ref, findPart: part(block: index, piece: piece))
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          } else {
            listRow(marker: "•", text: item, block: index, piece: piece)
          }
        }
      }
    case .code(let language, let source):
      RichChatMarkdownCodeBlock(language: language, source: source,
        findPart: part(block: index))
    case .table(let headers, let rows):
      RichChatMarkdownTable(headers: headers, rows: rows, visualIndex: visualIndex, blockIndex: index)
    case .quote(let text):
      HStack(alignment: .top, spacing: 8) {
        RoundedRectangle(cornerRadius: 1)
          .fill(Color.secondary.opacity(0.35))
          .frame(width: 3)
        inlineText(text, block: index)
          .poracodeChatText(.body)
          .italic()
          .foregroundStyle(.secondary)
      }
    }
  }

  private func inlineText(_ text: String, block: Int, piece: Int = 0) -> some View {
    RichChatInlineLinkText(
      text: RichChatAttributedText.presentation(
        RichChatMathFormatter.expandInlineMath(text),
        projectLocation: projectLinkLocation
      ),
      part: part(block: block, piece: piece)
    )
  }

  private func part(block: Int, piece: Int = 0) -> RichChatFindPart {
    .markdown(visual: visualIndex, block: block, piece: piece)
  }

  private func listRow(marker: String, text: String, block: Int, piece: Int) -> some View {
    let parsed = RichChatMathFormatter.parseListItem(text)
    let displayText = RichChatMathFormatter.expandInlineMath(parsed.text)
    let attributed = RichChatAttributedText.presentation(displayText, projectLocation: projectLinkLocation)
    let reference = RichChatAttributedText.standaloneSourceReference(
      in: attributed, projectLocation: projectLinkLocation
    )
    let findPart = part(block: block, piece: piece)
    return HStack(alignment: reference == nil ? .firstTextBaseline : .center, spacing: 8) {
      if let checked = parsed.checked {
        Image(systemName: checked ? "checkmark.square.fill" : "square")
          .foregroundStyle(checked ? Color.primary : .secondary)
          .frame(width: 20, alignment: .trailing)
      } else {
        Text(marker)
          .poracodeChatText(.body, weight: .medium)
          .foregroundStyle(.secondary)
          .frame(width: 20, alignment: .trailing)
      }
      if let reference {
        RichChatSourceReferenceChip(reference: reference, findPart: findPart, isListItem: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        RichChatInlineLinkText(text: attributed, part: findPart)
          .poracodeChatText(.body)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(.leading, CGFloat(parsed.depth * 14))
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

struct RichChatMarkdownCodeBlock: View {
  let language: String?
  let source: String
  var findPart: RichChatFindPart? = nil
  var showsCopyAction = true

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.richChatFindHighlight) private var find

  var body: some View {
    let text = RichChatSyntaxHighlighter.attributed(
      source: source,
      language: language,
      colorScheme: colorScheme
    )
    VStack(alignment: .leading, spacing: 0) {
      if showsCopyAction && !source.isEmpty {
        HStack {
          if let language {
            Text(language)
              .poracodeChatText(.metadata)
              .foregroundStyle(Color.poracodeSecondaryLabel)
              .lineLimit(1)
          }
          Spacer(minLength: 4)
          Button {
            UIPasteboard.general.string = source
            UINotificationFeedbackGenerator().notificationOccurred(.success)
          } label: {
            Image(systemName: "doc.on.doc")
              .font(.callout)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.borderless)
          .tint(Color.poracodeSecondaryLabel)
          .accessibilityLabel(RichChatMessageActionStrings.copyCode)
          .accessibilityIdentifier("native-e2e.transcript-code.copy")
        }
        .padding(.leading, 8)
      }
      find.text(text, part: findPart)
        .font(.system(size: 11.5, design: .monospaced))
        .lineSpacing(1)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.secondary.opacity(0.10), in: PoracodeShapes.content)
  }
}

private struct RichChatMarkdownTable: View {
  let headers: [String]
  let rows: [[String]]
  let visualIndex: Int
  let blockIndex: Int
  @Environment(\.richChatProjectLinkLocation) private var projectLinkLocation
  @Environment(\.richChatFindHighlight) private var find
  @ScaledMetric(relativeTo: .caption) private var minimumColumnWidth: CGFloat = 112
  @State private var viewportWidth: CGFloat = 0
  private struct ColumnAnchor: Hashable { let index: Int }

  private var columnCount: Int {
    max(headers.count, rows.map(\.count).max() ?? 0)
  }

  var body: some View {
    let columns = columnCount
    let width = max(minimumColumnWidth, viewportWidth / CGFloat(max(1, columns)))
    ScrollViewReader { proxy in
      ScrollView(.horizontal) {
        Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
          tableRow(headers, startsAt: 0, isHeader: true, columns: columns, width: width)
          ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
            tableRow(row, startsAt: headers.count + rows.prefix(index).reduce(0) { $0 + $1.count },
              isHeader: false, columns: columns, width: width)
          }
        }
      }
      .accessibilityIdentifier("native-e2e.markdown-table")
      .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { viewportWidth = $0 }
      .onChange(of: viewportWidth) { revealSelectedColumn(proxy) }
      .onChange(of: minimumColumnWidth) { revealSelectedColumn(proxy) }
      .onChange(of: find, initial: true) { revealSelectedColumn(proxy) }
    }
    .frame(maxWidth: .infinity)
    .background(Color.secondary.opacity(0.04))
    .clipShape(PoracodeShapes.content)
    .overlay {
      PoracodeShapes.content
        .stroke(Color.secondary.opacity(0.18), lineWidth: 0.5)
    }
  }

  private func revealSelectedColumn(_ proxy: ScrollViewProxy) {
    guard find.revealsItem,
      case .markdown(let visual, let block, let piece) = find.active?.part,
      visual == visualIndex, block == blockIndex
    else { return }
    // Find enumerates the actual cells in row order, including uneven rows.
    var offset = piece
    for row in [headers] + rows {
      if offset < row.count {
        proxy.scrollTo(ColumnAnchor(index: offset), anchor: .center)
        return
      }
      offset -= row.count
    }
  }

  private func tableRow(
    _ cells: [String], startsAt: Int, isHeader: Bool, columns: Int, width: CGFloat
  ) -> some View {
    GridRow {
      ForEach(0..<columns, id: \.self) { index in
        let cell = index < cells.count ? cells[index] : ""
        let content = RichChatInlineLinkText(text: RichChatAttributedText.presentation(cell, projectLocation: projectLinkLocation),
          part: .markdown(visual: visualIndex, block: blockIndex, piece: startsAt + index))
        .poracodeChatText(.metadata, weight: isHeader ? .semibold : .regular)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .frame(width: width)
        .background(isHeader ? Color.secondary.opacity(0.09) : Color.clear)
        .overlay(alignment: .bottom) {
          Rectangle().fill(Color.secondary.opacity(0.13)).frame(height: 0.5)
        }
        if isHeader { content.id(ColumnAnchor(index: index)) }
        else { content }
      }
    }
  }
}
