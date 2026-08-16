import Foundation
import UserNotifications

@MainActor
final class NotificationIngress {
  static let shared = NotificationIngress()

  let routes: NotificationRouteController
  let registrations: PushRegistrationController
  let liveActivities: LiveActivityTokenController

  init(
    routes: NotificationRouteController = .shared,
    registrations: PushRegistrationController = .shared,
    liveActivities: LiveActivityTokenController? = nil
  ) {
    self.routes = routes
    self.registrations = registrations
    self.liveActivities =
      liveActivities ?? LiveActivityTokenController(registrations: registrations)
  }

  func attach(session: AppSession) {
    routes.attach(session: session)
    liveActivities.start()
  }

  func receiveNotificationResponse(userInfo: [AnyHashable: Any]) {
    routes.submit(userInfo: userInfo)
  }

  /// Foreground presentation decision for an incoming notification. Routed
  /// notifications present only for the currently selected host.
  func foregroundPresentationOptions(
    for userInfo: [AnyHashable: Any]
  ) -> UNNotificationPresentationOptions {
    NotificationForegroundPresentation.options(
      route: NotificationPayloadParser.parse(userInfo: userInfo),
      hasRoutingEnvelope: NotificationPayloadParser.hasRoutingEnvelope(userInfo: userInfo),
      selectedConnectionId: routes.selectedConnectionId
    )
  }

  func receiveURL(_ url: URL) -> Bool {
    routes.submit(url: url)
  }

  func receiveAPNSToken(_ token: Data) {
    Task { await registrations.receiveAPNSToken(token) }
  }

  func setForeground(_ foreground: Bool) {
    routes.setForeground(foreground)
    Task { await registrations.setForeground(foreground) }
  }
}
