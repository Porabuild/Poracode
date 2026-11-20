import SwiftUI
import UIKit

struct NotificationSettingsView: View {
  @Bindable private var delivery = NotificationDeliveryController.shared

  var body: some View {
    List {
      Section {
        NotificationSettingSwitch(
          title: String(localized: "notifications.enable"),
          isOn: Binding(
            get: { delivery.isEnabled },
            set: { enabled in
              Task { await delivery.setEnabled(enabled) }
            }
          )
        )
        .settingsSearchAnchor(.notificationsEnabled)
        if delivery.isEnabled {
          NotificationPermissionControl()
        }
      } footer: {
        Text(SettingsUIStrings.notificationsDescription)
      }

      Section {
        NotificationSettingSwitch(
          title: SettingsUIStrings.notificationSound,
          isOn: alertBinding(\.soundEnabled, update: delivery.setSoundEnabled)
        )
        .settingsSearchAnchor(.notificationSound)
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
        .accessibilityIdentifier("native-e2e.notifications.presentation")
        .settingsSearchAnchor(.notificationPresentation)
      }
      .disabled(!delivery.isEnabled)

      Section(SettingsUIStrings.notifyAbout) {
        NotificationSettingSwitch(
          title: SettingsUIStrings.notificationDone,
          isOn: alertBinding(\.doneEnabled, update: delivery.setDoneEnabled)
        )
        .settingsSearchAnchor(.notificationDone)
        NotificationSettingSwitch(
          title: SettingsUIStrings.notificationNeedsAttention,
          isOn: alertBinding(\.needsAttentionEnabled, update: delivery.setNeedsAttentionEnabled)
        )
        .settingsSearchAnchor(.notificationAttention)
        NotificationSettingSwitch(
          title: SettingsUIStrings.notificationError,
          isOn: alertBinding(\.errorEnabled, update: delivery.setErrorEnabled)
        )
        .settingsSearchAnchor(.notificationError)
      }
      .disabled(!delivery.isEnabled)
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .settingsSearchScroll()
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

private struct NotificationSettingSwitch: View {
  let title: String
  @Binding var isOn: Bool
  @Environment(\.isEnabled) private var isEnabled

  var body: some View {
    Toggle(isOn: $isOn) {
      Text(title)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture {
          if isEnabled { isOn.toggle() }
        }
    }
    .accessibilityLabel(title)
    .poracodeSwitchStyle()
  }
}
