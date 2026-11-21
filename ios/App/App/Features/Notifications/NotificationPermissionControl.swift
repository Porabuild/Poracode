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
      permissionButton(String(localized: "notifications.openSettings"), icon: "gear") {
        permissions.openSettings()
      }
    case .unknown, .notDetermined:
      permissionButton(SettingsUIStrings.notificationSystemPermission, icon: "bell.badge") {
        Task { await permissions.requestFromUserAction() }
      }
    }
  }

  private func permissionButton(
    _ title: String, icon: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(title, systemImage: icon)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
