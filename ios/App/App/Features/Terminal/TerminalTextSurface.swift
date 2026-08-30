import SwiftUI
import UIKit

struct TerminalViewportSize: Equatable, Hashable, Sendable {
  let columns: Int
  let rows: Int
}

enum PoracodeTerminalTextSize {
  /// Existing key remains the agent-terminal preference for upgrade compatibility.
  static let storageKey = "poracode.terminal-text-size.v1"
  static let projectStorageKey = "poracode.project-terminal-text-size.v1"
  static let defaultValue = 13
  static let range = 8...20

  static func resolve(_ value: Int) -> Int {
    min(range.upperBound, max(range.lowerBound, value))
  }
}

enum PoracodeTerminalTextSizeRole: Equatable, Sendable {
  case agent
  case project

  var storageKey: String {
    switch self {
    case .agent: PoracodeTerminalTextSize.storageKey
    case .project: PoracodeTerminalTextSize.projectStorageKey
    }
  }

  func initialValue(in defaults: UserDefaults = .standard) -> Int {
    if let stored = defaults.object(forKey: storageKey) as? NSNumber {
      return PoracodeTerminalTextSize.resolve(stored.intValue)
    }
    // Before project terminals gained an independent control, both surfaces
    // used the agent-terminal key. Preserve that value on upgrade.
    if self == .project,
      let legacy = defaults.object(forKey: PoracodeTerminalTextSize.storageKey) as? NSNumber
    {
      return PoracodeTerminalTextSize.resolve(legacy.intValue)
    }
    return PoracodeTerminalTextSize.defaultValue
  }
}

enum TerminalViewportMetrics {
  static let contentInset: CGFloat = 12

  static func size(
    for bounds: CGSize,
    font: UIFont = TerminalTextAttributes.font(pointSize: 13)
  ) -> TerminalViewportSize? {
    let usableWidth = bounds.width - (contentInset * 2)
    let usableHeight = bounds.height - (contentInset * 2)
    guard usableWidth > 0, usableHeight > 0 else { return nil }
    let width = ("W" as NSString).size(withAttributes: [.font: font]).width
    guard width > 0, font.lineHeight > 0 else { return nil }
    return TerminalViewportSize(
      columns: min(1_000, max(1, Int(floor(usableWidth / width)))),
      rows: min(1_000, max(1, Int(floor(usableHeight / font.lineHeight))))
    )
  }
}

struct TerminalTextSurface: UIViewRepresentable {
  let transcript: String
  let accessibilityLabel: String
  let fontSize: CGFloat

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context _: Context) -> UITextView {
    let view = UITextView()
    view.backgroundColor = .clear
    view.isEditable = false
    view.isSelectable = true
    view.alwaysBounceVertical = true
    view.keyboardDismissMode = .interactive
    view.textContainerInset = UIEdgeInsets(
      top: TerminalViewportMetrics.contentInset,
      left: TerminalViewportMetrics.contentInset,
      bottom: TerminalViewportMetrics.contentInset,
      right: TerminalViewportMetrics.contentInset
    )
    view.textContainer.lineFragmentPadding = 0
    view.adjustsFontForContentSizeCategory = true
    view.isAccessibilityElement = true
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    view.accessibilityLabel = accessibilityLabel
    guard context.coordinator.transcript != transcript || context.coordinator.fontSize != fontSize
    else { return }
    let distanceFromBottom = view.contentSize.height - view.contentOffset.y - view.bounds.height
    let shouldFollowOutput = context.coordinator.transcript.isEmpty || distanceFromBottom < 72
    let rendered = TerminalANSIParser.render(transcript)
    view.attributedText = TerminalTextAttributes.attributed(rendered, pointSize: fontSize)
    view.accessibilityValue = rendered.plainText
    context.coordinator.transcript = transcript
    context.coordinator.fontSize = fontSize
    if shouldFollowOutput, !rendered.plainText.isEmpty {
      view.scrollRangeToVisible(NSRange(location: view.attributedText.length, length: 0))
    }
  }

  final class Coordinator {
    var transcript = ""
    var fontSize: CGFloat = 0
  }
}

enum TerminalTextAttributes {
  static func font(pointSize: CGFloat) -> UIFont {
    .monospacedSystemFont(ofSize: pointSize, weight: .regular)
  }

  static func attributed(
    _ rendered: TerminalRenderedText,
    pointSize: CGFloat
  ) -> NSAttributedString {
    let result = NSMutableAttributedString()
    for run in rendered.runs {
      var foreground = color(run.style.foreground) ?? UIColor(white: 0.86, alpha: 1)
      var background = color(run.style.background) ?? .clear
      if run.style.inverse { swap(&foreground, &background) }
      let base = font(pointSize: pointSize)
      var traits: UIFontDescriptor.SymbolicTraits = []
      if run.style.bold { traits.insert(.traitBold) }
      if run.style.italic { traits.insert(.traitItalic) }
      let descriptor = base.fontDescriptor.withSymbolicTraits(traits) ?? base.fontDescriptor
      var attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont(descriptor: descriptor, size: base.pointSize),
        .foregroundColor: foreground,
        .backgroundColor: background,
      ]
      if run.style.underline { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
      result.append(NSAttributedString(string: run.text, attributes: attributes))
    }
    return result
  }

  private static func color(_ value: TerminalANSIColor?) -> UIColor? {
    guard let value else { return nil }
    switch value {
    case .standard(let index):
      let palette: [UIColor] = [
        UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: 1),
        UIColor(red: 0.80, green: 0.22, blue: 0.24, alpha: 1),
        UIColor(red: 0.24, green: 0.72, blue: 0.39, alpha: 1),
        UIColor(red: 0.90, green: 0.67, blue: 0.22, alpha: 1),
        UIColor(red: 0.27, green: 0.52, blue: 0.90, alpha: 1),
        UIColor(red: 0.72, green: 0.35, blue: 0.82, alpha: 1),
        UIColor(red: 0.25, green: 0.72, blue: 0.76, alpha: 1),
        UIColor(white: 0.78, alpha: 1),
        UIColor(white: 0.40, alpha: 1),
        UIColor(red: 1.00, green: 0.38, blue: 0.40, alpha: 1),
        UIColor(red: 0.40, green: 0.90, blue: 0.52, alpha: 1),
        UIColor(red: 1.00, green: 0.82, blue: 0.36, alpha: 1),
        UIColor(red: 0.46, green: 0.68, blue: 1.00, alpha: 1),
        UIColor(red: 0.88, green: 0.52, blue: 1.00, alpha: 1),
        UIColor(red: 0.45, green: 0.90, blue: 0.92, alpha: 1),
        UIColor(white: 0.96, alpha: 1),
      ]
      return palette[min(max(0, index), palette.count - 1)]
    case .indexed(let index):
      if index < 16 { return color(.standard(index)) }
      if index >= 232 {
        let level = CGFloat(8 + ((index - 232) * 10)) / 255
        return UIColor(white: level, alpha: 1)
      }
      let cube = index - 16
      func channel(_ value: Int) -> CGFloat {
        value == 0 ? 0 : CGFloat(55 + (value * 40)) / 255
      }
      return UIColor(
        red: channel((cube / 36) % 6),
        green: channel((cube / 6) % 6),
        blue: channel(cube % 6),
        alpha: 1
      )
    case .rgb(let red, let green, let blue):
      return UIColor(
        red: CGFloat(red) / 255,
        green: CGFloat(green) / 255,
        blue: CGFloat(blue) / 255,
        alpha: 1
      )
    }
  }
}
