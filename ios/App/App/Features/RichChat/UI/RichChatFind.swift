import Foundation
import Observation
import SwiftUI

enum RichChatFindPart: Hashable {
  case body
  case markdown(visual: Int, block: Int, piece: Int)
  case visualSource(Int)
  case supplement(Int)
}

struct RichChatFindMatch: Hashable {
  let rowID: String
  let itemID: String
  let part: RichChatFindPart
  let occurrence: Int
}

struct RichChatFindInput: Equatable {
  let query: RichChatFindQuery
  let timelineRevision: Int
  let projectLocation: ProjectLocation?
}

struct RichChatFindTarget: Hashable {
  let match: RichChatFindMatch
  let query: RichChatFindQuery
}

struct RichChatFindQuery: Hashable {
  var text = ""
  var matchesCase = false

  func ranges(in content: String) -> [Range<String.Index>] {
    guard !text.isEmpty else { return [] }
    let options: String.CompareOptions = matchesCase ? .literal : [.literal, .caseInsensitive]
    var start = content.startIndex
    var ranges: [Range<String.Index>] = []
    while start < content.endIndex,
      let range = content.range(of: text, options: options, range: start..<content.endIndex),
      !range.isEmpty {
      ranges.append(range)
      start = range.upperBound
    }
    return ranges
  }
}

struct RichChatFindHighlight: Equatable {
  var query = RichChatFindQuery()
  var active: RichChatFindMatch?
  var itemID: String?

  var revealsItem: Bool { active != nil && active?.itemID == itemID }

  func text(_ source: AttributedString, part: RichChatFindPart?) -> Text {
    let highlight = highlightedText(source, part: part)
    guard let range = highlight.selectedRange, let target = highlight.target else { return Text(highlight.text) }
    let leading = Text(AttributedString(highlight.text[..<range.lowerBound]))
    let hit = Text(AttributedString(highlight.text[range]))
      .customAttribute(RichChatFindSelectedRun(target: target))
    let trailing = Text(AttributedString(highlight.text[range.upperBound...]))
    return Text("\(leading)\(hit)\(trailing)")
  }

  func highlightedText(_ source: AttributedString, part: RichChatFindPart?)
    -> (text: AttributedString, selectedRange: Range<AttributedString.Index>?, target: RichChatFindTarget?) {
    guard let part, itemID != nil, !query.text.isEmpty else { return (source, nil, nil) }
    let rendered = String(source.characters)
    var highlighted = source
    var selectedRange: Range<String.Index>?
    for (occurrence, range) in query.ranges(in: rendered).enumerated() {
      guard let lower = AttributedString.Index(range.lowerBound, within: highlighted),
        let upper = AttributedString.Index(range.upperBound, within: highlighted) else { continue }
      let selected = revealsItem && active?.part == part && active?.occurrence == occurrence
      highlighted[lower..<upper].backgroundColor = selected ? .orange : .yellow
      highlighted[lower..<upper].foregroundColor = .black
      if selected { selectedRange = range }
    }
    guard let active, let selectedRange,
      let lower = AttributedString.Index(selectedRange.lowerBound, within: highlighted),
      let upper = AttributedString.Index(selectedRange.upperBound, within: highlighted)
    else { return (highlighted, nil, nil) }
    return (highlighted, lower..<upper, .init(match: active, query: query))
  }
}

extension EnvironmentValues {
  @Entry var richChatFindHighlight = RichChatFindHighlight()
}

@MainActor @Observable final class RichChatFindState {
  private(set) var isPresented = false
  private(set) var focusRequest = 0
  private(set) var repeatRevealRequest = 0
  var query = RichChatFindQuery() {
    didSet {
      if query != oldValue { followsLatestOnRestore = false }
    }
  }
  private(set) var matches: [RichChatFindMatch] = []
  private(set) var currentIndex = 0
  private var indexedQuery = RichChatFindQuery()
  private var preferredMatch: RichChatFindMatch?
  // Scroll to Bottom leaves the search result intact. Only restoring the
  // viewport should consult this flag, so the current scroll can finish.
  @ObservationIgnored private(set) var followsLatestOnRestore = false

  var selection: RichChatFindMatch? {
    isPresented && matches.indices.contains(currentIndex) ? matches[currentIndex] : nil
  }

  var revealTarget: RichChatFindTarget? {
    guard indexedQuery == query, let selection else { return nil }
    return RichChatFindTarget(match: selection, query: query)
  }

  var viewportRevealTarget: RichChatFindTarget? { followsLatestOnRestore ? nil : revealTarget }

  func rememberLatestPosition() {
    if isPresented { followsLatestOnRestore = true }
  }

