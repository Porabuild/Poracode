import ImageIO
import SwiftUI

/// Let Text lay out the link and draw its badge along the measured lines.
struct RichChatInlineLinkText: View {
  let text: AttributedString
  let part: RichChatFindPart
  @Environment(\.richChatFindHighlight) private var find
  @Environment(\.colorSchemeContrast) private var contrast
  @State private var icons: [URL: CGImage] = [:]

  var body: some View {
    let webIcons = Set(text.runs.compactMap { $0.link.flatMap(RichChatFavicon.origin) })
    if !text.runs.contains(where: { $0.link.flatMap(Self.symbol(for:)) != nil }) {
      find.text(text, part: part)
    } else {
      decoratedText
        .backgroundPreferenceValue(Text.LayoutKey.self) { layouts in
          RichChatInlineBadgeBackground(layouts: layouts, icons: icons, increasedContrast: contrast == .increased)
        }
        .task(id: webIcons) {
          for origin in webIcons where icons[origin] == nil {
            let icon = await RichChatFavicon.shared.icon(for: origin)
            if Task.isCancelled { return }
            icons[origin] = icon
          }
        }
    }
  }

  private var decoratedText: Text {
    var pieces: [(range: Range<AttributedString.Index>, link: URL?)] = []
    let highlighted = find.highlightedText(text, part: part)
    for run in highlighted.text.runs {
      let link = run.link.flatMap { Self.symbol(for: $0) == nil ? nil : $0 }
      if let previous = pieces.last, previous.link == link {
        pieces[pieces.count - 1].range = previous.range.lowerBound..<run.range.upperBound
      } else {
        pieces.append((run.range, link))
      }
    }
    return pieces.enumerated().reduce(Text("")) { combined, entry in
      let (index, piece) = entry
      let measuredLink = piece.link.flatMap { link in Self.usesMeasuredTouch(link) ? link : nil }
      let label = labelText(highlighted.text, in: piece.range,
        selected: highlighted.selectedRange, target: highlighted.target,
        asBadge: piece.link != nil, usesMeasuredTouch: measuredLink != nil)
      guard let link = piece.link, let symbol = Self.symbol(for: link) else { return Text("\(combined)\(label)") }
      let badge = RichChatInlineBadgeRun(id: index, origin: RichChatFavicon.origin(link), symbol: symbol,
        measuredLink: measuredLink, label: String(highlighted.text[piece.range].characters))
      let nativeLink = measuredLink == nil ? link : nil
      let leading = spacing("\u{00a0}\u{00a0}\u{00a0}\u{00a0}", linkingTo: nativeLink)
        .customAttribute(badge).customAttribute(RichChatInlineBadgeIconSlot())
      let content = label.customAttribute(badge)
      let trailing = spacing("\u{00a0}", linkingTo: nativeLink).customAttribute(badge)
      return Text("\(combined)\(leading)\(content)\(trailing)")
    }
  }

  private func labelText(
    _ text: AttributedString, in range: Range<AttributedString.Index>,
    selected: Range<AttributedString.Index>?, target: RichChatFindTarget?, asBadge: Bool, usesMeasuredTouch: Bool
  ) -> Text {
    func piece(_ range: Range<AttributedString.Index>) -> Text {
      var result = AttributedString(text[range])
      if asBadge {
        for run in Array(result.runs) where run.foregroundColor == nil {
          result[run.range].foregroundColor = .primary
        }
        result.underlineStyle = .init(pattern: .solid, color: .clear)
      }
      if usesMeasuredTouch { result.link = nil }
      return Text(result)
    }
    guard let target, let selected, selected.overlaps(range) else { return piece(range) }
    let lower = max(range.lowerBound, selected.lowerBound)
    let upper = min(range.upperBound, selected.upperBound)
    let leading = piece(range.lowerBound..<lower)
    let match = piece(lower..<upper).customAttribute(RichChatFindSelectedRun(target: target))
    let trailing = piece(upper..<range.upperBound)
    return Text("\(leading)\(match)\(trailing)")
  }

  private func spacing(_ characters: String, linkingTo link: URL?) -> Text {
    var padding = AttributedString(characters)
    padding.link = link
    padding.underlineStyle = .init(pattern: .solid, color: .clear)
    return Text(padding)
  }

  private static func symbol(for link: URL) -> String? {
    if RichChatProjectFileLink.isProjectReference(link) { return "doc.text" }
    guard RichChatProjectFileLink.isExternal(link) else { return nil }
    return link.scheme?.lowercased() == "mailto" ? "envelope" : "globe"
  }

  private static func usesMeasuredTouch(_ link: URL) -> Bool {
    if #available(iOS 27, *) { return RichChatProjectFileLink.isProjectReference(link) }
    return false
  }
}

private struct RichChatInlineBadgeRun: TextAttribute {
  let id: Int
  let origin: URL?
  let symbol: String
  let measuredLink: URL?
  let label: String
}

private struct RichChatInlineBadgeIconSlot: TextAttribute {}

