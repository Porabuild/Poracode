import SwiftUI
import UIKit

struct RichChatSourceReference: Equatable {
  let target: ProjectWorkspaceFileTarget
  let url: URL
  let authoredLabel: String

  var filename: String { RichChatFilePolicy.basename(target.path) }

  func title(matching query: RichChatFindQuery) -> String {
    guard query.ranges(in: filename).isEmpty, !query.ranges(in: authoredLabel).isEmpty
    else { return filename }
    return authoredLabel
  }
}

/// The transcript's compact, content-layer control for opening a project file.
struct RichChatSourceReferenceChip: View {
  let reference: RichChatSourceReference
  let findPart: RichChatFindPart
  var isListItem = false

  @Environment(\.richChatFindHighlight) private var find
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.colorSchemeContrast) private var contrast

  var body: some View {
    if #available(iOS 27, *), isListItem {
      link.buttonStyle(SourceReferenceTapStyle())
    } else {
      link.buttonStyle(.plain)
    }
  }

  private var link: some View {
    Link(destination: reference.url) {
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        // Give the icon one em of width and inherit the body's text metrics.
        // A symbol drawn in the overlay cannot expand the line box.
        Text(verbatim: "\u{2003}")
          .poracodeChatText(.body)
          .overlay {
            Image(systemName: "doc.text")
              .poracodeChatText(.metadata, weight: .medium)
              .foregroundStyle(Color.poracodeSecondaryLabel)
          }
          .accessibilityHidden(true)
        find.text(AttributedString(reference.title(matching: find.query)), part: findPart)
          .poracodeChatText(.body, weight: .medium)
          .lineLimit(dynamicTypeSize.isAccessibilitySize || isSelectedFindMatch ? nil : 1)
          .truncationMode(.middle)
          .layoutPriority(1)
        if let line = reference.target.line {
          Text(verbatim: "L\(line)")
            .poracodeChatText(.metadata)
            .monospacedDigit()
            .foregroundStyle(Color.poracodeSecondaryLabel)
            .fixedSize()
        }
      }
      .foregroundStyle(.primary)
      .padding(.horizontal, 6)
      .background(
        Color.primary.opacity(contrast == .increased ? 0.16 : 0.09),
        in: RoundedRectangle(cornerRadius: 4, style: .continuous)
      )
      .frame(minWidth: 44)
      .contentShape(Rectangle())
    }
    .textSelection(.disabled)
    .tint(.primary)
    .accessibilityLabel(Text(verbatim: reference.filename))
    .accessibilityValue(Text(verbatim: accessibilityPath))
    .accessibilityIdentifier("native-e2e.transcript-source-reference")
  }

  private var isSelectedFindMatch: Bool {
    find.revealsItem && find.active?.part == findPart
  }

  private var accessibilityPath: String {
    if let line = reference.target.line { return "\(reference.target.path):\(line)" }
    return reference.target.path
  }
}

/// Keep a list badge's activation on its measured label inside the transcript cell.
private struct SourceReferenceTapStyle: PrimitiveButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .contentShape(Rectangle())
      .modifier(SourceReferenceActivation(activate: configuration.trigger))
  }
}

struct SourceReferenceActivation: ViewModifier {
  var isKeyboardFocusable = true
  let activate: () -> Void

  @Environment(\.isEnabled) private var isEnabled

  func body(content: Content) -> some View {
    content
      .background {
        SourceReferenceTouchRegion(isEnabled: isEnabled, activate: activate)
      }
      .accessibilityAction {
        if isEnabled { activate() }
      }
      .focusable(isEnabled && isKeyboardFocusable, interactions: .activate)
      .onKeyPress(keys: [.return, .space], phases: .down) { _ in
        guard isEnabled else { return .ignored }
        activate()
        return .handled
      }
  }
}

private struct SourceReferenceTouchRegion: UIViewRepresentable {
  let isEnabled: Bool
  let activate: () -> Void

  func makeUIView(context: Context) -> RegionView { RegionView() }

  func updateUIView(_ view: RegionView, context: Context) {
    view.activate = isEnabled ? activate : nil
  }

  static func dismantleUIView(_ view: RegionView, coordinator: ()) {
    view.stopObserving()
  }

  /// On iOS 27 the transcript cell receives some source badge touches. Observe
  /// them at the window and accept only taps inside this badge in its scroll view.
  final class RegionView: UIView, UIGestureRecognizerDelegate {
    var activate: (() -> Void)?
    private lazy var tap = UITapGestureRecognizer(target: self, action: #selector(activateBadge))

    init() {
      super.init(frame: .zero)
      isUserInteractionEnabled = false
      accessibilityElementsHidden = true
      tap.cancelsTouchesInView = false
      tap.delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      stopObserving()
      window?.addGestureRecognizer(tap)
    }

    func stopObserving() { tap.view?.removeGestureRecognizer(tap) }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
      guard activate != nil, bounds.contains(touch.location(in: self)), let touchedView = touch.view,
        let parent = superview,
        let scrollView = sequence(first: parent, next: { $0.superview })
          .compactMap({ $0 as? UIScrollView }).first
      else { return false }
      return touchedView.isDescendant(of: scrollView)
    }

    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool { true }

    @objc private func activateBadge() {
      if bounds.contains(tap.location(in: self)) { activate?() }
    }
  }
}
