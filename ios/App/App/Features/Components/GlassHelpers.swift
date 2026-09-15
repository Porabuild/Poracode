import SwiftUI

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
    HStack(spacing: 0) {
      if placement == .trailing { Spacer(minLength: 0) }
      content
      if placement == .leading { Spacer(minLength: 0) }
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
    HStack(spacing: 12) {
      leading
      Spacer(minLength: 0)
      trailing
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
    Group {
      if #available(iOS 26.0, *) {
        GlassEffectContainer(spacing: 12) { controls }
      } else {
        controls
      }
    }
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
  private let action: () -> Void
  private let label: Label

  init(
    color: Color = .secondary,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.color = color
    self.action = action
    self.label = label()
  }

  var body: some View {
    Group {
      if #available(iOS 26.0, *) {
        button.buttonStyle(.glass)
      } else {
        button.buttonStyle(.bordered)
      }
    }
  }

  private var button: some View {
    Button(action: action) {
      label.frame(width: 30, height: 30).contentShape(Circle())
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
      .poracodeGlassBackground(in: Capsule())
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
