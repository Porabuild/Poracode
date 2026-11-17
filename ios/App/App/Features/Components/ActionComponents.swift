import SwiftUI

enum PoracodeActionTone {
  case ordinary
  case destructive
}

/// Lets the navigation toolbar own its native Liquid Glass shape and hit area.
/// Supplying custom glass here would create a second circle inside toolbar chrome.
/// Uses the standard icon-only Button convention so the system toolbar hosts it
/// like a native bar button; the localized title doubles as the accessibility
/// label while only the symbol renders.
struct PoracodeToolbarIconButton: View {
  let title: String
  let systemImage: String
  var color: Color = .secondary
  let action: () -> Void

  var body: some View {
    Button(title, systemImage: systemImage, action: action)
      .labelStyle(.iconOnly)
      .buttonBorderShape(.circle)
      .foregroundStyle(color)
      .tint(color)
  }
}

/// Shared action label for menus, drawers, and lists. Symbols stay neutral so
/// ordinary actions do not inherit the app accent; destructive meaning is
/// carried by the text and the native button role.
struct PoracodeActionLabel: View {
  let title: String
  let systemImage: String
  let tone: PoracodeActionTone
  let showsDisclosureIndicator: Bool

  init(
    _ title: String,
    systemImage: String,
    tone: PoracodeActionTone = .ordinary,
    showsDisclosureIndicator: Bool = false
  ) {
    self.title = title
    self.systemImage = systemImage
    self.tone = tone
    self.showsDisclosureIndicator = showsDisclosureIndicator
  }

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 22)
      Text(title)
        .foregroundStyle(tone == .destructive ? Color.red : Color.primary)
      Spacer(minLength: 0)
      if showsDisclosureIndicator {
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
    }
    .contentShape(Rectangle())
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A compact neutral notice surface for persistent page and composer states.
/// The caller owns the message and symbol; this component owns the shared
/// material, border, spacing, and full-width bubble geometry.
struct PoracodeStatusBubble<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 8) {
      content()
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 9)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeNativeBubbleSurface(in: shape)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: 14, style: .continuous)
  }
}

/// Titles orient the content hierarchy rather than sharing the glass treatment
/// of toolbar actions. iPad can place this after its leading navigation items.
struct PoracodeToolbarTitle<Content: View>: ToolbarContent {
  @ViewBuilder let content: () -> Content

  var body: some ToolbarContent {
    if #available(iOS 26.0, *) {
      ToolbarItem(placement: .title) { content() }
        .sharedBackgroundVisibility(.hidden)
    } else {
      ToolbarItem(placement: .principal) { content() }
    }
  }
}

/// A single native material surface for the phone composer. The caller owns
/// behavior while this component keeps leading and trailing actions aligned
/// with the editable field at one consistent touch height.
struct PoracodeComposerBar<Leading: View, Content: View, Trailing: View>: View {
  var leadingWidth: CGFloat = 40
  var trailingWidth: CGFloat = 40
  @ViewBuilder let leading: () -> Leading
  @ViewBuilder let content: () -> Content
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(alignment: .bottom, spacing: 6) {
      leading()
        .frame(width: leadingWidth, height: 40)
      content()
        .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
      trailing()
        .frame(width: trailingWidth, height: 40)
    }
    .padding(2)
    .poracodeNativeComposerSurface(in: Capsule(), borderOpacity: 0.1, borderWidth: 0.5, interactive: true)
  }
}

/// One persistent composer surface morphs between its collapsed and editing
/// geometries. Its 50pt resting height matches the floating panel control strips.
struct PoracodeAdaptiveComposerSurface<Content: View>: View {
  let isExpanded: Bool
  var leadingPadding: CGFloat = 16
  var trailingPadding: CGFloat = 8
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      .padding(.leading, leadingPadding)
      .padding(.trailing, trailingPadding)
      .padding(.vertical, isExpanded ? 10 : 3)
      .poracodeNativeComposerSurface(
        in: RoundedRectangle(cornerRadius: isExpanded ? 20 : 25, style: .continuous),
        interactive: !isExpanded
      )
  }
}

/// Two-row native composer surface used while editing. Its compact counterpart
/// is `PoracodeComposerBar`; keeping both geometries shared prevents each
/// feature from inventing its own bubble radius, border, and toolbar spacing.
struct PoracodeExpandedComposerSurface<Editor: View, Toolbar: View>: View {
  @ViewBuilder let editor: () -> Editor
  @ViewBuilder let toolbar: () -> Toolbar

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      editor()
      toolbar()
        .frame(minHeight: 34)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .poracodeNativeComposerSurface(in: shape, borderOpacity: 0.2, borderWidth: 0.75)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: 16, style: .continuous)
  }
}

extension View {
  /// Collapsed controls use Liquid Glass. Expanded text editors use standard
  /// material, keeping UIKit text and controls in the foreground instead of
  /// sending an empty background shape to a glass container above them.
  func poracodeNativeComposerSurface<S: InsettableShape>(
    in shape: S,
    borderOpacity: Double = 0.1,
    borderWidth: CGFloat = 0.5,
    interactive: Bool = false
  ) -> some View {
    modifier(PoracodeNativeComposerThemeSurface(shape: shape, borderOpacity: borderOpacity,
      borderWidth: borderWidth, interactive: interactive))
  }

  /// Native Liquid Glass for floating bubbles on iOS 26, with a material
  /// fallback for earlier systems. Interactive bubbles opt into the system's
  /// touch response; informational notices remain visually glass without
  /// pretending to be controls.
  @ViewBuilder
  func poracodeNativeBubbleSurface<S: InsettableShape>(
    in shape: S,
    interactive: Bool = false
  ) -> some View {
    if #available(iOS 26.0, *) {
      if interactive {
        glassEffect(.regular.interactive(), in: shape)
      } else {
        glassEffect(.regular, in: shape)
      }
    } else {
      background(.regularMaterial, in: shape)
        .overlay(shape.stroke(Color.primary.opacity(0.1), lineWidth: 0.5))
    }
  }
}

private struct PoracodeNativeComposerThemeSurface<S: InsettableShape>: ViewModifier {
  @Environment(\.poracodeTheme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  let shape: S
  let borderOpacity: Double
  let borderWidth: CGFloat
  let interactive: Bool

  private var authoredFill: Color? { theme.variant(for: colorScheme).composerHex.map { Color(poracodeHex: $0) } }

  @available(iOS 26.0, *) private var glass: Glass {
    if let authoredFill { return .regular.tint(authoredFill) }
    return .regular
  }

  @ViewBuilder func body(content: Content) -> some View {
    if #available(iOS 26.0, *), interactive {
      content.glassEffect(glass.interactive(), in: shape)
    } else {
      content.background(authoredFill.map(AnyShapeStyle.init) ?? AnyShapeStyle(.regularMaterial), in: shape)
        .overlay(shape.stroke(Color.primary.opacity(borderOpacity), lineWidth: borderWidth))
        .shadow(color: .black.opacity(0.18), radius: 12, y: 5)
    }
  }
}

/// Groups related compact information controls into one neutral pill instead
/// of presenting a detached glass circle for every secondary destination.
struct PoracodeCompactControlGroup<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @ScaledMetric(relativeTo: .caption2) private var surfaceHeight: CGFloat = 28

  var body: some View {
    HStack(spacing: 2) {
      content()
    }
    .padding(.horizontal, 2)
    .frame(height: surfaceHeight)
    .poracodeNativeBubbleSurface(in: Capsule(), interactive: true)
    .frame(minHeight: 44)
  }
}
