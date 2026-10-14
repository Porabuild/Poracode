import Foundation

/// Localized string accessors for onboarding views.
/// Reuses existing HostStrings keys where semantics match;
/// creates dedicated `onboarding.*` keys for onboarding-specific text.
enum OnboardingStrings {

  // MARK: - Navigation titles

  static var navConnect: String {
    String(localized: "onboarding.nav.connect", defaultValue: "Connect")
  }

  static var navSessionExpired: String {
    String(localized: "onboarding.nav.sessionExpired", defaultValue: "Session expired")
  }

  static var navProtocolIncompatible: String {
    String(localized: "onboarding.nav.protocolIncompatible", defaultValue: "Incompatible server")
  }

  static var navRepairRequired: String {
    String(localized: "onboarding.nav.repairRequired", defaultValue: "Repair required")
  }

  // MARK: - Header titles

  // The default connect phase has no worded heading: it shows the `BrandWordmark`
  // lockup instead, which is the literal product name in every locale.

  static var headerSessionExpired: String {
    String(localized: "onboarding.header.sessionExpired", defaultValue: "Re-pair with Poracode")
  }

  static var headerUpdateRequired: String {
    String(localized: "onboarding.header.updateRequired", defaultValue: "Update required")
  }

  static var headerRepairRequired: String {
    String(localized: "onboarding.header.repairRequired", defaultValue: "Repair required")
  }

  // MARK: - Subtitles

  static var subtitleProtocolIncompatible: String {
    String(
      localized: "onboarding.subtitle.protocolIncompatible",
      defaultValue:
        "This app cannot talk to the paired desktop. Update Poracode on both devices to the same version, then Disconnect and re-pair."
    )
  }

  static var subtitleStoreInconsistent: String {
    String(
      localized: "onboarding.subtitle.storeInconsistent",
      defaultValue:
        "Stored credentials on this device are inconsistent or unreadable. Disconnect to clear them, then pair again."
    )
  }

  static var subtitleDefault: String {
    String(
      localized: "onboarding.subtitle.default",
      defaultValue: "Scan the pairing code shown in Remote Access on your desktop."
    )
  }

  // MARK: - Status banners

  static var bannerSessionExpired: String {
    String(
      localized: "onboarding.banner.sessionExpired",
      defaultValue:
        "Your remote session expired. Credentials are still on this device — re-pair with a new link, wait for automatic retry, or disconnect."
    )
  }

  static var bannerProtocolIncompatible: String {
    String(
      localized: "onboarding.banner.protocolIncompatible",
      defaultValue:
        "The paired desktop is running a different remote protocol. Credentials stay on this device until you disconnect or re-pair with a compatible server. Snapshot and live connection are paused."
    )
  }

  static var bannerStoreInconsistent: String {
    String(
      localized: "onboarding.banner.storeInconsistent",
      defaultValue:
        "Local credentials are inconsistent or unreadable. Stored material is left untouched until you Disconnect. Disconnect clears this device so you can pair again."
    )
  }

  // MARK: - Banner accessibility labels

  static var bannerSessionExpiredLabel: String {
    String(
      localized: "onboarding.banner.sessionExpired.label",
      defaultValue: "Session expired. Re-pair or disconnect.")
  }

  static var bannerProtocolIncompatibleLabel: String {
    String(
      localized: "onboarding.banner.protocolIncompatible.label",
      defaultValue: "Incompatible server protocol. Update both apps or disconnect.")
  }

  static var bannerStoreInconsistentLabel: String {
    String(
      localized: "onboarding.banner.storeInconsistent.label",
      defaultValue: "Local credentials inconsistent. Disconnect to clear, then pair again.")
  }

  // MARK: - Paired label

  static func pairedLabel(_ label: String) -> String {
    String(localized: "onboarding.pairedLabel", defaultValue: "Previously paired: \(label)")
  }

  // MARK: - Pending pairing card

  static var pendingReplaceTitle: String {
    String(localized: "onboarding.pending.replaceTitle", defaultValue: "Replace current pairing?")
  }

  static var pendingConfirmTitle: String {
    String(localized: "onboarding.pending.confirmTitle", defaultValue: "Confirm pairing")
  }

  static var pendingUnencryptedWarning: String {
    String(
      localized: "onboarding.pending.unencryptedWarning",
      defaultValue:
        "This endpoint uses plain HTTP on a local network address. Traffic is not encrypted."
    )
  }

  static var pendingReplacesHint: String {
    String(
      localized: "onboarding.pending.replacesHint",
      defaultValue: "Confirming will replace the current desktop session."
    )
  }

  static var pendingConnectAnyway: String {
    String(localized: "onboarding.pending.connectAnyway", defaultValue: "Connect anyway")
  }

  static var pendingCancel: String {
    String(localized: "hosts.cancel", defaultValue: "Cancel")
  }

  static var pendingConfirm: String {
    String(localized: "onboarding.pending.confirm", defaultValue: "Confirm")
  }

  static func pendingAccessibility(_ host: String) -> String {
    String(
      localized: "onboarding.pending.accessibility", defaultValue: "Pending pairing for \(host)")
  }

  // MARK: - Link section

  static var linkSectionTitle: String {
    String(localized: "onboarding.linkSection.title", defaultValue: "Pairing link")
  }

  static var linkSectionPlaceholder: String {
    String(localized: "onboarding.linkSection.placeholder", defaultValue: "https://…/#token=…")
  }

  // MARK: - Scan route

  static var scanAction: String {
    String(localized: "onboarding.scan.action", defaultValue: "Scan pairing code")
  }

