import SwiftUI

struct NotificationPermissionControl: View {
  @Bindable var permissions = NotificationPermissionController.shared
  @Bindable var pushStatus = PushClientStatus.shared

  var body: some View {
    Group {
      permissionAction
      if pushStatus.state == .disabledForPreservedState {
        Label(
          String(localized: "notifications.status.unavailable"),
          systemImage: "exclamationmark.shield"
        )
      }
    }
  }

  /// The permission action row appears only while the system permission is
  /// missing: denied opens Settings, not-determined requests it. Once usable
  /// there is nothing to act on, so no row is shown.
  @ViewBuilder
  private var permissionAction: some View {
    switch permissions.state {
    case .usable:
      EmptyView()
    case .denied:
      Button {
        permissions.openSettings()
      } label: {
        Label(String(localized: "notifications.openSettings"), systemImage: "gear")
      }
    case .unknown, .notDetermined:
      Button {
        Task { await permissions.requestFromUserAction() }
      } label: {
        Label(String(localized: "notifications.enable"), systemImage: "bell.badge")
      }
    }
  }
}
