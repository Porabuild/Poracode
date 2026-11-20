import SwiftUI

/// Input identity for the onboarding pairing fields.
enum OnboardingField: Hashable {
  case link, base, token
}

/// Accents taken from the app icon (off-white mark on near-black, violet dot).
/// Used sparingly — the hero glow, the scan tile, the scanner brackets — so the
/// rest of the screen keeps the app's system accent and glass language.
enum OnboardingBrand {
  /// Same indigo as the brand wordmark dot — one definition, in `BrandWordmark`.
  static let violet = Color.poracodeIndigo
  static let indigo = Color(red: 0.365, green: 0.298, blue: 0.925)

  static var tile: LinearGradient {
    LinearGradient(colors: [violet, indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
  }

  static var hairline: LinearGradient {
    LinearGradient(
      colors: [violet.opacity(0.55), indigo.opacity(0.16)],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

/// What the hero puts in its title slot.
///
/// The normal connect phase shows the brand wordmark — there is nothing wrong to
/// report, so the lockup can carry the screen. Every recovery phase keeps an
/// explicit worded heading instead: "Update required" or "Repair required" is the
/// one line telling the user what broke, and a logo cannot say that.
enum OnboardingHeroTitle {
  case wordmark
  case text(String)
}

/// Branded hero: app mark, phase title, and the one-line explanation.
struct OnboardingHeroView: View {
  let title: OnboardingHeroTitle
  let subtitle: String
  let pairedLabel: String?
  var isCompactHeight = false

  @ScaledMetric(relativeTo: .largeTitle) private var markSize: CGFloat = 76

  var body: some View {
    VStack(spacing: isCompactHeight ? 6 : 10) {
      OnboardingAnimatedBrandMark(size: isCompactHeight ? min(markSize, 46) : markSize)
      VStack(spacing: isCompactHeight ? 4 : 10) {
        titleView
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.white.opacity(0.58))
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: isCompactHeight ? 380 : 310)
        if let pairedLabel {
          Text(pairedLabel)
            .font(.footnote)
            .foregroundStyle(.white.opacity(0.42))
            .multilineTextAlignment(.center)
        }
      }
    }
    .frame(maxWidth: .infinity)
    .foregroundStyle(.white)
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var titleView: some View {
    switch title {
    case .wordmark:
      // A step up from the worded headings: the wordmark is a lockup, not a
      // sentence, and this matches the web pairing screen's brand size.
      BrandWordmark(textStyle: isCompactHeight ? .title3 : .title2)
    case .text(let value):
      Text(value)
        .font((isCompactHeight ? Font.title3 : Font.title2).weight(.semibold))
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
    }
  }
}

/// Primary pairing route: a large tappable target that opens the code scanner.
struct OnboardingScanCard: View {
  var isCompactHeight = false
  let action: () -> Void

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .title) private var tileSize: CGFloat = 54

  private var resolvedTileSize: CGFloat {
    isCompactHeight ? min(tileSize, 42) : tileSize
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: isCompactHeight ? 18 : 22, style: .continuous)
  }

  var body: some View {
    Button(action: action) {
      Group {
        if dynamicTypeSize.isAccessibilitySize {
          // Accessibility sizes need the full width for text, so stack instead.
          VStack(alignment: .leading, spacing: 12) {
            tile
            copy
          }
        } else {
          HStack(spacing: isCompactHeight ? 12 : 16) {
            tile
            copy
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .font(.footnote.weight(.bold))
              .foregroundStyle(.tertiary)
          }
        }
      }
      .padding(isCompactHeight ? 12 : 16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(shape)
    }
    .buttonStyle(.plain)
    .background(Color.white.opacity(0.055), in: shape)
    .overlay {
      shape.strokeBorder(Color.white.opacity(0.11), lineWidth: 1)
    }
    .accessibilityLabel(OnboardingStrings.scanAccessibility)
    .accessibilityIdentifier("native-e2e.pair.scan")
  }

  private var tile: some View {
    ZStack {
      RoundedRectangle(cornerRadius: resolvedTileSize * 0.22, style: .continuous)
        .fill(OnboardingBrand.violet.opacity(0.13))
      Image(systemName: "qrcode.viewfinder")
        .font(.system(size: resolvedTileSize * 0.52, weight: .semibold))
        .foregroundStyle(OnboardingBrand.violet)
    }
    .frame(width: resolvedTileSize, height: resolvedTileSize)
  }

  private var copy: some View {
    VStack(alignment: .leading, spacing: isCompactHeight ? 2 : 4) {
      Text(OnboardingStrings.scanAction)
        .font(.headline)
        .foregroundStyle(.white)
      Text(OnboardingStrings.scanCaption)
        .font(.footnote)
        .foregroundStyle(.white.opacity(0.54))
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

/// Opens the secondary pairing routes in the native bottom sheet.
struct OnboardingOtherWaysButton: View {
  var isCompactHeight = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Image(systemName: "ellipsis")
          .font(.caption.weight(.semibold))
        Text(OnboardingStrings.otherWays)
          .font(.subheadline.weight(.medium))
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
      }
      .padding(.horizontal, 16)
      .foregroundStyle(.white.opacity(0.56))
      .frame(maxWidth: .infinity, minHeight: isCompactHeight ? 38 : 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(OnboardingStrings.otherWays)
    .accessibilityIdentifier("native-e2e.pair.manual")
  }
}

/// Paste-link and manual-entry routes shown inside the native bottom sheet.
struct OnboardingOtherWaysForm: View {
  @Binding var pairingLink: String
  @Binding var baseURL: String
  @Binding var token: String
  @FocusState.Binding var focusedField: OnboardingField?
  let showsCleartextHint: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      pairingLinkSection
      OnboardingRouteDivider()
      manualSection
      if showsCleartextHint {
        cleartextHint
      }
    }
    .frame(maxWidth: .infinity)
  }

  private var pairingLinkSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Label(OnboardingStrings.linkSectionTitle, systemImage: "link")
          .font(.subheadline.weight(.semibold))
        Spacer(minLength: 0)
        PasteButton(payloadType: String.self) { payload in
          guard
            let value = payload.first?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
          else { return }
          pairingLink = value
        }
        .labelStyle(.iconOnly)
        .buttonBorderShape(.capsule)
        .tint(.secondary)
      }
      TextField(OnboardingStrings.linkSectionPlaceholder, text: $pairingLink, axis: .vertical)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
        .font(.callout)
        .lineLimit(2...4)
        .padding(12)
        .poracodeInputSurface()
        .focused($focusedField, equals: .link)
        .accessibilityLabel(HostStrings.pairingLink)
        .accessibilityIdentifier("native-e2e.pairing-link")
    }
  }

