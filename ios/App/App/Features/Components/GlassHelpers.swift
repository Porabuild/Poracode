import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Shared continuous geometry for native content, distinct from system control chrome.
enum PoracodeShapes {
  static var content: RoundedRectangle { RoundedRectangle(cornerRadius: 14, style: .continuous) }
}

/// A quiet, opaque-looking content grouping that stays legible over themed
/// surfaces. Glass is reserved for controls and navigation above the content.
private struct PoracodeContentCardBackground: ViewModifier {
  @Environment(\.colorSchemeContrast) private var contrast

  func body(content: Content) -> some View {
    content.background(
      Color.primary.opacity(contrast == .increased ? 0.12 : 0.06),
      in: PoracodeShapes.content
    )
  }
}

extension View {
  @ViewBuilder
  func poracodeContentCardBackground(enabled: Bool = true) -> some View {
    if enabled { modifier(PoracodeContentCardBackground()) }
    else { self }
  }
}

private struct PoracodeInputSurface<FieldShape: InsettableShape, Fill: ShapeStyle>: ViewModifier {
  let shape: FieldShape
  let fill: Fill
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.pixelLength) private var pixelLength

  func body(content: Content) -> some View {
    content.background(fill, in: shape)
      .overlay {
        shape.strokeBorder(
          Color.primary.opacity(contrast == .increased ? 0.24 : 0.035),
          lineWidth: contrast == .increased ? 1 : pixelLength
        )
          .allowsHitTesting(false)
      }
  }
}

extension View {
  func poracodeInputSurface(
    in shape: some InsettableShape = PoracodeShapes.content,
    fill: some ShapeStyle = Color.primary.opacity(0.06)
  ) -> some View {
    modifier(PoracodeInputSurface(shape: shape, fill: fill))
  }
}

/// The shared geometry for panel navigation and shortcut controls.
struct PoracodePanelControlStrip<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 2) { content() }
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .frame(maxWidth: .infinity)
      .poracodeGlassBackground(in: Capsule(), interactive: true)
  }
}

private struct PoracodeGlassBackground<BackgroundShape: Shape>: ViewModifier {
  let shape: BackgroundShape
  let interactive: Bool

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content.glassEffect(.regular.interactive(interactive), in: shape)
    } else {
      content.background(.ultraThinMaterial, in: shape)
    }
  }
}
enum PoracodeBottomActionPlacement {
  case leading
  case trailing
}

/// Keeps one page-level action in the phone's thumb-reachable lower corner.
/// The action supplies its own native control style, typically
/// `PoracodeCircleButton`, while this view owns consistent safe-area spacing.
struct PoracodeBottomActionDock<Content: View>: View {
  private let placement: PoracodeBottomActionPlacement
  private let content: Content

  init(
    placement: PoracodeBottomActionPlacement = .trailing,
    @ViewBuilder content: () -> Content
  ) {
    self.placement = placement
    self.content = content()
  }

