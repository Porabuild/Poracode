import SwiftUI
import UIKit

struct NotificationSettingsView: View {
  @Bindable private var delivery = NotificationDeliveryController.shared

  var body: some View {
    List {
      Section {
        Toggle(
          String(localized: "notifications.enable"),
          isOn: Binding(
            get: { delivery.isEnabled },
            set: { enabled in
              Task { await delivery.setEnabled(enabled) }
            }
          )
        )
        .poracodeSwitchStyle()
        if delivery.isEnabled {
          NotificationPermissionControl()
        }
      } footer: {
        Text(SettingsUIStrings.notificationsDescription)
      }

      Section {
        Toggle(
          SettingsUIStrings.notificationSound,
          isOn: alertBinding(\.soundEnabled, update: delivery.setSoundEnabled)
        )
        .poracodeSwitchStyle()
        Picker(
          SettingsUIStrings.notificationPresentation,
          selection: Binding(
            get: { delivery.alertPreference.foregroundMode },
            set: { mode in Task { await delivery.setForegroundMode(mode) } }
          )
        ) {
          Text(SettingsUIStrings.notificationBackgroundOnly)
            .tag(NotificationForegroundMode.backgroundOnly)
          Text(SettingsUIStrings.notificationAlways).tag(NotificationForegroundMode.always)
        }
      }
      .disabled(!delivery.isEnabled)

      Section(SettingsUIStrings.notifyAbout) {
        Toggle(
          SettingsUIStrings.notificationDone,
          isOn: alertBinding(\.doneEnabled, update: delivery.setDoneEnabled)
        )
        .poracodeSwitchStyle()
        Toggle(
          SettingsUIStrings.notificationNeedsAttention,
          isOn: alertBinding(\.needsAttentionEnabled, update: delivery.setNeedsAttentionEnabled)
        )
        .poracodeSwitchStyle()
        Toggle(
          SettingsUIStrings.notificationError,
          isOn: alertBinding(\.errorEnabled, update: delivery.setErrorEnabled)
        )
        .poracodeSwitchStyle()
      }
      .disabled(!delivery.isEnabled)
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(SettingsUIStrings.notificationsTitle)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await NotificationPermissionController.shared.refreshAndRegisterIfUsable()
    }
  }

  private func alertBinding(
    _ keyPath: KeyPath<NotificationAlertPreference, Bool>,
    update: @escaping (Bool) async -> Void
  ) -> Binding<Bool> {
    Binding(
      get: { delivery.alertPreference[keyPath: keyPath] },
      set: { enabled in Task { await update(enabled) } }
    )
  }
}
