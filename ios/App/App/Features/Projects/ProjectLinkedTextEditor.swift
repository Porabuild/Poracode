import SwiftUI
import UIKit

/// Reveals a requested source line without moving focus or opening the keyboard.
/// Other files continue to use the ordinary workspace editor.
struct ProjectLinkedTextEditor: UIViewRepresentable {
  @Binding var text: String
  let line: Int
  let isEditable: Bool

  func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

  func makeUIView(context: Context) -> LinkedTextView {
    let view = LinkedTextView()
    view.delegate = context.coordinator
    view.backgroundColor = .clear
    view.font = UIFontMetrics(forTextStyle: .body).scaledFont(
      for: .monospacedSystemFont(ofSize: 17, weight: .regular)
    )
    view.adjustsFontForContentSizeCategory = true
    view.autocapitalizationType = .none
    view.autocorrectionType = .no
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.isSelectable = true
    return view
  }

  func updateUIView(_ view: LinkedTextView, context: Context) {
    context.coordinator.text = $text
    view.isEditable = isEditable
    view.accessibilityLabel = isEditable
      ? ProjectWorkspaceStrings.editorLabel : ProjectWorkspaceStrings.fileContentsLabel
    view.accessibilityIdentifier = "native-e2e.project-file-editor"
    if view.text != text { view.text = text }
    if view.requestedLine != line {
      view.requestedLine = line
    }
  }

  final class LinkedTextView: NativeFocusReportingTextView {
    var requestedLine: Int? {
      didSet {
        followsRequestedLine = true
        lastViewport = nil
        setNeedsLayout()
      }
    }
    var followsRequestedLine = true
    private var lastViewport: CGSize?

    override func layoutSubviews() {
      super.layoutSubviews()
      let insets = adjustedContentInset
      let viewport = bounds.inset(by: insets).size
      guard followsRequestedLine, let requestedLine, window != nil,
        viewport.width > 0, viewport.height > 0, lastViewport != viewport
      else { return }
      lastViewport = viewport
      let range = ProjectLinkedTextEditor.lineAnchor(requestedLine, in: text ?? "")
      selectedRange = range
      guard let position = position(from: beginningOfDocument, offset: range.location) else {
        scrollRangeToVisible(range)
        return
      }
      // Leave context above and below the requested line, even when a fold
      // changes the viewport height. Manual reading/editing owns the scroll after interaction.
      let minimum = -insets.top
      let maximum = max(minimum, contentSize.height - bounds.height + insets.bottom)
      let centered = caretRect(for: position).midY - insets.top - viewport.height / 2
      setContentOffset(CGPoint(x: contentOffset.x, y: min(maximum, max(minimum, centered))), animated: false)
    }
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var text: Binding<String>
    init(text: Binding<String>) { self.text = text }

    func textViewDidChange(_ textView: UITextView) {
      text.wrappedValue = textView.text
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      (textView as? LinkedTextView)?.followsRequestedLine = false
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
      (scrollView as? LinkedTextView)?.followsRequestedLine = false
    }
  }

  static func lineAnchor(_ line: Int, in text: String) -> NSRange {
    let file = text as NSString
    var offset = 0
    for _ in 1..<max(1, line) {
      if offset == file.length { break }
      offset = NSMaxRange(file.lineRange(for: NSRange(location: offset, length: 0)))
    }
    return NSRange(location: offset, length: 0)
  }
}