  static var scanCaption: String {
    String(
      localized: "onboarding.scan.caption",
      defaultValue: "Open Settings → Remote Access on your desktop to show the code."
    )
  }

  static var scanAccessibility: String {
    String(
      localized: "onboarding.scan.accessibility",
      defaultValue: "Scan the desktop pairing code with the camera"
    )
  }

  static var scanHint: String {
    String(
      localized: "onboarding.scan.hint",
      defaultValue:
        "Point the camera at the pairing code in Settings → Remote Access on your desktop."
    )
  }

  static var scanPreparing: String {
    String(localized: "onboarding.scan.preparing", defaultValue: "Starting the camera…")
  }

  static var scanInvalidCode: String {
    String(
      localized: "onboarding.scan.invalid",
      defaultValue: "That is not a Poracode pairing code. Keep the Remote Access code in view."
    )
  }

  static var scanClose: String {
    String(localized: "onboarding.scan.close", defaultValue: "Close scanner")
  }

  static var scanDeniedTitle: String {
    String(localized: "onboarding.scan.denied.title", defaultValue: "Camera access is off")
  }

  static var scanDeniedMessage: String {
    String(
      localized: "onboarding.scan.denied.message",
      defaultValue:
        "Poracode needs the camera to read the pairing code. Turn it on in iOS Settings, or pair with a link instead."
    )
  }

  static var scanOpenSettings: String {
    String(localized: "onboarding.scan.denied.action", defaultValue: "Open iOS Settings")
  }

  static var scanNoCameraTitle: String {
    String(localized: "onboarding.scan.noCamera.title", defaultValue: "No camera available")
  }

  static var scanNoCameraMessage: String {
    String(
      localized: "onboarding.scan.noCamera.message",
      defaultValue:
        "This device has no camera Poracode can use — the iOS Simulator included. Paste a pairing link or enter the details manually."
    )
  }

  static var scanFailedTitle: String {
    String(localized: "onboarding.scan.failed.title", defaultValue: "Camera unavailable")
  }

  static var scanFailedMessage: String {
    String(
      localized: "onboarding.scan.failed.message",
      defaultValue:
        "The camera could not start. Close other apps that may be using it and try again, or pair with a link instead."
    )
  }

  static var scanRetry: String {
    String(localized: "onboarding.scan.retry", defaultValue: "Try again")
  }

  static var scanUsePairingLink: String {
    String(localized: "onboarding.scan.fallback.link", defaultValue: "Paste a pairing link")
  }

  static var scanPhoto: String {
    String(localized: "onboarding.scan.photo.action", defaultValue: "Choose a photo")
  }

  static var scanPhotoReading: String {
    String(localized: "onboarding.scan.photo.reading", defaultValue: "Reading photo…")
  }

  static var scanPhotoNoCode: String {
    String(
      localized: "onboarding.scan.photo.noCode",
      defaultValue: "No QR code was found in that photo."
    )
  }

  static var scanPhotoInvalid: String {
    String(
      localized: "onboarding.scan.photo.invalid",
      defaultValue: "That photo does not contain a Poracode pairing code."
    )
  }

  // MARK: - Manual connection

  static var manualTitle: String {
    String(localized: "onboarding.manual.title", defaultValue: "Manual connection")
  }

  static var manualDisclosure: String {
    String(localized: "onboarding.manual.disclosure", defaultValue: "Enter details manually")
  }

  /// Label of the single expander holding every non-QR route.
  static var otherWays: String {
    String(localized: "onboarding.otherWays", defaultValue: "Other ways to connect")
  }

  // MARK: - Cleartext

  static var cleartextHint: String {
    String(
      localized: "onboarding.cleartext.hint",
      defaultValue:
        "This endpoint uses plain HTTP on a local network address. Prefer HTTPS or Tailscale when possible. iOS allows local-network cleartext via NSAllowsLocalNetworking only."
    )
  }

  // MARK: - Connect button

  static var connectRepair: String {
    String(localized: "onboarding.connect.repair", defaultValue: "Re-pair")
  }

  static var connectAccessibilityDefault: String {
    String(
      localized: "onboarding.connect.accessibility.default",
      defaultValue: "Connect to Poracode server")
  }

  static var connectAccessibilitySessionExpired: String {
    String(
      localized: "onboarding.connect.accessibility.sessionExpired",
      defaultValue: "Re-pair with Poracode server")
  }

  static var connectAccessibilityProtocolIncompatible: String {
    String(
      localized: "onboarding.connect.accessibility.protocolIncompatible",
      defaultValue: "Re-pair with a compatible Poracode server"
    )
  }

  // MARK: - Disconnect button

  static var disconnectDefault: String {
    String(localized: "onboarding.disconnect.default", defaultValue: "Disconnect")
  }

  static var disconnectForget: String {
    String(localized: "onboarding.disconnect.forget", defaultValue: "Disconnect and forget")
  }

  static var disconnectAccessibilityDefault: String {
    String(
      localized: "onboarding.disconnect.accessibility.default",
      defaultValue: "Disconnect and remove credentials")
  }

  static var disconnectAccessibilityStoreInconsistent: String {
    String(
      localized: "onboarding.disconnect.accessibility.storeInconsistent",
      defaultValue: "Disconnect and clear inconsistent local credentials"
    )
  }

  static var disconnectAccessibilityProtocolIncompatible: String {
    String(
      localized: "onboarding.disconnect.accessibility.protocolIncompatible",
      defaultValue: "Disconnect and clear stored session credentials"
    )
  }

  // MARK: - Error

  static func errorAccessibility(_ error: String) -> String {
    String(localized: "onboarding.error.accessibility", defaultValue: "Error: \(error)")
  }
}
