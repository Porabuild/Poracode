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
          .settingsProminentButtonStyle()
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
        .buttonStyle(.bordered)
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
  let devices: [SettingsProfileDevice]
  let providers: [SettingsProfileBreakdown]

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

    Picker(SettingsUIStrings.provider, selection: $query.provider) {
      Text(SettingsUIStrings.allProviders).tag(String?.none)
      ForEach(providers, id: \.key) { provider in
        Text(provider.label).tag(String?.some(provider.key))
      }
    }
    .pickerStyle(.menu)

    Picker(SettingsUIStrings.period, selection: $query.window) {
      Text(SettingsUIStrings.sevenDays).tag(SettingsProfileWindow.sevenDays)
      Text(SettingsUIStrings.thirtyDays).tag(SettingsProfileWindow.thirtyDays)
      Text(SettingsUIStrings.allTime).tag(SettingsProfileWindow.all)
    }
    .pickerStyle(.menu)

    if query.scope == .device, devices.count > 1 {
      Picker(SettingsUIStrings.devicesTitle, selection: $query.deviceID) {
        ForEach(devices, id: \.id) { device in
          Text(device.label).tag(String?.some(device.id))
        }
      }
      .pickerStyle(.menu)
    }
  }
}

extension View {
  @ViewBuilder
  fileprivate func settingsGlassSurface() -> some View {
    if #available(iOS 26.0, *) {
      glassEffect(.regular, in: .rect(cornerRadius: 16))
    } else {
      background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
  }

  @ViewBuilder
  fileprivate func settingsProminentButtonStyle() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glassProminent)
    } else {
      buttonStyle(.borderedProminent)
    }
  }
}
