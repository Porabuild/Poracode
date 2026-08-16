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
  let pending: PendingPairingState
  let onCancel: () -> Void
  let onConfirm: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Label {
        VStack(alignment: .leading, spacing: 4) {
          Text(
            pending.replacesExistingPair
              ? OnboardingStrings.pendingReplaceTitle
              : OnboardingStrings.pendingConfirmTitle
          )
          .font(.headline)
          Text(pending.sanitizedDescription)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
          if pending.isCleartextLan {
            Text(OnboardingStrings.pendingUnencryptedWarning)
              .font(.footnote)
              .foregroundStyle(.orange)
              .fixedSize(horizontal: false, vertical: true)
          }
          if pending.replacesExistingPair {
            Text(OnboardingStrings.pendingReplacesHint)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      } icon: {
        Image(systemName: "link.badge.plus")
          .foregroundStyle(OnboardingBrand.violet)
      }
      HStack(spacing: 10) {
        Button(OnboardingStrings.pendingCancel, action: onCancel)
          .buttonStyle(.bordered)
        Button(
          pending.isCleartextLan
            ? OnboardingStrings.pendingConnectAnyway
            : OnboardingStrings.pendingConfirm,
          action: onConfirm
        )
        .buttonStyle(.borderedProminent)
        .tint(pending.isCleartextLan ? .orange : .accentColor)
        .accessibilityIdentifier("native-e2e.pair.confirm")
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .strokeBorder(
          pending.isCleartextLan ? Color.orange.opacity(0.45) : OnboardingBrand.violet.opacity(0.4),
          lineWidth: 1
        )
    }
    .accessibilityLabel(OnboardingStrings.pendingAccessibility(pending.hostDisplay))
  }
}
