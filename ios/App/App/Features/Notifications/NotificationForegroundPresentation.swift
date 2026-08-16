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
    selectedConnectionId: ClientConnectionID?
  ) -> UNNotificationPresentationOptions {
    guard hasRoutingEnvelope else { return [.banner, .list, .sound] }
    guard let route, route.clientConnectionId == selectedConnectionId else { return [] }
    return [.banner, .list, .sound]
  }
}
