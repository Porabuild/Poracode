import SwiftUI
import UIKit

struct RichChatFindSelectedRun: TextAttribute {
  let target: RichChatFindTarget
}

/// Resolves the highlighted run in the laid-out row. The list still owns row
/// virtualization and its ordinary scroll behavior.
struct RichChatFindReveal: ViewModifier {
  let rowID: String
  @Binding var pending: RichChatFindTarget?
  @Environment(\.richChatCompactOverlayClearance) private var compactOverlayClearance

  func body(content: Content) -> some View {
    content.overlayPreferenceValue(Text.LayoutKey.self) { layouts in
      if let pending, pending.match.rowID == rowID, let (anchor, bounds) = bounds(of: pending, in: layouts) {
        GeometryReader { geometry in
          let origin = geometry[anchor]
          RichChatFindScrollProbe(rect: bounds.offsetBy(dx: origin.x, dy: origin.y),
            bottomClearance: compactOverlayClearance, target: pending, pending: $pending)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
    }
  }

  private func bounds(of target: RichChatFindTarget, in layouts: [Text.LayoutKey.AnchoredLayout]) -> (Anchor<CGPoint>, CGRect)? {
    for layout in layouts {
      for line in layout.layout {
        for run in line where run[RichChatFindSelectedRun.self]?.target == target {
          let rect = run.typographicBounds.rect
          if !rect.isEmpty { return (layout.origin, rect) }
        }
      }
    }
    return nil
  }
}

/// A List can mount a tall row without showing the selected line of text. This
/// probe asks that row's UIKit list to expose the measured line, once per hit.
private struct RichChatFindScrollProbe: UIViewRepresentable {
  let rect: CGRect
  let bottomClearance: CGFloat
  let target: RichChatFindTarget
  @Binding var pending: RichChatFindTarget?

  func makeUIView(context: Context) -> Probe {
    let view = Probe()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: Probe, context: Context) {
    view.reveal = { [weak view] in
      guard pending == target, let view, view.window != nil, !view.bounds.isEmpty,
        let scroll = view.listScrollView else { return }
      pending = nil
      var target = view.convert(rect, to: scroll).insetBy(dx: 0, dy: -12)
      // The compact composer covers the end of the viewport without reducing
      // the List's bounds. The list already reserves this space in its footer.
      target.size.height += bottomClearance
      scroll.scrollRectToVisible(target, animated: false)
    }
    view.scheduleReveal()
  }

  static func dismantleUIView(_ view: Probe, coordinator: ()) { view.reveal = nil }

  final class Probe: UIView {
    var reveal: (() -> Void)?
    private var scheduled = false

    var listScrollView: UIScrollView? {
      var ancestor = superview
      while let candidate = ancestor {
        if let list = candidate as? UICollectionView { return list }
        if let list = candidate as? UITableView { return list }
        ancestor = candidate.superview
      }
      return nil
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      scheduleReveal()
    }

    func scheduleReveal() {
      guard !scheduled else { return }
      scheduled = true
      Task { @MainActor [weak self] in
        guard let self else { return }
        scheduled = false
        reveal?()
      }
    }
  }
}

struct RichChatFindViewportObserver: ViewModifier {
  let widthChanged: () -> Void
  let heightChanged: () -> Void

  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGFloat.self) { $0.size.width.rounded() } action: { _ in widthChanged() }
      .onGeometryChange(for: CGFloat.self) { $0.size.height.rounded() } action: { _ in heightChanged() }
  }
}
