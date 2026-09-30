import SwiftUI
import UIKit
import UserNotifications

/// Foreground presentation policy for notifications.
///
/// The producer contract guarantees every APNs alert is generic (fixed
/// title/body), so legacy (unrouted) payloads keep presenting as before. Routed
/// payloads present only when their `clientConnectionId` is the currently
/// selected host, so a host-A notification can never appear over host-B. A
/// routed envelope that fails to parse cannot be host-verified and is
/// suppressed.
enum NotificationForegroundPresentation {
  static func options(
    route: NotificationRoute?,
    hasRoutingEnvelope: Bool,
    selectedConnectionId: ClientConnectionID?,
    preference: NotificationAlertPreference = .current()
  ) -> UNNotificationPresentationOptions {
    guard preference.foregroundMode == .always else { return [] }
    let presented: UNNotificationPresentationOptions =
      preference.soundEnabled
      ? [.banner, .list, .sound]
      : [.banner, .list]
    guard hasRoutingEnvelope else { return presented }
    guard let route, route.clientConnectionId == selectedConnectionId else { return [] }
    return presented
  }
}

/// Scene-phase → session-backgrounded policy for the notification surface.
///
/// Only a true `.background` ends the foreground session. The cross-host
/// confirmation contract is "backgrounding is a cancellation"
/// (`NotificationRouteController.setForeground`), and a transient `.inactive`
/// (Notification Center / Control Center pull, app-switcher peek, call
/// banner) does not mean backgrounded — wiring the predicate as
/// `phase == .active` tears down a visible confirmation on any overlay.
enum NotificationForegroundPolicy {
  static func isSessionBackgrounded(_ phase: ScenePhase) -> Bool {
    phase == .background
  }
}