  var body: some View {
    PoracodeGlassGroup(spacing: 8) {
      HStack(spacing: 0) {
        if placement == .trailing { Spacer(minLength: 0) }
        content
        if placement == .leading { Spacer(minLength: 0) }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
  }
}

/// Places a supporting action at the lower leading edge and the page's primary
/// action at the lower trailing edge. Both controls remain native and clear of
/// the home indicator.
struct PoracodeBottomActionBar<Leading: View, Trailing: View>: View {
  private let leading: Leading
  private let trailing: Trailing

  init(
    @ViewBuilder leading: () -> Leading,
    @ViewBuilder trailing: () -> Trailing
  ) {
    self.leading = leading()
    self.trailing = trailing()
  }

  var body: some View {
    PoracodeGlassGroup(spacing: 8) {
      HStack(spacing: 12) {
        leading
        Spacer(minLength: 0)
        trailing
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
  }
}

/// Keeps supporting, mode, and primary controls on one thumb-reachable row.
/// The fixed edge slots keep the center control visually centered even when
/// only one side has an action.
struct PoracodeBottomActionStrip<Leading: View, Center: View, Trailing: View>: View {
  private let leading: Leading
  private let center: Center
  private let trailing: Trailing

  init(
    @ViewBuilder leading: () -> Leading,
    @ViewBuilder center: () -> Center,
    @ViewBuilder trailing: () -> Trailing
  ) {
    self.leading = leading()
    self.center = center()
    self.trailing = trailing()
  }

  var body: some View {
    PoracodeGlassGroup(spacing: 8) { controls }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
  }

  private var controls: some View {
    HStack(spacing: 12) {
      leading.frame(width: 44, height: 44)
      Spacer(minLength: 0)
      center
      Spacer(minLength: 0)
      trailing.frame(width: 44, height: 44)
    }
  }
}

struct PoracodeCircleButton<Label: View>: View {
  private let color: Color
  private let size: CGFloat
  private let onSurface: Bool
  private let action: () -> Void
  private let label: Label

  init(
    color: Color = .secondary,
    size: CGFloat = 30,
    onSurface: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.color = color
    self.size = size
    self.onSurface = onSurface
    self.action = action
    self.label = label()
  }

  var body: some View {
    Group {
      if onSurface {
        button.buttonStyle(.bordered)
      } else if #available(iOS 26.0, *) {
        button.buttonStyle(.glass)
      } else {
        button.buttonStyle(.bordered)
      }
    }
  }

  private var button: some View {
    Button(action: action) {
      label.frame(width: size, height: size).contentShape(Circle())
    }
      .buttonBorderShape(.circle)
      .foregroundStyle(color)
      .tint(color)
  }
}

/// Reusable thumb-reachable search field for bottom action strips. It avoids
/// coupling system search presentation to a page's navigation ownership.
struct PoracodeBottomSearchField: View {
  @Binding var text: String
  let prompt: String
  @FocusState private var isFocused: Bool

  var body: some View {
    TextField(prompt, text: $text)
      .textFieldStyle(.plain)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .submitLabel(.search)
      .focused($isFocused)
      .padding(.horizontal, 16)
      .frame(height: 44)
      .poracodeInputSurface(in: Capsule(), fill: Material.regular)
      .onAppear { isFocused = true }
  }
}

struct PoracodeCircleMenu<Content: View, Label: View>: View {
  private let content: Content
  private let label: Label

  init(
    @ViewBuilder content: () -> Content,
    @ViewBuilder label: () -> Label
  ) {
    self.content = content()
    self.label = label()
  }

  var body: some View {
    Group {
      if #available(iOS 26.0, *) {
        menu.buttonStyle(.glass)
      } else {
        menu.buttonStyle(.bordered)
      }
    }
  }

  private var menu: some View {
    Menu { content } label: {
      label.frame(width: 30, height: 30).contentShape(Circle())
    }
      .buttonBorderShape(.circle)
      .foregroundStyle(.secondary)
      .tint(.secondary)
  }
}

/// Interactive horizontal resize grip positioned on the boundary between
/// split-view columns (sidebar / conversation / inspector). Tracks horizontal
/// drags smoothly, ticks light haptics as the width crosses the default
/// detent, and resets to the default width on double-tap.
struct PoracodePanelResizeHandle: View {
  enum Side {
    /// Handle at the trailing edge of a leading column (dragging right widens it).
    case trailingOfLeadingPanel
    /// Handle at the leading edge of a trailing column (dragging left widens it).
    case leadingOfTrailingPanel

    fileprivate var dragMultiplier: CGFloat {
      switch self {
      case .trailingOfLeadingPanel: 1
      case .leadingOfTrailingPanel: -1
      }
    }
  }

  let side: Side
  let label: String
  let currentWidth: CGFloat
  let defaultWidth: CGFloat
  let allowedRange: ClosedRange<CGFloat>
  var showsGuideWhileDragging = false
  let onLiveResize: (CGFloat) -> Void
  let onCommit: (CGFloat) -> Void
  let onReset: () -> Void

  @State private var dragStartWidth: CGFloat?
  @State private var previousLiveWidth: CGFloat?
  @State private var isHovering = false

  private var isDragging: Bool { dragStartWidth != nil }
  private var isActive: Bool { isDragging || isHovering }

  var body: some View {
    ZStack {
      if showsGuideWhileDragging && isDragging {
        Rectangle()
          .fill(Color.primary.opacity(0.10))
          .frame(width: 1)
          .frame(maxHeight: .infinity)
      }

      Group {
        if isActive {
          Capsule(style: .continuous)
            .fill(Color.primary.opacity(0.62))
            .frame(width: 3.5, height: 26)
            .padding(.horizontal, 3)
            .padding(.vertical, 6)
            .poracodeGlassBackground(in: Capsule(), interactive: true)
        } else {
          Capsule(style: .continuous)
            .fill(Color.secondary.opacity(0.28))
            .frame(width: 3.5, height: 22)
        }
      }
      .animation(.snappy(duration: 0.16), value: isActive)
    }
    .frame(width: 16)
    .frame(maxHeight: .infinity)
    .padding(.vertical, 56)
    .contentShape(Rectangle())
    .onHover { hovering in
      isHovering = hovering
    }
    .modifier(PoracodeColumnResizePointerModifier())
    .gesture(resizeGesture)
    .onTapGesture(count: 2) {
      triggerDetentHaptic()
      onReset()
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue("\(Int(round(currentWidth))) pt")
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment:
        let next = clampWidth(currentWidth + 24)
        triggerDetentHaptic()
        onCommit(next)
      case .decrement:
        let next = clampWidth(currentWidth - 24)
        triggerDetentHaptic()
        onCommit(next)
      @unknown default:
        break
      }
    }
  }

  private var resizeGesture: some Gesture {
    DragGesture(minimumDistance: 6, coordinateSpace: .global)
      .onChanged { value in
        let start = dragStartWidth ?? currentWidth
        if dragStartWidth == nil {
          dragStartWidth = start
          previousLiveWidth = currentWidth
        }
        let proposed = clampWidth(start + value.translation.width * side.dragMultiplier)
        if let prev = previousLiveWidth,
          crossedDetent(from: prev, to: proposed, detent: defaultWidth)
        {
          triggerDetentHaptic()
        }
        previousLiveWidth = proposed
        onLiveResize(proposed)
      }
      .onEnded { value in
        let start = dragStartWidth ?? currentWidth
        let finalWidth = clampWidth(start + value.translation.width * side.dragMultiplier)
        dragStartWidth = nil
        previousLiveWidth = nil
        onCommit(finalWidth)
      }
  }

  private func clampWidth(_ raw: CGFloat) -> CGFloat {
    min(allowedRange.upperBound, max(allowedRange.lowerBound, round(raw)))
  }

  private func crossedDetent(from previous: CGFloat, to next: CGFloat, detent: CGFloat) -> Bool {
    guard allowedRange.contains(detent) else { return false }
    let tolerance: CGFloat = 1.5
    let wasNear = abs(previous - detent) <= tolerance
    let isNear = abs(next - detent) <= tolerance
    if !wasNear && isNear { return true }
    return (previous < detent - tolerance && next > detent + tolerance)
      || (previous > detent + tolerance && next < detent - tolerance)
  }

  private func triggerDetentHaptic() {
    #if canImport(UIKit)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    #endif
  }
}

private struct PoracodeColumnResizePointerModifier: ViewModifier {
  func body(content: Content) -> some View {
    #if os(macOS)
    if #available(macOS 15.0, *) {
      content.pointerStyle(.columnResize)
    } else {
      content
    }
    #elseif os(iOS)
    content.hoverEffect(.highlight)
    #else
    content
    #endif
  }
}

