import SwiftUI

extension Color {
  /// Pora indigo (`#8B7BFF`) — the one chromatic brand accent, per
  /// `branding/BRAND.md` §6. Used for the wordmark dot and brand highlights.
  static let poracodeIndigo = Color(red: 0.545, green: 0.486, blue: 1.0)
}

/// The `Pora·code` brand wordmark: "Pora" in bold, the indigo baseline dot, then
/// "code" in semibold (`branding/BRAND.md` §5). Mirrors the web mark in
/// `src/renderer/components/common/BrandWordmark.tsx`.
///
/// Two details the brand guide is strict about:
///
/// - **The dot is a drawn `Circle`, never a typed period.** The Pora dot is a
///   true round circle, and geometric sans faces (Geist, and SF at small optical
///   sizes) draw "." as a square — a typed period would be the wrong mark.
/// - **It sits at the baseline**, not centered. Positioning comes from
///   `firstTextBaseline` alignment rather than a fixed offset, and the dot's
///   diameter, side gaps, and baseline overshoot are `@ScaledMetric` fractions of
///   the text style's own point size (the same em ratios the web SVG uses). So
///   the lockup holds its proportions and stays aligned at every Dynamic Type
///   size, accessibility sizes included.
///
/// To assistive tech this is a single word: "Poracode" — the written product
/// name. The dot is a logo device and is not spoken.
struct BrandWordmark: View {
  private let textStyle: Font.TextStyle
  private let dotColor: Color

  // Ratios of the font's point size. Dot diameter and baseline overshoot match the
  // web mark's SVG geometry (0.18em wide, sunk 0.05em below the baseline). The side
  // gaps are tightened from the web's 0.13/0.06: SF carries more side bearing than
  // Geist, so the web values read as a word space before the dot and as a collision
  // after it. These are the values that reproduce the web mark's *apparent* spacing.
  @ScaledMetric private var dotDiameter: CGFloat
  @ScaledMetric private var gapBeforeDot: CGFloat
  @ScaledMetric private var gapAfterDot: CGFloat
  @ScaledMetric private var baselineOvershoot: CGFloat

  init(textStyle: Font.TextStyle = .title2, dotColor: Color = .poracodeIndigo) {
    self.textStyle = textStyle
    self.dotColor = dotColor
    let size = Self.nominalPointSize(for: textStyle)
    _dotDiameter = ScaledMetric(wrappedValue: size * 0.18, relativeTo: textStyle)
    _gapBeforeDot = ScaledMetric(wrappedValue: size * 0.07, relativeTo: textStyle)
    _gapAfterDot = ScaledMetric(wrappedValue: size * 0.05, relativeTo: textStyle)
    _baselineOvershoot = ScaledMetric(wrappedValue: size * 0.05, relativeTo: textStyle)
  }

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      Text(verbatim: "Pora")
        .font(.system(textStyle, weight: .bold))
      dot
      Text(verbatim: "code")
        .font(.system(textStyle, weight: .semibold))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "Poracode"))
  }

  private var dot: some View {
    // Capture the actor-isolated scaled metric before entering SwiftUI's
    // Sendable alignment closure (Swift 6 diagnoses direct property access).
    let overshoot = baselineOvershoot
    return Circle()
      .fill(dotColor)
      .frame(width: dotDiameter, height: dotDiameter)
      .padding(.leading, gapBeforeDot)
      .padding(.trailing, gapAfterDot)
      // Align a point just above the circle's bottom edge with the text
      // baseline, so the round dot overshoots it the way round glyphs do.
      .alignmentGuide(.firstTextBaseline) { $0[.bottom] - overshoot }
  }

  /// Default point size of a text style at the `.large` content size, used as the
  /// base the `@ScaledMetric` ratios scale from.
  private static func nominalPointSize(for style: Font.TextStyle) -> CGFloat {
    switch style {
    case .largeTitle: return 34
    case .title: return 28
    case .title2: return 22
    case .title3: return 20
    case .headline, .body: return 17
    case .callout: return 16
    case .subheadline: return 15
    case .footnote: return 13
    case .caption: return 12
    case .caption2: return 11
    default: return 17
    }
  }
}

/// In-app continuation of the platform launch screen while durable session state
/// is being read. Network reconnects never remain here: once a stored profile is
/// known, the root presents Home and lets recovery continue behind it.
struct BrandLaunchView: View {
  var body: some View {
    ZStack {
      Color(.systemBackground)
        .ignoresSafeArea()
      BrandWordmark(textStyle: .largeTitle)
    }
  }
}

#Preview("Brand wordmark") {
  VStack(alignment: .leading, spacing: 20) {
    BrandWordmark(textStyle: .largeTitle)
    BrandWordmark(textStyle: .title)
    BrandWordmark()
    BrandWordmark(textStyle: .body)
    BrandWordmark(textStyle: .footnote)
  }
  .padding()
}
