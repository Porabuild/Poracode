import Foundation

enum BrowserMirrorStrings {
  static let title = localized("browser-mirror.title", "Browser")
  static let newTab = localized("browser-mirror.new-tab", "New Tab")
  static let closeTab = localized("browser-mirror.close-tab", "Close Tab")
  static let address = localized("browser-mirror.address", "Address")
  static let go = localized("browser-mirror.go", "Go")
  static let back = localized("browser-mirror.back", "Back")
  static let forward = localized("browser-mirror.forward", "Forward")
  static let reload = localized("browser-mirror.reload", "Reload")
  static let loading = localized("browser-mirror.loading", "Loading browser…")
  static let unavailable = localized(
    "browser-mirror.unavailable",
    "Browser mirroring is unavailable."
  )
  static let retry = localized("browser-mirror.retry", "Try Again")
  static let untitledTab = localized("browser-mirror.untitled-tab", "Untitled Tab")
  static let focusInput = localized(
    "browser-mirror.focus-input",
    "Type in Browser"
  )
  static let moveBefore = localized("browser-mirror.move-before", "Move Left")
  static let moveAfter = localized("browser-mirror.move-after", "Move Right")
  static let browserContent = localized(
    "browser-mirror.browser-content",
    "Mirrored browser content"
  )

  static let dismiss = localized("browser-mirror.dismiss", "Done")
  static let tabs = localized("browser-mirror.tabs", "Tabs")
  static let stopMirroring = localized("browser-mirror.stop-mirroring", "Stop Mirroring")
  static let startMirroring = localized("browser-mirror.start-mirroring", "Start Mirroring")
  static let stopped = localized("browser-mirror.stopped", "Mirroring is stopped.")
  static let empty = localized("browser-mirror.empty", "No browser tabs are open.")
  static let awaitingFrame = localized(
    "browser-mirror.awaiting-frame",
    "Waiting for the first frame…"
  )
  static let ambiguous = localized(
    "browser-mirror.ambiguous",
    "The result of the last action is unknown. The browser state was refreshed instead of repeating it."
  )
  static let ambiguousUnresolved = localized(
    "browser-mirror.ambiguous-unresolved",
    "The result of the last action is unknown and could not be confirmed. Refresh before repeating it."
  )
  static let failed = localized("browser-mirror.failed", "The browser could not be reached.")
  static let offline = localized("browser-mirror.offline", "This host is offline.")
  static let notReady = localized("browser-mirror.not-ready", "This host is not ready yet.")
  static let background = localized(
    "browser-mirror.background",
    "Mirroring pauses while Poracode is in the background."
  )
  static let missingScope = localized(
    "browser-mirror.missing-scope",
    "This host has not granted browser access."
  )
  static let protocolIncompatible = localized(
    "browser-mirror.protocol-incompatible",
    "This host uses an unsupported protocol version."
  )
  static let refresh = localized("browser-mirror.refresh", "Refresh")
  static let viewportFit = localized("browser-mirror.viewport-fit", "Fit")
  static let viewportActual = localized("browser-mirror.viewport-actual", "Actual Size")
  static let viewport = localized("browser-mirror.viewport", "Viewport")
  static let privacy = localized(
    "browser-mirror.privacy",
    "Mirrored pages can show personal content. Frames stay on this device and are cleared when you leave this screen."
  )
  static let keyboardHint = localized(
    "browser-mirror.keyboard-hint",
    "Tap to type into the mirrored page."
  )
  static let viewportHint = localized(
    "browser-mirror.viewport-hint",
    "Tap to click, drag to scroll."
  )

  static func closeTabLabel(_ title: String) -> String {
    String(
      format: localized(
        "browser-mirror.close-tab-format",
        "Close tab: %@"
      ),
      title
    )
  }

  static func viewportSize(width: Int, height: Int) -> String {
    String(
      format: localized("browser-mirror.viewport-format", "Viewport %1$lld × %2$lld"),
      Int64(width),
      Int64(height)
    )
  }

  /// Failures are mapped to catalog copy. Raw status codes, server codes, and
  /// transport descriptions are never surfaced to the interface or to logs.
  static func failure(_ value: BrowserMirrorFailure) -> String {
    switch value {
    case .unavailable(.offline): offline
    case .unavailable(.notReady): notReady
    case .unavailable(.background): background
    case .protocolIncompatible: protocolIncompatible
    case .missingScope: missingScope
    case .ambiguousMutation: ambiguousUnresolved
    case .invalidRequest, .invalidResponse, .rejected, .transport: failed
    }
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(
      key,
      tableName: "BrowserMirror",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }
}