extension View {
  /// Measure the space available without the software keyboard while leaving
  /// the foreground view free to avoid the keyboard in its normal layout.
  func poracodeObserveKeyboardUnobstructedSize(_ update: @escaping (CGSize) -> Void) -> some View {
    background {
      GeometryReader { proxy in
        Color.clear
          .onAppear { update(proxy.size) }
          .onChange(of: proxy.size) { _, size in update(size) }
      }
      .ignoresSafeArea(.keyboard, edges: .bottom)
    }
  }

  /// Apply Liquid Glass styling when available; fall back to standard materials.
  /// `interactive` opts the glass into the system's touch response on iOS 26.
  func poracodeGlassBackground(
    in shape: some Shape = RoundedRectangle(cornerRadius: 16, style: .continuous),
    interactive: Bool = false
  ) -> some View {
    modifier(PoracodeGlassBackground(shape: shape, interactive: interactive))
  }

  /// Applies `.navigationTitle` only when the view owns a navigation bar, so
  /// inspector-embedded panels never overwrite the enclosing thread title.
  @ViewBuilder
  func poracodeNavigationTitle(
    _ title: String,
    inline: Bool = true,
    suppressed: Bool
  ) -> some View {
    if suppressed {
      self
    } else if inline {
      navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    } else {
      navigationTitle(title)
    }
  }

