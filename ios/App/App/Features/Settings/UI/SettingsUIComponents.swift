import SwiftUI

struct SettingsUnavailableView: View {
  let failure: SettingsOperationFailure
  var retry: (() -> Void)?

  var body: some View {
    ContentUnavailableView {
      Label(SettingsUIStrings.unavailable, systemImage: "gearshape.slash")
    } description: {
      Text(SettingsUIStrings.failure(failure))
    } actions: {
      if let retry {
        Button(SettingsUIStrings.retry, action: retry)
          .poracodeGlassButtonStyle()
      }
    }
  }
}

struct SettingsLoadingView: View {
  var body: some View {
    VStack(spacing: 12) {
      ProgressView()
        .controlSize(.large)
      Text(SettingsUIStrings.loading)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

struct SettingsMutationBanner: View {
  let notice: SettingsMutationNotice?
  let failure: SettingsOperationFailure?
  let dismiss: () -> Void

  var body: some View {
    if let notice {
      banner(
        SettingsUIStrings.mutationNotice(notice),
        systemImage: notice == .saved ? "checkmark.circle" : "arrow.clockwise.circle"
      )
    } else if let failure {
      banner(SettingsUIStrings.failure(failure), systemImage: "exclamationmark.triangle")
    }
  }

  private func banner(_ message: String, systemImage: String) -> some View {
    HStack(spacing: 12) {
      Label(message, systemImage: systemImage)
        .font(.footnote)
      Spacer(minLength: 8)
      Button(SettingsUIStrings.done, systemImage: "xmark", action: dismiss)
        .labelStyle(.iconOnly)
        .accessibilityLabel(SettingsUIStrings.done)
    }
    .padding(12)
    .frame(maxWidth: .infinity)
    .settingsGlassSurface()
  }
}

struct SettingsRefreshFailureBanner: View {
  let failure: SettingsOperationFailure
  let retry: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Label(SettingsUIStrings.failure(failure), systemImage: "exclamationmark.triangle")
        .font(.footnote)
      Spacer(minLength: 8)
      Button(SettingsUIStrings.retry, action: retry)
        .poracodeSurfaceButtonStyle()
    }
    .padding(12)
    .frame(maxWidth: .infinity)
    .settingsGlassSurface()
  }
}

struct SettingsMetricRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack {
      Text(label)
      Spacer()
      Text(value)
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }
    .accessibilityElement(children: .combine)
  }
}

struct SettingsFilterBar: View {
  @Binding var query: SettingsProfileQuery
  let devices: SettingsProfileDevices
  let accounts: [SettingsProfileAccount]

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) { controls }
      VStack(alignment: .leading, spacing: 12) { controls }
    }
    .padding(.horizontal)
    .padding(.vertical, 8)
  }

  @ViewBuilder
  private var controls: some View {
    Picker(SettingsUIStrings.scope, selection: $query.scope) {
      Text(SettingsUIStrings.thisDevice).tag(SettingsProfileScope.device)
      Text(SettingsUIStrings.allDevices).tag(SettingsProfileScope.all)
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("native-e2e.profile-filter.scope")

    Picker(SettingsUIStrings.account, selection: $query.provider) {
      Text(SettingsUIStrings.allAccounts).tag(String?.none)
      ForEach(accounts, id: \.key) { account in
        Text(account.label).tag(String?.some(account.key))
      }
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("native-e2e.profile-filter.account")

    Picker(SettingsUIStrings.period, selection: $query.window) {
      Text(SettingsUIStrings.sevenDays).tag(SettingsProfileWindow.sevenDays)
      Text(SettingsUIStrings.thirtyDays).tag(SettingsProfileWindow.thirtyDays)
      Text(SettingsUIStrings.allTime).tag(SettingsProfileWindow.all)
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("native-e2e.profile-filter.period")

    if query.scope == .device, devices.devices.count > 1 {
      Picker(SettingsUIStrings.devicesTitle, selection: Binding(
        get: { query.deviceID ?? devices.currentDeviceId },
        set: { query.deviceID = $0 }
      )) {
        ForEach(devices.devices, id: \.id) { device in
          Text(device.label).tag(device.id)
        }
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("native-e2e.profile-filter.device")
    }
  }
}

extension View {
  @ViewBuilder
  fileprivate func settingsGlassSurface() -> some View {
    poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}