  private var manualSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(OnboardingStrings.manualTitle, systemImage: "slider.horizontal.3")
        .font(.subheadline.weight(.semibold))
      TextField(HostStrings.serverURL, text: $baseURL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
        .padding(12)
        .poracodeInputSurface()
        .focused($focusedField, equals: .base)
        .accessibilityLabel(HostStrings.serverURL)
        .accessibilityIdentifier("native-e2e.pair.base-url")
      SecureField(HostStrings.oneTimeToken, text: $token)
        .textContentType(.oneTimeCode)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .poracodeInputSurface()
        .focused($focusedField, equals: .token)
        .contentShape(.rect)
        .simultaneousGesture(TapGesture().onEnded { focusedField = .token })
        .accessibilityLabel(HostStrings.oneTimeToken)
        .accessibilityIdentifier("native-e2e.pair.token")
    }
  }

  private var cleartextHint: some View {
    Label {
      Text(OnboardingStrings.cleartextHint)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    } icon: {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(.orange)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityLabel(OnboardingStrings.cleartextHint)
  }
}

/// "or" rule between the paste and manual routes.
struct OnboardingRouteDivider: View {
  var body: some View {
    HStack(spacing: 12) {
      Rectangle().frame(height: 1).foregroundStyle(.quaternary)
      Text(HostStrings.orSeparator)
        .font(.caption)
        .foregroundStyle(.secondary)
      Rectangle().frame(height: 1).foregroundStyle(.quaternary)
    }
    .accessibilityHidden(true)
  }
}
