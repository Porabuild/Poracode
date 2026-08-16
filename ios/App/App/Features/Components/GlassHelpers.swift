import SwiftUI

enum PoracodeCircleButtonSurface {
  case automatic
  case glass
}

struct PoracodeCircleButton<Label: View>: View {
  private let surface: PoracodeCircleButtonSurface
  private let action: () -> Void
  private let label: Label

  init(
    surface: PoracodeCircleButtonSurface = .glass,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.surface = surface
    self.action = action
    self.label = label()
  }

  @ViewBuilder
  var body: some View {
    switch surface {
    case .automatic:
      automaticButton
    case .glass:
      if #available(iOS 26.0, *) {
        glassButton
          .buttonStyle(.glass)
      } else {
        glassButton
          .buttonStyle(.bordered)
      }
    }
  }

  private var automaticButton: some View {
    Button(action: action) {
      label
    }
    .buttonBorderShape(.circle)
    .foregroundStyle(.primary)
    .tint(.primary)
  }

  private var glassButton: some View {
    Button(action: action) {
      label
        .frame(width: 30, height: 30)
        .contentShape(Circle())
    }
    .buttonBorderShape(.circle)
    .foregroundStyle(.primary)
    .tint(.primary)
  }
}

extension View {
  /// Apply Liquid Glass styling when available; fall back to standard materials.
  @ViewBuilder
  func poracodeGlassBackground(
    in shape: some Shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
  ) -> some View {
    if #available(iOS 26.0, *) {
      // Liquid Glass when the OS supports it; still clipped to the shape.
      self.glassEffect(in: shape)
    } else {
      self.background(.ultraThinMaterial, in: shape)
    }
  }

  @ViewBuilder
  func poracodeProminentButtonStyle() -> some View {
    if #available(iOS 26.0, *) {
      self.buttonStyle(.glassProminent)
    } else {
      self.buttonStyle(.borderedProminent)
    }
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
