import SwiftUI
import UIKit

/// The same complete, selectable text viewport for canonical and resolved blocks.
struct RichToolCodeBlock: View {
  let text: String
  let identifier: String
  @State private var width: CGFloat = 0
  var body: some View {
    RichToolCodeTextView(text: text, identifier: identifier)
      .frame(height: height)
      .background(.fill.quinary, in: PoracodeShapes.content)
      .background {
        GeometryReader { geometry in
          Color.clear.onAppear { width = geometry.size.width }
            .onChange(of: geometry.size.width) { _, value in width = value }
        }
      }
  }
  private var height: CGFloat {
    var lines = 1, inspected = 0
    for character in text.utf16 {
      if character == 10 { lines += 1 }
      inspected += 1
      if lines >= 12 || inspected >= 4096 { return 260 }
    }
    guard width > 26 else { return 64 }
    let font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for:
      .monospacedSystemFont(ofSize: 13, weight: .regular))
    let rect = (text as NSString).boundingRect(
      with: CGSize(width: width - 26, height: 320),
      options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font], context: nil)
    return min(340, max(44, ceil(rect.height) + 20))
  }
}

private struct RichToolCodeTextView: UIViewRepresentable {
  let text: String
  let identifier: String
  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.isEditable = false; view.isSelectable = true; view.isScrollEnabled = true
    // A log is one selectable field. UIKit's paragraph container repeatedly
    // compares the full attributed string while enumerating thousands of
    // lines for accessibility, blocking the main thread on large outputs.
    view.isAccessibilityElement = true
    view.backgroundColor = .clear
    view.textContainerInset = .init(top: 10, left: 8, bottom: 10, right: 8)
    view.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for:
      .monospacedSystemFont(ofSize: 13, weight: .regular))
    view.adjustsFontForContentSizeCategory = true; view.textColor = .label
    return view
  }
  func updateUIView(_ view: UITextView, context: Context) {
    let changedSection = view.accessibilityIdentifier != identifier
    view.accessibilityIdentifier = identifier
    if view.text != text {
      view.text = text
      view.accessibilityValue = text
    }
    if changedSection { view.setContentOffset(.zero, animated: false) }
  }
  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
    guard let width = proposal.width, let height = proposal.height,
      width.isFinite, height.isFinite else { return nil }
    return CGSize(width: max(0, width), height: max(0, height))
  }
}
