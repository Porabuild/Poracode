import CoreGraphics
import SwiftUI

/// Viewport-driven adaptive layout policy for the Home shell.
///
/// UIKit reports `horizontalSizeClass == .compact` on landscape iPhones and can
/// keep compact size class semantics on foldable hardware (`iPhone Duo`,
/// `669x951` unfolded portrait / `678x466` folded landscape). Driving the split
/// container from live window geometry lets narrow portrait screens keep the
/// thumb-reachable single-column stack, gives wide portrait screens (iPad and
/// unfolded Duo) a full-width chat canvas with an on-demand overlay sidebar,
/// and gives landscape viewports a collapsible docked sidebar + detail split.
struct HomeAdaptiveLayoutPolicy: Equatable, Sendable {
  enum Mode: Equatable, Sendable {
    case compactSinglePane
    case splitTwoColumn
  }

  enum SidebarPresentation: Equatable, Sendable {
    case none
    case overlay
    case docked
  }

  static let splitWidthThreshold: CGFloat = 580
  static let compactHeightThreshold: CGFloat = 500
  static let detailCompactSizeClassWidthThreshold: CGFloat = 620
  static let resizableSidebarWidthThreshold: CGFloat = 760
  static let minimumSidebarWidth: CGFloat = 220
  static let minimumDockedInnerSidebarWidth: CGFloat = 180
  static let maximumSidebarWidth: CGFloat = 320
  static let maximumResizableSidebarWidth: CGFloat = 420
  static let minimumDetailWidth: CGFloat = 356

  let mode: Mode
  let sidebarPresentation: SidebarPresentation
  let containerSize: CGSize
  let leadingSafeAreaInset: CGFloat
  let trailingSafeAreaInset: CGFloat
  let sidebarWidth: CGFloat
  let defaultSidebarWidth: CGFloat
  let resizableSidebarWidthRange: ClosedRange<CGFloat>
  let isSidebarResizable: Bool
  let detailWidth: CGFloat
  let isCompactHeight: Bool

  var isSplit: Bool {
    mode == .splitTwoColumn
  }

  var usesOverlaySidebar: Bool {
    sidebarPresentation == .overlay
  }

  var usesDockedSidebar: Bool {
    sidebarPresentation == .docked
  }

  var isPortrait: Bool {
    containerSize.height > containerSize.width
  }

  /// Horizontal width inside safe-area insets available to the root `HStack`.
  var safeContentWidth: CGFloat {
    max(0, containerSize.width - leadingSafeAreaInset - trailingSafeAreaInset)
  }

  /// Frame width to pass inside the safe-area-bounded root `HStack` so the
  /// visual distance from the physical leading screen edge to the sidebar
  /// divider stays proportional to `sidebarWidth` without double-counting
  /// landscape Dynamic Island / corner safe areas.
  var effectiveDockedSidebarFrameWidth: CGFloat {
    guard usesDockedSidebar else { return sidebarWidth }
    let maxInner = max(
      Self.minimumDockedInnerSidebarWidth,
      safeContentWidth - Self.minimumDetailWidth
    )
    let desiredInner = max(
      Self.minimumDockedInnerSidebarWidth,
      sidebarWidth - leadingSafeAreaInset
    )
    return min(desiredInner, maxInner)
  }

  var detailPrefersCompactNavigationSizeClass: Bool {
    effectiveDetailPrefersCompactSizeClass(isSidebarVisible: usesDockedSidebar)
  }

  func effectiveDetailPrefersCompactSizeClass(isSidebarVisible: Bool) -> Bool {
    let availableDetailWidth: CGFloat
    if sidebarPresentation == .docked && isSidebarVisible {
      availableDetailWidth = max(0, safeContentWidth - effectiveDockedSidebarFrameWidth)
    } else {
      availableDetailWidth = safeContentWidth
    }
    return isSplit && availableDetailWidth < Self.detailCompactSizeClassWidthThreshold
  }

  static func defaultDockedSidebarWidth(for width: CGFloat) -> CGFloat {
    let ratio: CGFloat = width >= 900 ? 0.28 : 0.34
    let idealSidebar = min(maximumSidebarWidth, floor(width * ratio))
    let maxAllowedSidebar = max(minimumSidebarWidth, width - minimumDetailWidth)
    return max(minimumSidebarWidth, min(idealSidebar, maxAllowedSidebar))
  }

  static func clampedDockedSidebarWidthRange(for width: CGFloat) -> ClosedRange<CGFloat> {
    let maxAllowed = max(
      minimumSidebarWidth,
      min(maximumResizableSidebarWidth, floor(width - minimumDetailWidth))
    )
    return minimumSidebarWidth ... maxAllowed
  }

  static func resolve(for size: CGSize) -> Self {
    resolve(for: size, safeAreaInsets: EdgeInsets(), preferredSidebarWidth: nil)
  }

