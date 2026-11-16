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

extension View {
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