  func forgetLatestPosition() {
    followsLatestOnRestore = false
  }

  func open() {
    resumeViewportRevealIfNeeded()
    isPresented = true
    focusRequest += 1
  }

  func close() {
    isPresented = false
  }

  func update(entries: [RichTimelineEntry], projectLocation: ProjectLocation? = nil) {
    let previous = indexedQuery == query ? preferredMatch : nil
    indexedQuery = query
    matches = query.text.isEmpty ? [] : entries.flatMap {
      matches(in: $0, rowID: $0.stableID, projectLocation: projectLocation)
    }
    currentIndex = previous.flatMap { preferred in
      matches.firstIndex { match in
        match.itemID == preferred.itemID && match.part == preferred.part && match.occurrence == preferred.occurrence
      }
    } ?? 0
    // A rebuilt page can expose its recent tail before older pages return.
    preferredMatch = previous ?? selection
  }

  func step(_ offset: Int) {
    guard !matches.isEmpty else { return }
    let previous = selection
    currentIndex = (currentIndex + offset + matches.count) % matches.count
    preferredMatch = selection
    if selection == previous {
      resumeViewportRevealIfNeeded()
    } else {
      followsLatestOnRestore = false
    }
  }

  private func resumeViewportRevealIfNeeded() {
    guard followsLatestOnRestore else { return }
    followsLatestOnRestore = false
    // Next can intentionally revisit the same match when there is only one.
    if isPresented { repeatRevealRequest &+= 1 }
  }

  private func matches(
    in entry: RichTimelineEntry, rowID: String, projectLocation: ProjectLocation?
  ) -> [RichChatFindMatch] {
    let nodes: [RichVisibleTimelineNode]
    switch entry {
    case .item(let node): nodes = [node]
    case .group(_, let members): nodes = members
    }
    return nodes.flatMap { node in
      let local = fragments(for: node.item, projectLocation: projectLocation).flatMap { part, text in
        query.ranges(in: text).indices.map { occurrence in
          RichChatFindMatch(rowID: rowID, itemID: node.item.id, part: part, occurrence: occurrence)
        }
      }
      return local + node.children.flatMap {
        matches(in: $0, rowID: rowID, projectLocation: projectLocation)
      }
    }
  }

  private func fragments(
    for item: RichRuntimeItem, projectLocation: ProjectLocation?
  ) -> [(RichChatFindPart, String)] {
    switch item.type {
    case RichItemType.userMessage:
      let body: [(RichChatFindPart, String)] = [(.body, RichChatAttributedText.plainText(RichChatPresentation.messageBody(for: item)))]
      return body + RichChatPresentation.messageSupplements(for: item).enumerated().compactMap { index, supplement in
        supplement.findText.map { (.supplement(index), $0) }
      }
    case RichItemType.reasoning:
      return [(.body, RichChatAttributedText.plainText(RichChatPresentation.messageBody(for: item)))]
    case RichItemType.assistantMessage:
      let source = RichChatPresentation.messageBody(for: item)
      let visuals = RichInlineVisualParser.blocks(for: source, settled: item.state == .completed) ?? [.markdown(source)]
      return visuals.enumerated().flatMap { index, block in
        switch block {
        case .markdown(let markdown):
          return RichChatMarkdownParser.parse(markdown).enumerated().flatMap { blockIndex, block in
            block.findTexts(query: query, projectLocation: projectLocation).enumerated().map { piece, text in
              (RichChatFindPart.markdown(visual: index, block: blockIndex, piece: piece), text)
            }
          }
        case .source(_, let source): return [(.visualSource(index), source)]
        case .html: return []
        }
      }
    default: return []
    }
  }
}

extension RichMessageSupplementPresentation {
  var findText: String? {
    switch self {
    case .mcp(let name): "@\(name)"
    case .thread(let threadID, let title): "@\(title.isEmpty ? threadID : title)"
    case .file(let path, let name, false): RichVideoPresentation.resolve(path, name: name) == nil ? path : nil
    default: nil
    }
  }
}

extension RichChatMarkdownBlock {
  func hasParagraphText(videos: [RichVideoPresentation]) -> Bool {
    guard case .paragraph(let text) = self, !videos.isEmpty else { return true }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let linkText = trimmed.hasPrefix("!") ? String(trimmed.dropFirst()) : trimmed
    return RichChatFilePolicy.markdownLink(in: linkText) == nil && !trimmed.lowercased().hasPrefix("<video")
  }