  /// Resolves layout policy using `GeometryReader` content size plus safe-area
  /// insets (`PoracodeThemeRoot` keeps content inside the safe area).
  static func resolve(
    for size: CGSize,
    safeAreaInsets: EdgeInsets,
    preferredSidebarWidth: CGFloat? = nil,
    keyboardUnobstructedHeight: CGFloat = 0,
    accessibilitySize: Bool = false,
    retainingMode: Mode? = nil
  ) -> Self {
    let leading = max(0, safeAreaInsets.leading)
    let trailing = max(0, safeAreaInsets.trailing)
    let top = max(0, safeAreaInsets.top)
    let contentHeight = max(0, size.height, keyboardUnobstructedHeight)
    let keyboardOverlap = max(0, contentHeight - max(0, size.height))
    // SwiftUI includes the keyboard in the bottom safe area. Once its space
    // has been restored to the measured height, don't count that inset twice.
    let bottom = max(0, safeAreaInsets.bottom - keyboardOverlap)

    let width = max(0, size.width) + leading + trailing
    let height = contentHeight + top + bottom
    let fullSize = CGSize(width: width, height: height)
    let isCompactHeight = height > 0 && height <= compactHeightThreshold

    // A sheet presented inside a navigation container must finish before
    // replacing that container. Its content still receives the new geometry.
    let usesSplit = retainingMode.map { $0 == .splitTwoColumn } ?? (width >= splitWidthThreshold)
    guard usesSplit else {
      return Self(
        mode: .compactSinglePane,
        sidebarPresentation: .none,
        containerSize: fullSize,
        leadingSafeAreaInset: leading,
        trailingSafeAreaInset: trailing,
        sidebarWidth: 0,
        defaultSidebarWidth: 0,
        resizableSidebarWidthRange: 0 ... 0,
        isSidebarResizable: false,
        detailWidth: max(0, size.width),
        isCompactHeight: isCompactHeight
      )
    }

    if height > width || accessibilitySize || width < splitWidthThreshold {
      let overlayRatio: CGFloat = width >= 900 ? 0.32 : 0.40
      let idealOverlaySidebar = min(maximumSidebarWidth, floor(width * overlayRatio))
      let sidebarWidth: CGFloat =
        if accessibilitySize {
          min(max(0, size.width - 16), max(minimumSidebarWidth, min(560, floor(width * 0.80))))
        } else {
          max(minimumSidebarWidth, min(idealOverlaySidebar, max(minimumSidebarWidth, width - 80)))
        }
      return Self(
        mode: .splitTwoColumn,
        sidebarPresentation: .overlay,
        containerSize: fullSize,
        leadingSafeAreaInset: leading,
        trailingSafeAreaInset: trailing,
        sidebarWidth: sidebarWidth,
        defaultSidebarWidth: sidebarWidth,
        resizableSidebarWidthRange: sidebarWidth ... sidebarWidth,
        isSidebarResizable: false,
        detailWidth: max(0, size.width),
        isCompactHeight: isCompactHeight
      )
    }

    let defaultSidebar = defaultDockedSidebarWidth(for: width)
    let range = clampedDockedSidebarWidthRange(for: width)
    let isResizable = !isCompactHeight && width >= resizableSidebarWidthThreshold
    let sidebarWidth: CGFloat =
      if isResizable, let preferredSidebarWidth, preferredSidebarWidth > 0 {
        min(range.upperBound, max(range.lowerBound, round(preferredSidebarWidth)))
      } else {
        defaultSidebar
      }
    let detailWidth = max(0, width - sidebarWidth)

    return Self(
      mode: .splitTwoColumn,
      sidebarPresentation: .docked,
      containerSize: fullSize,
      leadingSafeAreaInset: leading,
      trailingSafeAreaInset: trailing,
      sidebarWidth: sidebarWidth,
      defaultSidebarWidth: defaultSidebar,
      resizableSidebarWidthRange: range,
      isSidebarResizable: isResizable,
      detailWidth: detailWidth,
      isCompactHeight: isCompactHeight
    )
  }

  func detailHorizontalSizeClassOverride(
    inheriting inheritedSizeClass: UserInterfaceSizeClass?,
    isSidebarVisible: Bool = true
  ) -> UserInterfaceSizeClass? {
    guard effectiveDetailPrefersCompactSizeClass(isSidebarVisible: isSidebarVisible),
      inheritedSizeClass != .compact
    else {
      return inheritedSizeClass
    }
    return .compact
  }
}

struct PoracodeSplitDetailContext: Equatable, Sendable {
  // nil means the detail is not hosted by the adaptive split shell.
  var isPortrait: Bool? = nil
  var isCompactHeight: Bool = false
}

private struct PoracodeSplitDetailContextKey: EnvironmentKey {
  static let defaultValue = PoracodeSplitDetailContext()
}

extension EnvironmentValues {
  var poracodeSplitDetailContext: PoracodeSplitDetailContext {
    get { self[PoracodeSplitDetailContextKey.self] }
    set { self[PoracodeSplitDetailContextKey.self] = newValue }
  }
}
