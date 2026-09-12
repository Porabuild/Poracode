import SwiftUI

struct NotificationPermissionControl: View {
  @Bindable var permissions = NotificationPermissionController.shared
  @Bindable var pushStatus = PushClientStatus.shared

  var body: some View {
    Group {
      switch permissions.state {
      case .usable:
        Label(String(localized: "notifications.status.on"), systemImage: "bell.badge.fill")
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
      if pushStatus.state == .disabledForPreservedState {
        Label(
          String(localized: "notifications.status.unavailable"),
          systemImage: "exclamationmark.shield"
        )
      }
    }
  }
}
