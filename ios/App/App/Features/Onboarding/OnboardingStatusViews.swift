import SwiftUI

/// Repair-state banner on the pairing screen. Presentation only: the phase that
/// decides whether a banner shows stays owned by `OnboardingView`/`AppSession`.
struct OnboardingStatusBanner: View {
  let systemImage: String
  let tint: Color
  let message: String
  let accessibilityText: String

  var body: some View {
    Label {
      Text(message)
        .font(.footnote)
        .fixedSize(horizontal: false, vertical: true)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(tint)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(tint.opacity(0.28), lineWidth: 1)
    }
    .accessibilityLabel(accessibilityText)
  }
}

/// Explicit consent gate for a deep-linked pairing. Confirm and Cancel both stay
/// user-driven — nothing here pairs on its own.
struct OnboardingPendingPairingCard: View {
  let pending: RemotePairingPending
  var isCompactHeight = false
  let onCancel: () -> Void
  let onConfirm: () -> Void

  @Environment(\.colorScheme) private var colorScheme
  @ScaledMetric(relativeTo: .title) private var tileSize: CGFloat = 46

  private var accentTint: Color {
    pending.isCleartextLan ? .orange : OnboardingBrand.violet
  }

  private var resolvedTileSize: CGFloat {
    isCompactHeight ? min(tileSize, 38) : tileSize
  }

  private var cardShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: isCompactHeight ? 18 : 22, style: .continuous)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: isCompactHeight ? 12 : 16) {
      HStack(alignment: .center, spacing: isCompactHeight ? 12 : 14) {
        iconTile
        VStack(alignment: .leading, spacing: 3) {
          Text(
            pending.replacesExistingPair
              ? OnboardingStrings.pendingReplaceTitle
              : OnboardingStrings.pendingConfirmTitle
          )
          .font(.headline)
          .foregroundStyle(colorScheme == .dark ? .white : .primary)
          Text(pending.sanitizedDescription)
            .font(.subheadline.monospaced())
            .foregroundStyle(colorScheme == .dark ? Color.white.opacity(0.68) : .secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }

      if pending.isCleartextLan || pending.replacesExistingPair {
        VStack(alignment: .leading, spacing: 6) {
          if pending.isCleartextLan {
            Label(OnboardingStrings.pendingUnencryptedWarning, systemImage: "exclamationmark.triangle.fill")
              .font(.footnote)
              .foregroundStyle(.orange)
              .fixedSize(horizontal: false, vertical: true)
          }
          if pending.replacesExistingPair {
            Text(OnboardingStrings.pendingReplacesHint)
              .font(.footnote)
              .foregroundStyle(colorScheme == .dark ? Color.white.opacity(0.6) : .secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }

      HStack(spacing: 10) {
        Button(action: onCancel) {
          Text(OnboardingStrings.pendingCancel)
            .fontWeight(.medium)
            .frame(maxWidth: .infinity)
        }
        .poracodeSurfaceButtonStyle()
        .controlSize(isCompactHeight ? .regular : .large)

        Button(action: onConfirm) {
          Text(
            pending.isCleartextLan
              ? OnboardingStrings.pendingConnectAnyway
              : OnboardingStrings.pendingConfirm
          )
          .fontWeight(.semibold)
          .frame(maxWidth: .infinity)
        }
        .poracodeProminentButtonStyle(tint: accentTint)
        .controlSize(isCompactHeight ? .regular : .large)
        .accessibilityIdentifier("native-e2e.pair.confirm")
      }
    }
    .padding(isCompactHeight ? 14 : 16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background { cardSurface }
    .overlay {
      cardShape.strokeBorder(
        accentTint.opacity(colorScheme == .dark ? 0.42 : 0.35),
        lineWidth: 1
      )
    }
    .accessibilityElement(children: .contain)
  }

  private var iconTile: some View {
    ZStack {
      RoundedRectangle(cornerRadius: resolvedTileSize * 0.24, style: .continuous)
        .fill(accentTint.opacity(0.15))
      Image(systemName: "link.badge.plus")
        .font(.system(size: resolvedTileSize * 0.44, weight: .semibold))
        .foregroundStyle(accentTint)
    }
    .frame(width: resolvedTileSize, height: resolvedTileSize)
  }

  @ViewBuilder
  private var cardSurface: some View {
    if colorScheme == .dark {
      cardShape
        .fill(Color.white.opacity(0.075))
        .background {
          cardShape.fill(.ultraThinMaterial)
            .opacity(0.45)
        }
    } else {
      Color.clear.poracodeGlassBackground(in: cardShape)
    }
  }
}
