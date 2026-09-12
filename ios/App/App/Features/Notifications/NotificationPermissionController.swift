import Observation
import UIKit
import UserNotifications

enum NotificationDeliveryPreference {
  /// A versioned, device-local choice. Missing data means enabled so upgrades
  /// preserve the notification behavior users already had.
  static let storageKey = "poracode.notifications.delivery-enabled.v1"

  static func isEnabled(in defaults: UserDefaults = .standard) -> Bool {
    defaults.object(forKey: storageKey) as? Bool ?? true
  }

  static func setEnabled(_ enabled: Bool, in defaults: UserDefaults = .standard) {
    defaults.set(enabled, forKey: storageKey)
  }
}

enum NotificationForegroundMode: String, CaseIterable, Sendable {
  case backgroundOnly
  case always
}

struct NotificationAlertPreference: Equatable, Sendable {
  static let soundStorageKey = "poracode.notifications.sound-enabled.v1"
  static let foregroundStorageKey = "poracode.notifications.foreground-mode.v1"
  static let doneStorageKey = "poracode.notifications.done-enabled.v1"
  static let needsAttentionStorageKey = "poracode.notifications.needs-attention-enabled.v1"
  static let errorStorageKey = "poracode.notifications.error-enabled.v1"

  var soundEnabled: Bool
  var foregroundMode: NotificationForegroundMode
  var doneEnabled: Bool
  var needsAttentionEnabled: Bool
  var errorEnabled: Bool

  static func current(in defaults: UserDefaults = .standard) -> Self {
    Self(
      soundEnabled: bool(soundStorageKey, in: defaults),
      foregroundMode: NotificationForegroundMode(
        rawValue: defaults.string(forKey: foregroundStorageKey) ?? ""
      ) ?? .always,
      doneEnabled: bool(doneStorageKey, in: defaults),
      needsAttentionEnabled: bool(needsAttentionStorageKey, in: defaults),
      errorEnabled: bool(errorStorageKey, in: defaults)
    )
  }

  func persist(in defaults: UserDefaults = .standard) {
    defaults.set(soundEnabled, forKey: Self.soundStorageKey)
    defaults.set(foregroundMode.rawValue, forKey: Self.foregroundStorageKey)
    defaults.set(doneEnabled, forKey: Self.doneStorageKey)
    defaults.set(needsAttentionEnabled, forKey: Self.needsAttentionStorageKey)
    defaults.set(errorEnabled, forKey: Self.errorStorageKey)
  }

  var pushPreferences: PushAlertPreferences {
    PushAlertPreferences(
      sound: soundEnabled,
      statuses: .init(
        done: doneEnabled,
        needsAttention: needsAttentionEnabled,
        error: errorEnabled
      )
    )
  }

  private static func bool(_ key: String, in defaults: UserDefaults) -> Bool {
    defaults.object(forKey: key) as? Bool ?? true
  }
}

@MainActor
@Observable
final class NotificationDeliveryController {
  static let shared = NotificationDeliveryController()

  private(set) var isEnabled: Bool
  private(set) var alertPreference: NotificationAlertPreference
  private let defaults: UserDefaults
  private let registrations: PushRegistrationController
  private var operationRevision: UInt64 = 0

  init(
    defaults: UserDefaults = .standard,
    registrations: PushRegistrationController = .shared
  ) {
    self.defaults = defaults
    self.registrations = registrations
    isEnabled = NotificationDeliveryPreference.isEnabled(in: defaults)
    alertPreference = NotificationAlertPreference.current(in: defaults)
  }

  func setSoundEnabled(_ enabled: Bool) async {
    guard alertPreference.soundEnabled != enabled else { return }
    alertPreference.soundEnabled = enabled
    await persistAlertPreference()
  }

  func setForegroundMode(_ mode: NotificationForegroundMode) async {
    guard alertPreference.foregroundMode != mode else { return }
    alertPreference.foregroundMode = mode
    alertPreference.persist(in: defaults)
  }

  func setDoneEnabled(_ enabled: Bool) async {
    guard alertPreference.doneEnabled != enabled else { return }
    alertPreference.doneEnabled = enabled
    await persistAlertPreference()
  }

  func setNeedsAttentionEnabled(_ enabled: Bool) async {
    guard alertPreference.needsAttentionEnabled != enabled else { return }
    alertPreference.needsAttentionEnabled = enabled
    await persistAlertPreference()
  }

  func setErrorEnabled(_ enabled: Bool) async {
    guard alertPreference.errorEnabled != enabled else { return }
    alertPreference.errorEnabled = enabled
    await persistAlertPreference()
  }

  private func persistAlertPreference() async {
    alertPreference.persist(in: defaults)
    await registrations.setAlertPreferences(alertPreference.pushPreferences)
  }

  func setEnabled(_ enabled: Bool) async {
    guard enabled != isEnabled else { return }
    operationRevision &+= 1
    let revision = operationRevision
    isEnabled = enabled
    NotificationDeliveryPreference.setEnabled(enabled, in: defaults)

    if enabled {
      await registrations.setDeliveryEnabled(true)
      guard owns(revision, enabled: true) else { return }
      NotificationIngress.shared.liveActivities.start()
      await NotificationPermissionController.shared.refreshAndRegisterIfUsable()
    } else {
      UIApplication.shared.unregisterForRemoteNotifications()
      await NotificationIngress.shared.liveActivities.endAllActivities()
      guard owns(revision, enabled: false) else { return }
      await registrations.setDeliveryEnabled(false)
    }
  }

  private func owns(_ revision: UInt64, enabled: Bool) -> Bool {
    operationRevision == revision && isEnabled == enabled
  }
}

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
    if Self.isUsable(settings.authorizationStatus)
      && NotificationDeliveryPreference.isEnabled()
    {
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
