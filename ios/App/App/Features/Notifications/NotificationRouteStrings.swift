import Foundation

/// Native String Catalog accessors for the cross-host notification
/// confirmation. Only the safe host display label is ever interpolated —
/// never endpoints, tokens, or raw identifiers.
enum NotificationRouteStrings {
  static func hostSwitchTitle(_ hostLabel: String) -> String {
    String(localized: "notifications.hostSwitch.title", defaultValue: "Switch to \(hostLabel)?")
  }

  static var hostSwitchFallbackTitle: String {
    String(localized: "notifications.hostSwitch.fallbackTitle", defaultValue: "Switch desktop?")
  }

  static var hostSwitchMessage: String {
    String(
      localized: "notifications.hostSwitch.message",
      defaultValue:
        "This notification belongs to a different desktop. Switch to open the thread there."
    )
  }

  static var hostSwitchConfirm: String {
    String(localized: "notifications.hostSwitch.confirm", defaultValue: "Switch and Open")
  }

  static var hostSwitchCancel: String {
    String(localized: "notifications.hostSwitch.cancel", defaultValue: "Cancel")
  }
}
