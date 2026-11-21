import SwiftUI

/// Groups floating glass controls so the system can merge and morph them on
/// iOS 26. `spacing` must stay below the resting gap between distinct glass
/// shapes so they do not fuse at rest; morphs come from `poracodeGlassID`
/// identifiers, not from container spacing. Below iOS 26 the content renders
/// unchanged because the controls already fall back to bordered styles.
struct PoracodeGlassGroup<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  init(spacing: CGFloat = 8, @ViewBuilder content: () -> Content) {
    self.spacing = spacing
    self.content = content()
  }

  var body: some View {
    Group {
      if #available(iOS 26.0, *) {
        GlassEffectContainer(spacing: spacing) { content }
      } else {
        content
      }
    }
  }
}

/// Clips a column horizontally while allowing its background to extend under
/// the surrounding navigation and home-indicator safe areas.
struct PoracodeColumnHorizontalClip: Shape {
  func path(in rect: CGRect) -> Path {
    Path(rect.insetBy(dx: 0, dy: -256))
  }
}

extension View {
  /// A content surface is needed only when an inspector covers the document.
  /// Keep its shadow outside the column so it can blend into the conversation.
  func poracodeInspectorOverlaySurface(enabled: Bool) -> some View {
    background {
      if enabled {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .fill(.regularMaterial)
          .shadow(color: .black.opacity(0.14), radius: 18, y: 4)
      }
    }
  }

  /// Gives this view's glass effect a stable identity so the system can morph
  /// it into another glass shape inside the same `PoracodeGlassGroup`.
  @ViewBuilder
  func poracodeGlassID(
    _ id: some Hashable & Sendable,
    in namespace: Namespace.ID
  ) -> some View {
    if #available(iOS 26.0, *) {
      glassEffectID(id, in: namespace)
    } else {
      self
    }
  }

  /// Opaque bar material below iOS 26. On iOS 26 bars attached through
  /// `poracodeBottomBar`/`poracodeTopBar` float their controls over the system
  /// scroll-edge effect, so no background or divider is drawn.
  @ViewBuilder
  func poracodeBarBackground(divider edge: VerticalEdge? = nil) -> some View {
    if #available(iOS 26.0, *) {
      self
    } else {
      background(.bar).overlay(alignment: edge == .bottom ? .bottom : .top) {
        if edge != nil { Divider() }
      }
    }
  }

  /// Attaches bottom chrome through the iOS 26 safe-area bar so the system
  /// scroll-edge effect softens scrolling content beneath it; falls back to a
  /// plain bottom safe-area inset on earlier systems.
  @ViewBuilder
  func poracodeBottomBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
    if #available(iOS 26.0, *) {
      safeAreaBar(edge: .bottom, spacing: 0) { bar() }
    } else {
      safeAreaInset(edge: .bottom, spacing: 0) { bar() }
    }
  }

  /// Floating controls without the system bar's rectangular scroll-edge
  /// surface. Content padding reserves space without making the controls
  /// follow the keyboard with a system safe-area bar.
  func poracodeFloatingBottomBar<Bar: View>(
    clearance: CGFloat, @ViewBuilder _ bar: () -> Bar
  ) -> some View {
    padding(.bottom, clearance)
    .overlay(alignment: .bottom) { bar() }
  }

  /// Bottom chrome that hosts the expanding UIKit composer editor. On iOS 26
  /// `safeAreaBar` kept the composer from expanding on tap, so composer
  /// chrome stays a plain safe-area inset on every system.
  func poracodeComposerInset<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
    safeAreaInset(edge: .bottom, spacing: 0) { bar() }
  }

  /// Top-edge counterpart to `poracodeBottomBar`.
  @ViewBuilder
  func poracodeTopBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
    if #available(iOS 26.0, *) {
      safeAreaBar(edge: .top, spacing: 0) { bar() }
    } else {
      safeAreaInset(edge: .top, spacing: 0) { bar() }
    }
  }

  /// Marks this view as the zoom-transition source for a sheet or navigation
  /// destination on iOS 26; identity below.
  @ViewBuilder
  func poracodeZoomSource(
    id: some Hashable,
    in namespace: Namespace.ID
  ) -> some View {
    if #available(iOS 26.0, *) {
      matchedTransitionSource(id: id, in: namespace)
    } else {
      self
    }
  }

  /// Zooms the modified view out of `sourceID` on iOS 26; presentation is
  /// unchanged below.
  @ViewBuilder
  func poracodeZoomTransition(
    sourceID: some Hashable,
    in namespace: Namespace.ID
  ) -> some View {
    if #available(iOS 26.0, *) {
      navigationTransition(.zoom(sourceID: sourceID, in: namespace))
    } else {
      self
    }
  }

  /// Hides the navigation bar background only where the system bar has no
  /// scroll-edge treatment; on iOS 26 the glass bar stays so scrolling content
  /// softens beneath the header.
  @ViewBuilder
  func poracodeNavigationBarChrome() -> some View {
    if #available(iOS 26.0, *) {
      self
    } else {
      toolbarBackground(.hidden, for: .navigationBar)
    }
  }
}
