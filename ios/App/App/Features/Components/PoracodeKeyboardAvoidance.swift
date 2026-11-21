import SwiftUI
import UIKit

enum PoracodeKeyboardViewport {
  /// Geometry observations publish after layout. During rotation a retained
  /// portrait height must not enable a landscape inspector and present/dismiss
  /// its sheet while the window is still transitioning.
  static func height(_ observed: CGSize, matching current: CGSize) -> CGFloat {
    guard current.width > 0, abs(observed.width - current.width) <= 0.5,
      observed.height.isFinite, observed.height > 0 else { return 0 }
    return observed.height
  }
}

extension View {
  /// Use a presentation's live UIKit guide when a flexible page inherits a
  /// retained SwiftUI keyboard region after pairing and rotation. Forms whose
  /// parent already sizes to the keyboard keep their existing avoidance.
  @ViewBuilder
  func poracodeUseKeyboardLayoutGuide() -> some View {
    if #available(iOS 26.0, *) {
      // Reset the proposal outside the guide's padding so content cannot
      // expand back through the reserved keyboard space.
      poracodeAvoidKeyboard()
        .ignoresSafeArea(.keyboard, edges: .bottom)
    } else {
      self
    }
  }

  /// Only the focused composer moves; the workspace keeps its full viewport.
  func poracodeAvoidKeyboard(isActive: Bool = true, reservesSpace: Bool = true,
    availableHeightChanged: @escaping (CGFloat) -> Void = { _ in }) -> some View {
    modifier(PoracodeKeyboardAvoidance(isActive: isActive, reservesSpace: reservesSpace,
      availableHeightChanged: availableHeightChanged))
  }
}

struct PoracodeComposerFocusPreferenceKey: PreferenceKey {
  static let defaultValue = false
  static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

private struct PoracodeComposerAvailableHeightKey: EnvironmentKey { static let defaultValue: CGFloat = 0 }
extension EnvironmentValues {
  var poracodeComposerAvailableHeight: CGFloat {
    get { self[PoracodeComposerAvailableHeightKey.self] }
    set { self[PoracodeComposerAvailableHeightKey.self] = newValue }
  }
}

struct PoracodeKeyboardSpace: Equatable, Sendable {
  var overlap: CGFloat = 0
  var availableHeight: CGFloat = 0

  static func resolve(contentFrame: CGRect, windowBounds: CGRect, keyboardFrame: CGRect, safeBottom: CGFloat) -> Self {
    guard keyboardFrame.height > safeBottom + 1, keyboardFrame.intersects(windowBounds) else { return .init() }
    let visibleKeyboard = keyboardFrame.intersection(windowBounds)
    // A growing inset can briefly propose content below the window. Measuring
    // that overflow as more keyboard space feeds the next layout pass and can
    // push an entire compact editor offscreen. Only visible occlusion counts.
    return .init(overlap: ceil(max(0, min(contentFrame.maxY, windowBounds.maxY) - visibleKeyboard.minY)),
      availableHeight: max(0, visibleKeyboard.minY - windowBounds.minY))
  }
}

private struct PoracodeKeyboardAvoidance: ViewModifier {
  let isActive: Bool
  let reservesSpace: Bool
  let availableHeightChanged: (CGFloat) -> Void
  @State private var space = PoracodeKeyboardSpace()
  @State private var keyboardRevision: UInt64 = 0

  func body(content: Content) -> some View {
    content
      .environment(\.poracodeComposerAvailableHeight, space.availableHeight)
      .padding(.bottom, isActive && reservesSpace ? space.overlap : 0)
      .offset(y: isActive && !reservesSpace ? -space.overlap : 0)
      .background {
        KeyboardGuideReader(revision: keyboardRevision) { value in
          space = value
          availableHeightChanged(value.availableHeight)
        }.allowsHitTesting(false)
      }
      .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { _ in
        // Invalidate measurement only. Geometry always comes from this view's
        // own presentation root, never from a global notification frame.
        keyboardRevision &+= 1
      }
      .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidChangeFrameNotification)) { _ in
        keyboardRevision &+= 1
      }
  }
}

private struct KeyboardGuideReader: UIViewRepresentable {
  let revision: UInt64
  let update: (PoracodeKeyboardSpace) -> Void

  func makeUIView(context: Context) -> KeyboardGuideView {
    let view = KeyboardGuideView()
    view.update = update
    return view
  }

  func updateUIView(_ view: KeyboardGuideView, context: Context) {
    view.update = update
    view.setNeedsLayout()
  }

  static func dismantleUIView(_ view: KeyboardGuideView, coordinator: ()) { view.update = nil }
}

private final class KeyboardGuideView: UIView {
  var update: ((PoracodeKeyboardSpace) -> Void)?
  private var reported: PoracodeKeyboardSpace?
  private weak var keyboardOwner: UIView?

  init() {
    super.init(frame: .zero)
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    var root: UIView = self
    while let parent = root.superview, parent !== window { root = parent }
    keyboardOwner = window == nil ? nil : root
    // Observe the guide without introducing constraints across SwiftUI's
    // hosting/glass hierarchy. Those ancestors belong to SwiftUI's layout.
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let window, let keyboardOwner, keyboardOwner.window === window else { return }
    // A small composer can be completely covered by the keyboard. Its local
    // intersection is too short; use its presentation root's view guide and
    // convert in that same window, including any accessory bar.
    let guide = keyboardOwner.convert(keyboardOwner.keyboardLayoutGuide.layoutFrame, to: window)
    let value = PoracodeKeyboardSpace.resolve(contentFrame: convert(bounds, to: window),
      windowBounds: window.bounds, keyboardFrame: guide,
      safeBottom: window.safeAreaInsets.bottom)
    guard reported != value else { return }
    reported = value
    DispatchQueue.main.async { [weak self] in
      guard let self, self.window != nil, self.reported == value else { return }
      self.update?(value)
    }
  }
}
