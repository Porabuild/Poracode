import Foundation
import SwiftUI

struct RichChatMessageText: View {
  let text: AttributedString
  let role: PoracodeChatTextRole
  let collapses: Bool

  @State private var expanded = false
  @State private var fullHeight: CGFloat = 0
  @State private var collapsedHeight: CGFloat = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      styledText(lineLimit: expanded || !collapses ? nil : 4)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)

      if collapses && isOverflowing {
        Button(action: toggleExpanded) {
          Image(systemName: expanded ? "chevron.up" : "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 28, height: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          expanded ? RichChatStrings.hideDetails : RichChatStrings.showDetails)
      }
    }
    .background {
      if collapses {
        ZStack {
          measuredText(lineLimit: nil, key: RichChatFullTextHeightPreference.self)
          measuredText(lineLimit: 4, key: RichChatCollapsedTextHeightPreference.self)
        }
      }
    }
    .onPreferenceChange(RichChatFullTextHeightPreference.self) { fullHeight = $0 }
    .onPreferenceChange(RichChatCollapsedTextHeightPreference.self) { collapsedHeight = $0 }
  }

  private var isOverflowing: Bool {
    fullHeight > collapsedHeight + 0.5
  }

  private func styledText(lineLimit: Int?) -> some View {
    Text(text)
      .poracodeChatText(role)
      .lineLimit(lineLimit)
  }

  private func measuredText<Key: PreferenceKey>(
    lineLimit: Int?,
    key: Key.Type
  ) -> some View where Key.Value == CGFloat {
    styledText(lineLimit: lineLimit)
      .fixedSize(horizontal: false, vertical: true)
      .hidden()
      .background {
        GeometryReader { proxy in
          Color.clear.preference(key: key, value: proxy.size.height)
        }
      }
  }

  private func toggleExpanded() {
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

private struct RichChatFullTextHeightPreference: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

private struct RichChatCollapsedTextHeightPreference: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

@MainActor
enum RichChatAttributedText {
  private static let linkDetector = try? NSDataDetector(
    types: NSTextCheckingResult.CheckingType.link.rawValue
  )

  static func presentation(_ source: String) -> AttributedString {
    var result =
      (try? AttributedString(
        markdown: source,
        options: AttributedString.MarkdownParsingOptions(
          interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
      )) ?? AttributedString(source)

    guard let linkDetector else { return result }
    let matches = linkDetector.matches(
      in: source,
      options: [],
      range: NSRange(source.startIndex..., in: source)
    )
    let rendered = String(result.characters)
    for match in matches {
      guard let url = match.url,
        let sourceRange = Range(match.range, in: source)
      else { continue }
      let visibleURL = String(source[sourceRange])
      var searchStart = rendered.startIndex
      while searchStart < rendered.endIndex,
        let renderedRange = rendered[searchStart...].range(of: visibleURL)
      {
        guard
          let lower = AttributedString.Index(renderedRange.lowerBound, within: result),
          let upper = AttributedString.Index(renderedRange.upperBound, within: result)
        else { break }
        result[lower..<upper].link = url
        searchStart = renderedRange.upperBound
      }
    }
    return result
  }
}

struct RichChatMessageSupplementView: View {
  let supplement: RichMessageSupplementPresentation

  var body: some View {
    switch supplement {
    case .skill(let name, let pluginName):
      compactRow(systemImage: "sparkles", title: pluginName ?? name, subtitle: "/\(name)")
    case .mcp(let name):
      compactRow(systemImage: "externaldrive.connected.to.line.below", title: "@\(name)")
    case .thread(_, let title):
      compactRow(systemImage: "bubble.left.and.bubble.right", title: "@\(title)")
    case .diffComment(let target, let body):
      VStack(alignment: .leading, spacing: 4) {
        Label(target, systemImage: "text.bubble")
          .poracodeChatText(.metadata, weight: .semibold)
          .foregroundStyle(.secondary)
        Text(body)
          .poracodeChatText(.metadata)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.leading, 8)
      .overlay(alignment: .leading) {
        Rectangle().fill(.quaternary).frame(width: 1)
      }
    case .file(let path, let name, let isAttachment):
      compactRow(
        systemImage: isAttachment ? "paperclip" : "doc",
        title: name ?? URL(fileURLWithPath: path).lastPathComponent,
        subtitle: path
      )
    }
  }

  private func compactRow(
    systemImage: String,
    title: String,
    subtitle: String? = nil
  ) -> some View {
    HStack(spacing: 7) {
      Image(systemName: systemImage)
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(width: 16)
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .poracodeChatText(.metadata, weight: .medium)
          .lineLimit(1)
        if let subtitle, subtitle != title {
          Text(subtitle)
            .poracodeChatText(.metadata)
            .foregroundStyle(.tertiary)
            .lineLimit(1)
            .truncationMode(.middle)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.leading, 4)
  }
}