private struct RichChatInlineBadgeBackground: View {
  let layouts: [Text.LayoutKey.AnchoredLayout]
  let icons: [URL: CGImage]
  let increasedContrast: Bool
  @Environment(\.openURL) private var openURL

  var body: some View {
    GeometryReader { geometry in
      let badges = measuredBadges(in: geometry)
      ZStack {
        Canvas { context, _ in
          for badge in badges { draw(badge, in: context) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        ForEach(badges) { badge in
          if let url = badge.run.measuredLink {
            Color.clear
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(Text(verbatim: badge.run.label))
              .accessibilityAddTraits(.isLink)
              .accessibilityHidden(badge.iconSlot == nil)
              .modifier(SourceReferenceActivation(isKeyboardFocusable: badge.iconSlot != nil) { openURL(url) })
              .frame(width: badge.bounds.width, height: badge.bounds.height)
              .position(x: badge.bounds.midX, y: badge.bounds.midY)
          }
        }
      }
    }
  }

  private struct BadgeLine: Identifiable {
    struct ID: Hashable { let layout: Int; let line: Int; let badge: Int }
    let id: ID
    let run: RichChatInlineBadgeRun
    var bounds: CGRect
    var iconSlot: CGRect?
  }

  private func measuredBadges(in geometry: GeometryProxy) -> [BadgeLine] {
    var result: [BadgeLine] = []
    for (layoutIndex, text) in layouts.enumerated() {
      let origin = geometry[text.origin]
      for (lineIndex, line) in text.layout.enumerated() {
        var badges: [Int: BadgeLine] = [:]
        for run in line {
          guard let badge = run[RichChatInlineBadgeRun.self] else { continue }
          let rect = run.typographicBounds.rect.offsetBy(dx: origin.x, dy: origin.y)
          var measure = badges[badge.id] ?? BadgeLine(
            id: .init(layout: layoutIndex, line: lineIndex, badge: badge.id), run: badge, bounds: rect)
          measure.bounds = measure.bounds.union(rect)
          if run[RichChatInlineBadgeIconSlot.self] != nil { measure.iconSlot = rect }
          badges[badge.id] = measure
        }
        result.append(contentsOf: badges.values.sorted { $0.run.id < $1.run.id })
      }
    }
    return result
  }

  private func draw(_ badge: BadgeLine, in context: GraphicsContext) {
    context.fill(
      Path(roundedRect: badge.bounds.insetBy(dx: 0, dy: 0.5), cornerRadius: 4),
      with: .color(Color.primary.opacity(increasedContrast ? 0.16 : 0.09))
    )
    guard let slot = badge.iconSlot else { return }
    let size = min(slot.width, slot.height) * 0.78
    let icon = badge.run.origin.flatMap { icons[$0] }.map { Image(decorative: $0, scale: 1) }
      ?? Image(systemName: badge.run.symbol)
    context.draw(context.resolve(icon),
      in: CGRect(x: slot.midX - size / 2, y: slot.midY - size / 2, width: size, height: size))
  }
}

@MainActor
private final class RichChatFavicon {
  static let shared = RichChatFavicon()
  private let session = URLSession(configuration: .ephemeral)
  private let cache = NSCache<NSURL, CGImage>()
  private var pending: [URL: Task<CGImage?, Never>] = [:]

  private init() { cache.countLimit = 64 }

  static func origin(_ link: URL) -> URL? {
    guard RichChatProjectFileLink.isExternal(link), var components = URLComponents(url: link, resolvingAgainstBaseURL: false),
      let hostname = components.host?.lowercased(), let suffix = hostname.split(separator: ".").last,
      hostname.contains("."), suffix.contains(where: \.isLetter),
      !["local", "localhost", "internal", "test"].contains(suffix)
    else { return nil }
    components.scheme = "https"
    components.user = nil
    components.password = nil
    components.path = ""
    components.query = nil
    components.fragment = nil
    return components.url
  }

  func icon(for origin: URL) async -> CGImage? {
    if let cached = cache.object(forKey: origin as NSURL) { return cached }
    if let task = pending[origin] { return await task.value }
    let task = Task<CGImage?, Never> { [session] in
      var fallback = URLComponents(string: "https://t1.gstatic.com/faviconV2")
      fallback?.queryItems = [
        .init(name: "client", value: "SOCIAL"),
        .init(name: "type", value: "FAVICON"),
        .init(name: "fallback_opts", value: "TYPE,SIZE,URL"),
        .init(name: "url", value: origin.absoluteString),
        .init(name: "size", value: "64"),
      ]
      for url in [origin.appendingPathComponent("favicon.ico"), fallback?.url].compactMap({ $0 }) {
        let request = URLRequest(url: url, timeoutInterval: 4)
        guard let (data, response) = try? await StreamingHTTPBody.perform(
          session: session, request: request, maxBytes: 256_000, resourceTimeout: 5, usesPairingPins: false
        ), let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let icon = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 48,
          ] as CFDictionary)
        else { continue }
        return icon
      }
      return nil
    }
    pending[origin] = task
    let icon = await task.value
    pending.removeValue(forKey: origin)
    if let icon { cache.setObject(icon, forKey: origin as NSURL) }
    return icon
  }
}
