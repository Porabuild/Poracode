import SwiftUI

enum RichChatInspectorGeometry {
  static let minimumOverlayWidth: CGFloat = 600
  static let minimumDockedWidth: CGFloat = 960
  static let minimumPanelWidth: CGFloat = 360
  static let minimumChatWidth: CGFloat = 560

  static func widthRange(available: CGFloat, docked: Bool) -> ClosedRange<CGFloat> {
    let remaining = docked ? available - minimumChatWidth : available - 24
    return minimumPanelWidth ... max(minimumPanelWidth, min(440, floor(remaining)))
  }
}

struct RichChatInspectorCapability: Equatable {
  var supportsInspector = false
  var docksInspector = false
  var defaultOpen = false

  static func resolve(
    size: CGSize,
    breakpoint: CGFloat,
    keyboardUnobstructedHeight: CGFloat = 0,
    accessibilitySize: Bool = false
  ) -> Self {
    let availableHeight = max(size.height, keyboardUnobstructedHeight)
    let supportsInspector = breakpoint.isFinite && !accessibilitySize
      && size.width >= RichChatInspectorGeometry.minimumOverlayWidth && availableHeight >= 500
    // Opening the inspector is always an explicit choice, at every size.
    return Self(supportsInspector: supportsInspector,
      docksInspector: supportsInspector && size.width >= max(breakpoint, RichChatInspectorGeometry.minimumDockedWidth))
  }
}

struct RichChatInspectorCapabilityPreferenceKey: PreferenceKey {
  static let defaultValue = RichChatInspectorCapability()

  static func reduce(value: inout RichChatInspectorCapability, nextValue: () -> RichChatInspectorCapability) {
    value = nextValue()
  }
}

private struct RichChatCompactOverlayHeightPreferenceKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

private struct RichChatCompactOverlayClearanceKey: EnvironmentKey {
  static let defaultValue: CGFloat = 0
}

private struct RichChatInspectorVisibleKey: EnvironmentKey {
  static let defaultValue = true
}

private struct RichChatInspectorWidthKey: EnvironmentKey {
  static let defaultValue: CGFloat = 360
}

extension EnvironmentValues {
  var richChatCompactOverlayClearance: CGFloat {
    get { self[RichChatCompactOverlayClearanceKey.self] }
    set { self[RichChatCompactOverlayClearanceKey.self] = newValue }
  }

  var richChatInspectorVisible: Bool {
    get { self[RichChatInspectorVisibleKey.self] }
    set { self[RichChatInspectorVisibleKey.self] = newValue }
  }

  var richChatInspectorWidth: CGFloat {
    get { self[RichChatInspectorWidthKey.self] }
    set { self[RichChatInspectorWidthKey.self] = newValue }
  }
}

/// Reusable adaptive conversation geometry. Pages provide feature-specific
/// surfaces; this component owns the wide/compact split, toggleable inspector
/// sizing, centered reading measure, and bottom safe-area composition.
struct RichChatResponsiveLayout<
  CompactHeader: View,
  Transcript: View,
  Sidebar: View,
  CompactDock: View,
  Composer: View
