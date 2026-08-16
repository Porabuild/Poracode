import Foundation

enum PortForwardingStrings {
  static let title = localized("port-forwarding.title", "Ports")
  static let intro = localized(
    "port-forwarding.intro",
    "Dev servers listening on your desktop's localhost.")
  static let scan = localized("port-forwarding.scan", "Scan Ports")
  static let scanning = localized("port-forwarding.scanning", "Scanning…")
  static let detected = localized("port-forwarding.detected", "Detected")
  static let active = localized("port-forwarding.active", "Active forwards")
  static let empty = localized("port-forwarding.empty", "No dev servers detected")
  static let emptyHint = localized(
    "port-forwarding.empty.hint",
    "Start a dev server on your desktop, then tap refresh.")
  static let noDesktop = localized("port-forwarding.no-desktop", "No desktop connection")
  static let noDesktopHint = localized(
    "port-forwarding.no-desktop.hint",
    "Pair a desktop from Connections to forward its ports.")
  static let notEnabled = localized("port-forwarding.not-enabled", "Port forwarding isn't enabled")
  static let notEnabledHint = localized(
    "port-forwarding.not-enabled.hint",
    "Re-pair this connection to grant access to port forwarding.")
  static let loadFailed = localized("port-forwarding.load-failed", "Can't load ports")
  static let looking = localized("port-forwarding.looking", "Looking for dev servers…")
  static let start = localized("port-forwarding.start", "Start")
  static let open = localized("port-forwarding.open", "Open")
  static let stop = localized("port-forwarding.stop", "Stop")
  static let openInBrowser = localized("port-forwarding.open-in-browser", "Open in browser")
  static let copyURL = localized("port-forwarding.copy-url", "Copy URL")
  static let stopForwarding = localized("port-forwarding.stop-forwarding", "Stop forwarding")
  static let copied = localized("port-forwarding.copied", "Copied")
  static let actions = localized("port-forwarding.actions", "Actions")
  static let manualForward = localized("port-forwarding.manual-forward", "Forward a port")
  static let manualForwardHint = localized(
    "port-forwarding.manual-forward.hint",
    "Enter the port a dev server on your desktop is listening on.")
  static let portField = localized("port-forwarding.port-field", "Port")
  static let forward = localized("port-forwarding.forward", "Forward")
  static let loading = localized("port-forwarding.loading", "Loading port forwarding.")
  static let forwarded = localized("port-forwarding.forwarded", "Forwarded")
  static let unknownService = localized("port-forwarding.unknown-service", "Unknown service")
  static let webServer = localized("port-forwarding.web-server", "Web server")
  static let retry = localized("port-forwarding.retry", "Retry")
  static let close = localized("port-forwarding.close", "Close")
  static let unavailable = localized(
    "port-forwarding.unavailable", "Port forwarding is unavailable.")
  static let ambiguous = localized(
    "port-forwarding.ambiguous",
    "The result is uncertain. Scan again before repeating the action.")
  static let unsafeEntry = localized(
    "port-forwarding.unsafe-entry", "The host returned an unsafe browser address.")
  static let browserUnavailable = localized(
    "port-forwarding.browser-unavailable", "The browser could not open this forward.")

  static func port(_ value: Int) -> String {
    String(format: localized("port-forwarding.port-format", "Port %lld"), Int64(value))
  }

  static func localhost(_ value: Int) -> String {
    String(
      format: localized("port-forwarding.localhost-format", "localhost:%lld"), Int64(value))
  }

  static func onDesktop(_ value: Int) -> String {
    String(
      format: localized("port-forwarding.on-desktop-format", "localhost:%lld on desktop"),
      Int64(value))
  }

  static func forwardingValue(target: Int, listener: Int) -> String {
    String(
      format: localized("port-forwarding.forward-format", "Port %1$lld → %2$lld"),
      Int64(target), Int64(listener))
  }

  static func failure(_ value: PortForwardingFailure) -> String {
    switch value {
    case .ambiguousMutation: ambiguous
    case .unsafeEntry: unsafeEntry
    case .browserUnavailable: browserUnavailable
    default: unavailable
    }
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key,
      tableName: "PortForwarding",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }
}
