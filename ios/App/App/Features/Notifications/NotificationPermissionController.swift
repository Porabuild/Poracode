import Observation
import UIKit
import UserNotifications

@MainActor
@Observable
final class NotificationPermissionController {
  enum State: Equatable {
    case unknown
    case notDetermined
    case usable
    case denied
  }

  static let shared = NotificationPermissionController()
  private(set) var state: State = .unknown
  private let center: UNUserNotificationCenter

  init(center: UNUserNotificationCenter = .current()) {
    self.center = center
  }

  func refreshAndRegisterIfUsable() async {
    let settings = await center.notificationSettings()
    apply(settings.authorizationStatus)
    if Self.isUsable(settings.authorizationStatus) {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }

  /// The only authorization prompt entry point. Call from a contextual user action.
  func requestFromUserAction() async {
    let settings = await center.notificationSettings()
    if settings.authorizationStatus == .denied {
      state = .denied
      openSettings()
      return
    }
    if settings.authorizationStatus == .notDetermined {
      _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
    }
    await refreshAndRegisterIfUsable()
  }

  func openSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }

  nonisolated static func isUsable(_ status: UNAuthorizationStatus) -> Bool {
    switch status {
    case .authorized, .provisional, .ephemeral:
      return true
    case .notDetermined, .denied:
      return false
    @unknown default:
      return false
    }
  }

  private func apply(_ status: UNAuthorizationStatus) {
    switch status {
    case .notDetermined: state = .notDetermined
    case .denied: state = .denied
    case .authorized, .provisional, .ephemeral: state = .usable
    @unknown default: state = .unknown
    }
  }
}
