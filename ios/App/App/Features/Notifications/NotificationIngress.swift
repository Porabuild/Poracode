import Foundation
import SwiftUI
import UserNotifications

@MainActor
final class NotificationIngress {
  static let shared = NotificationIngress()

  let routes: NotificationRouteController
  let registrations: PushRegistrationController
  let liveActivities: LiveActivityTokenController
  let remotePresentations: RemoteUserNotificationPresentationCenter

  /// Last value fanned out to the consumers. Scene phases are re-reported far
  /// more often than they change meaning — a Notification Center pull,
  /// Control Center pull or app-switcher peek re-reports a phase that still
  /// maps to foreground — and re-fanning out would re-run the push
  /// registration reconcile (vault/state/outbox load plus per-host
  /// re-registration) on every overlay. Consumers therefore only see real
  /// false→true / true→false transitions.
  private var isForeground = false
  private var registrationTask: Task<Void, Never>?

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

  /// The single scene-phase → ingress seam. PoracodeApp calls this from both
  /// the launch task and `onChange(of: scenePhase)`; keeping the mapping in
  /// one testable place is what pins the wiring (the 587195a47 regression
  /// lived in a predicate only the App struct could see).
  func applyScenePhase(_ phase: ScenePhase) {
    setForeground(!NotificationForegroundPolicy.isSessionBackgrounded(phase))
  }

  func setForeground(_ foreground: Bool) {
    guard foreground != isForeground else { return }
    isForeground = foreground
    routes.setForeground(foreground)
    remotePresentations.setForeground(foreground)
    registrationTask = Task { await registrations.setForeground(foreground) }
  }

  /// Joins the in-flight registration fan-out. Test hook only.
  func settleForTests() async {
    await registrationTask?.value
  }
}