>: View {
  let breakpoint: CGFloat
  let maximumSidebarWidth: CGFloat
  let sidebarWidthRatio: CGFloat
  let showsComposer: Bool
  let isInspectorVisible: Bool?
  let onCapabilityChange: ((RichChatInspectorCapability) -> Void)?
  private let compactHeader: CompactHeader
  private let transcript: Transcript
  private let sidebar: Sidebar
  private let compactDock: CompactDock
  private let composer: Composer

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @AppStorage("ios.layout.inspectorWidth.v1") private var storedInspectorWidth: Double = 0
  @State private var inspectorDragWidth: CGFloat?
  @State private var compactOverlayHeight: CGFloat = 0
  @State private var composerFocused = false
  @State private var keyboardUnobstructedSize: CGSize = .zero

  init(
    breakpoint: CGFloat = 960,
    maximumSidebarWidth: CGFloat = 400,
    sidebarWidthRatio: CGFloat = 0.36,
    showsComposer: Bool = true,
    isInspectorVisible: Bool? = nil,
    onCapabilityChange: ((RichChatInspectorCapability) -> Void)? = nil,
    @ViewBuilder compactHeader: () -> CompactHeader,
    @ViewBuilder transcript: () -> Transcript,
    @ViewBuilder sidebar: () -> Sidebar,
    @ViewBuilder compactDock: () -> CompactDock,
    @ViewBuilder composer: () -> Composer
  ) {
    self.breakpoint = breakpoint
    self.maximumSidebarWidth = maximumSidebarWidth
    self.sidebarWidthRatio = sidebarWidthRatio
    self.showsComposer = showsComposer
    self.isInspectorVisible = isInspectorVisible
    self.onCapabilityChange = onCapabilityChange
    self.compactHeader = compactHeader()
    self.transcript = transcript()
    self.sidebar = sidebar()
    self.compactDock = compactDock()
    self.composer = composer()
  }

  var body: some View {
    GeometryReader { proxy in
      let capability = RichChatInspectorCapability.resolve(
        size: proxy.size,
        breakpoint: breakpoint,
        keyboardUnobstructedHeight: PoracodeKeyboardViewport.height(keyboardUnobstructedSize, matching: proxy.size),
        accessibilitySize: dynamicTypeSize.isAccessibilitySize
      )
      let showsInspector = capability.supportsInspector
        && (isInspectorVisible ?? capability.defaultOpen)
      responsiveContent(
        width: proxy.size.width,
        showsInspector: showsInspector,
        docksInspector: capability.docksInspector
      )
      .preference(
        key: RichChatInspectorCapabilityPreferenceKey.self,
        value: capability
      )
      .onAppear {
        onCapabilityChange?(capability)
      }
      .onChange(of: capability) { _, updated in
        onCapabilityChange?(updated)
      }
    }
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .poracodeObserveKeyboardUnobstructedSize { keyboardUnobstructedSize = $0 }
  }

  private func defaultInspectorWidth(for width: CGFloat) -> CGFloat {
    max(RichChatInspectorGeometry.minimumPanelWidth, min(maximumSidebarWidth, floor(width * sidebarWidthRatio)))
  }

  private func inspectorWidthRange(for width: CGFloat, docked: Bool) -> ClosedRange<CGFloat> {
    RichChatInspectorGeometry.widthRange(available: width, docked: docked)
  }

  private func resolvedInspectorWidth(for width: CGFloat, docked: Bool) -> CGFloat {
    let range = inspectorWidthRange(for: width, docked: docked)
    let fallback = defaultInspectorWidth(for: width)
    let preferred =
      inspectorDragWidth
      ?? (storedInspectorWidth > 0 ? CGFloat(storedInspectorWidth) : fallback)
    return min(range.upperBound, max(range.lowerBound, round(preferred)))
  }

  private func responsiveContent(width: CGFloat, showsInspector: Bool, docksInspector: Bool) -> some View {
    let range = inspectorWidthRange(for: width, docked: docksInspector)
    let fallback = defaultInspectorWidth(for: width)
    let inspectorWidth = resolvedInspectorWidth(for: width, docked: docksInspector)
    return HStack(spacing: 0) {
      // Keep the transcript at the same position in the view tree as the
      // inspector opens and closes. This also preserves an unsent terminal
      // command and its focus while its viewport is resized.
      VStack(spacing: 0) {
        if !showsInspector {
          compactHeader
        }
        transcript
          .environment(
            \.richChatCompactOverlayClearance,
            compactOverlayHeight
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      // One composer instance survives panel toggles, preserving keyboard
      // focus as well as its draft. The transcript reserves the measured space.
      .overlay(alignment: .bottom) {
        if showsComposer {
          PoracodeGlassGroup(spacing: 2) {
            VStack(spacing: 0) {
              compactDock
                .environment(\.richChatInspectorVisible, showsInspector)
              composer
                .onPreferenceChange(PoracodeComposerFocusPreferenceKey.self) { composerFocused = $0 }
            }
            .frame(maxWidth: 900)
          }
          .frame(maxWidth: .infinity)
          .poracodeAvoidKeyboard(isActive: composerFocused)
          .background {
            GeometryReader { proxy in
              Color.clear.preference(
                key: RichChatCompactOverlayHeightPreferenceKey.self,
                value: proxy.size.height
              )
            }
          }
        }
      }
      .onPreferenceChange(RichChatCompactOverlayHeightPreferenceKey.self) {
        compactOverlayHeight = max(0, $0)
      }

      // Keep the panel mounted while collapsed or temporarily too narrow.
      // Its file editor can contain unsaved work that must survive either.
      sidebar
        .environment(\.richChatInspectorVisible, showsInspector)
        .environment(\.richChatInspectorWidth, inspectorWidth)
        .frame(width: inspectorWidth)
        .frame(maxHeight: .infinity)
        .poracodeInspectorOverlaySurface(enabled: showsInspector && !docksInspector)
        .opacity(showsInspector ? 1 : 0)
        .allowsHitTesting(showsInspector)
        .accessibilityHidden(!showsInspector)
        .frame(width: showsInspector && docksInspector ? inspectorWidth : 0, alignment: .trailing)
        .zIndex(1)
    }
    .overlay(alignment: .trailing) {
      if showsInspector && range.upperBound > range.lowerBound {
        PoracodePanelResizeHandle(
          side: .leadingOfTrailingPanel,
          label: HomeStrings.resizeInspector,
          currentWidth: inspectorWidth,
          defaultWidth: fallback,
          allowedRange: range,
          showsGuideWhileDragging: true,
          onLiveResize: { inspectorDragWidth = $0 },
          onCommit: { committed in
            storedInspectorWidth = Double(committed)
            inspectorDragWidth = nil
          },
          onReset: {
            withAnimation(.snappy(duration: 0.22)) {
              storedInspectorWidth = 0
              inspectorDragWidth = nil
            }
          }
        )
        .offset(x: -(inspectorWidth - 8))
      }
    }
  }
}
