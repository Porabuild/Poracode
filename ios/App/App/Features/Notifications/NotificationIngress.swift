import Foundation
import UserNotifications

@MainActor
final class NotificationIngress {
  static let shared = NotificationIngress()

  let routes: NotificationRouteController
  let registrations: PushRegistrationController
  let liveActivities: LiveActivityTokenController
  let remotePresentations: RemoteUserNotificationPresentationCenter

  init(
    routes: NotificationRouteController = .shared,
    registrations: PushRegistrationController = .shared,
    liveActivities: LiveActivityTokenController? = nil,
    remotePresentations: RemoteUserNotificationPresentationCenter = .shared
  ) {
    self.routes = routes
    self.registrations = registrations
    self.liveActivities =
      liveActivities ?? LiveActivityTokenController(registrations: registrations)
    self.remotePresentations = remotePresentations
  }

  func attach(session: AppSession) {
    routes.attach(session: session)
    if NotificationDeliveryPreference.isEnabled() {
      liveActivities.start()
    } else {
      Task { await liveActivities.endAllActivities() }
    }
  }

  func receiveNotificationResponse(userInfo: [AnyHashable: Any]) {
    routes.submit(userInfo: userInfo)
  }

  /// Foreground presentation decision for an incoming notification. Routed
  /// notifications present only for the currently selected host.
  func foregroundPresentationOptions(
    for userInfo: [AnyHashable: Any]
  ) -> UNNotificationPresentationOptions {
    let route = NotificationPayloadParser.parse(userInfo: userInfo)
    let options = NotificationForegroundPresentation.options(
      route: route,
      hasRoutingEnvelope: NotificationPayloadParser.hasRoutingEnvelope(userInfo: userInfo),
      selectedConnectionId: routes.selectedConnectionId,
      preference: NotificationAlertPreference.current()
    )
    guard !options.isEmpty, let route else { return options }
    return remotePresentations.shouldPresentPush(for: route) ? options : []
  }

  func receiveURL(_ url: URL) -> Bool {
    routes.submit(url: url)
  }

  func receiveAPNSToken(_ token: Data) {
    Task { await registrations.receiveAPNSToken(token) }
  }

  func setForeground(_ foreground: Bool) {
    routes.setForeground(foreground)
    remotePresentations.setForeground(foreground)
    Task { await registrations.setForeground(foreground) }
  }
}