  @MainActor func findTexts(query: RichChatFindQuery, projectLocation: ProjectLocation?) -> [String] {
    switch self {
    case .heading(_, let text), .quote(let text): [RichChatAttributedText.plainText(text)]
    case .paragraph(let text):
      hasParagraphText(videos: RichChatVideoPresentation.markdownVideos(text))
        ? [sourceReferenceFindText(text, query: query, projectLocation: projectLocation)]
        : []
    case .orderedList(let items): items.map {
      sourceReferenceFindText($0, query: query, projectLocation: projectLocation)
    }
    case .unorderedList(let items): items.map { item in
      if let link = RichChatFilePolicy.markdownLink(in: item),
        let ref = RichChatFilePolicy.markdownFileRef(src: link.destination, name: nil) { return ref.fileName }
      return sourceReferenceFindText(item, query: query, projectLocation: projectLocation)
    }
    case .code(_, let source): [source]
    case .table(let headers, let rows):
      ([headers] + rows).flatMap { $0.map(RichChatAttributedText.plainText) }
    case .fileCard(let ref): [ref.fileName]
    case .fileCardList(let refs): refs.map(\.fileName)
    }
  }

  @MainActor private func sourceReferenceFindText(
    _ text: String, query: RichChatFindQuery, projectLocation: ProjectLocation?
  ) -> String {
    if let projectLocation,
      let reference = RichChatAttributedText.standaloneSourceReference(
        in: RichChatAttributedText.presentation(text, projectLocation: projectLocation),
        projectLocation: projectLocation
      )
    {
      return reference.title(matching: query)
    }
    return RichChatAttributedText.plainText(text)
  }
}

struct RichChatFindBar: View {
  @Bindable var find: RichChatFindState
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @FocusState private var inputFocused: Bool
  @State private var availableWidth: CGFloat = 0

  var body: some View {
    // The same search field survives a layout change and keeps its focus.
    let layout = availableWidth >= 480 && !dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(HStackLayout(spacing: 8))
      : AnyLayout(VStackLayout(alignment: .trailing, spacing: 2))
    layout {
      searchField
      controls
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 4)
    .frame(maxWidth: .infinity)
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { availableWidth = $0 }
    .poracodeBarBackground(divider: .bottom)
    .task(id: find.focusRequest) {
      await Task.yield()
      guard !Task.isCancelled else { return }
      inputFocused = true
    }
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").accessibilityHidden(true)
      TextField(RichChatStrings.findInChat, text: $find.query.text)
        .focused($inputFocused)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityIdentifier("native-e2e.chat-find-query")
        .onSubmit { find.step(1) }
        .onKeyPress(.escape) {
          close()
          return .handled
        }
        .onKeyPress(keys: [.return]) { press in
          guard press.modifiers.contains(.shift) else { return .ignored }
          find.step(-1)
          return .handled
        }
      if !find.query.text.isEmpty {
        iconButton(RichChatStrings.clearFind, icon: "xmark.circle.fill") {
          find.query.text = ""
          inputFocused = true
        }
      }
    }
    .padding(.leading, 10)
    .frame(minWidth: 132, minHeight: 44)
    .poracodeInputSurface(in: RoundedRectangle(cornerRadius: 12), fill: Color(uiColor: .tertiarySystemFill))
  }

  private var controls: some View {
    HStack(spacing: 0) {
      if !find.query.text.isEmpty {
        Text(find.matches.isEmpty ? RichChatStrings.findNoResults
             : RichChatStrings.findPosition(find.currentIndex + 1, find.matches.count))
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("native-e2e.chat-find-count")
      }
      iconButton(RichChatStrings.findMatchCase, icon: "textformat") { find.query.matchesCase.toggle() }
        .accessibilityAddTraits(find.query.matchesCase ? .isSelected : [])
        .background(find.query.matchesCase ? Color.secondary.opacity(0.15) : .clear, in: .circle)
      iconButton(RichChatStrings.findPrevious, icon: "chevron.up") { find.step(-1) }
        .accessibilityIdentifier("native-e2e.chat-find-previous")
        .disabled(find.matches.isEmpty)
      iconButton(RichChatStrings.findNext, icon: "chevron.down") { find.step(1) }
        .accessibilityIdentifier("native-e2e.chat-find-next")
        .disabled(find.matches.isEmpty)
      iconButton(RichChatStrings.findClose, icon: "xmark", action: close)
        .keyboardShortcut(.escape, modifiers: [])
        .accessibilityIdentifier("native-e2e.chat-find-close")
    }
  }

  private func close() {
    inputFocused = false
    find.close()
  }

  private func iconButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .foregroundStyle(.secondary)
    .accessibilityLabel(title)
  }
}