  /// Presents modal utility sheets as centered form cards on wide screens and
  /// adaptive sheets on compact viewports.
  @ViewBuilder
  func poracodeFormSheetSizing() -> some View {
    Group {
      if #available(iOS 18.0, *) { presentationSizing(.form) }
      else { self }
    }
    .environment(\.composerVoiceHost, nil)
  }

  /// Presents rich multi-column or browser/terminal workspace sheets using page
  /// sizing on wide screens so split navigation and sidebars have room.
  @ViewBuilder
  func poracodePageSheetSizing() -> some View {
    Group {
      if #available(iOS 18.0, *) { presentationSizing(.page) }
      else { self }
    }
    .environment(\.composerVoiceHost, nil)
  }

  /// Centers a stacked reading/dashboard measure on wide screens while keeping
  /// compact layouts edge-to-edge within their normal padding.
  func poracodeReadableWidth(_ maxWidth: CGFloat = 760) -> some View {
    frame(maxWidth: maxWidth)
      .frame(maxWidth: .infinity)
  }

  /// Centers grouped list/form cards to a readable measure on wide screens
  /// without clipping full-bleed scroll backgrounds or overriding default compact
  /// horizontal margins.
  func poracodeReadableListMargins(_ maxWidth: CGFloat = 760) -> some View {
    modifier(PoracodeReadableListMarginsModifier(maxWidth: maxWidth))
  }
}

private struct PoracodeReadableListMarginsModifier: ViewModifier {
  let maxWidth: CGFloat
  @State private var containerWidth: CGFloat = 0
  @State private var hasHorizontalSafeAreaInset = false

  func body(content: Content) -> some View {
    // A split view supplies a sidebar safe-area inset; overriding its margins
    // would let the list extend underneath that sidebar.
    let horizontalInset: CGFloat? =
      !hasHorizontalSafeAreaInset && containerWidth > maxWidth + 40
      ? floor((containerWidth - maxWidth) / 2)
      : nil
    content
      .contentMargins(.horizontal, horizontalInset, for: .scrollContent)
      .background {
        GeometryReader { proxy in
          Color.clear
            .onAppear {
              updateWidth(proxy.size.width)
              updateSafeArea(proxy.safeAreaInsets)
            }
            .onChange(of: proxy.size.width) { _, width in
              updateWidth(width)
            }
            .onChange(of: proxy.safeAreaInsets) { _, insets in
              updateSafeArea(insets)
            }
        }
      }
  }

  private func updateWidth(_ width: CGFloat) {
    guard abs(containerWidth - width) > 0.5 else { return }
    containerWidth = width
  }

  private func updateSafeArea(_ insets: EdgeInsets) {
    hasHorizontalSafeAreaInset = insets.leading > 0 || insets.trailing > 0
  }
}

private struct PoracodeCloseThreadDetailKey: EnvironmentKey {
  static let defaultValue: (@MainActor @Sendable () -> Void)? = nil
}

private struct PoracodeEmbeddedInInspectorKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  var poracodeCloseThreadDetail: (@MainActor @Sendable () -> Void)? {
    get { self[PoracodeCloseThreadDetailKey.self] }
    set { self[PoracodeCloseThreadDetailKey.self] = newValue }
  }

  var poracodeEmbeddedInInspector: Bool {
    get { self[PoracodeEmbeddedInInspectorKey.self] }
    set { self[PoracodeEmbeddedInInspectorKey.self] = newValue }
  }
}

extension View {
  /// Applies the native grouped-list treatment used by compact drawers.
  /// SwiftUI owns the drawer surface and safe-area material.
  func poracodeDrawerListStyle() -> some View {
    listStyle(.insetGrouped)
      .contentMargins(.top, 0, for: .scrollContent)
      .contentMargins(.bottom, 16, for: .scrollContent)
  }

  /// Uses the app's neutral elevated surface for rows inside native drawers.
  func poracodeDrawerRowSurface() -> some View {
    modifier(PoracodeDrawerRowSurfaceModifier())
  }
}

private struct PoracodeDrawerRowSurfaceModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  func body(content: Content) -> some View {
    content.listRowBackground(theme.variant(for: colorScheme).surface)
  }
}
