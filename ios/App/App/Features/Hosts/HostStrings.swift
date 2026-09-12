import Foundation

/// Native String Catalog accessors. Never interpolate secrets.
enum HostStrings {
  static var switcherTitle: String {
    String(localized: "hosts.switcher.title", defaultValue: "Connections")
  }

  static var switcherAccessibility: String {
    String(localized: "hosts.switcher.accessibility", defaultValue: "Switch desktop")
  }

  static var addHost: String {
    String(localized: "hosts.add.title", defaultValue: "Add connection")
  }

  static var addHostAccessibility: String {
    String(localized: "hosts.add.accessibility", defaultValue: "Add another Poracode desktop")
  }

  static var removeHost: String {
    String(localized: "hosts.remove.title", defaultValue: "Remove connection")
  }

  static var renamePrompt: String {
    String(localized: "hosts.rename.prompt", defaultValue: "Connection name")
  }

  static func removeConfirmTitle(_ label: String) -> String {
    String(
      localized: "hosts.remove.confirm.title",
      defaultValue: "Remove \(label)?"
    )
  }

  static var removeConfirmMessage: String {
    String(
      localized: "hosts.remove.confirm.message",
      defaultValue:
        "This device will forget the desktop and delete its stored credentials. You can pair again later."
    )
  }

  static var removeConfirmAction: String {
    String(localized: "hosts.remove.confirm.action", defaultValue: "Remove")
  }

  static var cancel: String {
    String(localized: "hosts.cancel", defaultValue: "Cancel")
  }

  static var selectedBadge: String {
    String(localized: "hosts.status.selected", defaultValue: "Selected")
  }

  static var secondaryBadge: String {
    String(localized: "hosts.status.secondary", defaultValue: "Kept ready")
  }

  static var statusOnline: String {
    String(localized: "hosts.status.online", defaultValue: "Online")
  }

  static var statusConnecting: String {
    String(localized: "hosts.status.connecting", defaultValue: "Connecting")
  }

  static var statusOffline: String {
    String(localized: "hosts.status.offline", defaultValue: "Offline")
  }

  static var emptyTitle: String {
    String(localized: "hosts.empty.title", defaultValue: "No connections yet")
  }

  static var emptyDescription: String {
    String(
      localized: "hosts.empty.description",
      defaultValue: "Pair a Poracode desktop to start a remote session."
    )
  }

  static func hostAccessibility(label: String, selected: Bool) -> String {
    if selected {
      return String(
        localized: "hosts.row.accessibility.selected",
        defaultValue: "\(label), selected connection"
      )
    }
    return String(
      localized: "hosts.row.accessibility",
      defaultValue: "\(label), connection"
    )
  }

  static var orSeparator: String {
    String(localized: "hosts.add.or", defaultValue: "or")
  }

  static var switchAction: String {
    String(localized: "hosts.switch.action", defaultValue: "Switch")
  }

  static var currentHost: String {
    String(localized: "hosts.current", defaultValue: "Current connection")
  }

  static var pairingLink: String {
    String(localized: "hosts.add.pairingLink", defaultValue: "Pairing link")
  }

  static var pairingLinkPlaceholder: String {
    String(
      localized: "onboarding.linkSection.placeholder",
      defaultValue: "https://…/#token=…"
    )
  }

  static var serverURL: String {
    String(localized: "hosts.add.serverURL", defaultValue: "Server base URL")
  }

  static var oneTimeToken: String {
    String(localized: "hosts.add.token", defaultValue: "One-time pairing token")
  }

  static var connect: String {
    String(localized: "hosts.add.connect", defaultValue: "Pair")
  }

  static var addSubtitle: String {
    String(
      localized: "hosts.add.subtitle",
      defaultValue:
        "Paste a pairing link or enter the server URL and a one-time token. Tokens are never shown after you connect."
    )
  }

  static var cleartextHint: String {
    String(
      localized: "hosts.add.cleartext.hint",
      defaultValue: "This server uses HTTP. Continue only on a trusted network."
    )
  }

  /// Host part of the endpoint URL, mirroring the mobile web connection row.
  static func endpointCaption(_ baseURL: String) -> String {
    URL(string: baseURL).flatMap(\.host).flatMap { $0.isEmpty ? nil : $0 } ?? baseURL
  }
}
