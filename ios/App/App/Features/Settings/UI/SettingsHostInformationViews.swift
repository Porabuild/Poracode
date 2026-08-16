import SwiftUI

struct SettingsAgentsView: View {
  @Bindable var session: AppSession
  let connectionID: ClientConnectionID?
  @Bindable var controller: SettingsHostInformationController
  let refresh: () -> Void

  var body: some View {
    let presentation = session.settingsAgentReplayPresentation(
      for: connectionID,
      fallbackConnectionID: controller.lease?.connectionID,
      fallback: controller.agentStatuses
    )
    List {
      replaySection(
        SettingsUIStrings.windowsNative,
        environment: presentation.windows
      )
      replaySection(
        SettingsUIStrings.wsl,
        environment: presentation.wsl
      )
    }
    .listStyle(.insetGrouped)
    .refreshable { await controller.refresh(.agents) }
    .overlay(alignment: .bottom) {
      if case .failed(let failure) = controller.agentsState {
        SettingsRefreshFailureBanner(failure: failure, retry: refresh)
          .padding()
      }
    }
  }

  @ViewBuilder
  private func replaySection(
    _ title: String,
    environment: SettingsReplayAgentEnvironment
  ) -> some View {
    Section(title) {
      switch environment.loadState {
      case .notLoaded:
        HStack(spacing: 10) {
          ProgressView()
          Text(SettingsUIStrings.agentStatusNotLoaded)
        }
        .foregroundStyle(.secondary)
      case .loadedEmpty:
        Text(SettingsUIStrings.noAgentsDetected)
          .foregroundStyle(.secondary)
      case .populated:
        ForEach(environment.agents) { agent in
          HStack(spacing: 12) {
            Image(systemName: agent.installed ? "checkmark.seal.fill" : "xmark.seal")
              .foregroundStyle(agent.installed ? Color.green : Color.secondary)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
              Text(agent.label)
                .font(.body.weight(.medium))
              Text(agent.kind)
                .font(.caption)
                .foregroundStyle(.secondary)
              if let distro = agent.distro {
                Label(distro, systemImage: "shippingbox")
                  .font(.caption2)
                  .foregroundStyle(.tertiary)
              }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
              Text(agent.installed ? SettingsUIStrings.installed : SettingsUIStrings.notInstalled)
              Text(authLabel(agent.authState))
            }
            .font(.caption)
            .foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  private func authLabel(_ state: AgentStatusRecord.AuthState) -> String {
    switch state {
    case .authenticated: SettingsUIStrings.authenticated
    case .missing: SettingsUIStrings.authenticationMissing
    case .unknown: SettingsUIStrings.authenticationUnknown
    }
  }
}

struct SettingsUsageView: View {
  @Bindable var controller: SettingsHostInformationController
  let refresh: () -> Void

  var body: some View {
    SettingsHostInformationState(
      state: controller.usageState,
      value: controller.providerUsage,
      refresh: refresh
    ) { usage in
      List {
        if usage.fromCache {
          Label(SettingsUIStrings.cached, systemImage: "clock.arrow.circlepath")
            .foregroundStyle(.secondary)
        }
        if usage.snapshots.isEmpty {
          Text(SettingsUIStrings.noProvidersTracked)
            .foregroundStyle(.secondary)
        }
        ForEach(usage.snapshots, id: \.providerId) { snapshot in
          SettingsUsageProviderSection(snapshot: snapshot)
        }
        if let updated = latestUpdate(usage) {
          Text(SettingsUIStrings.updatedAgo(SettingsUsageRelative.format(updated)))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
        }
      }
      .listStyle(.insetGrouped)
      .refreshable { await controller.refresh(.usage) }
    }
  }

  private func latestUpdate(_ usage: SettingsProviderUsage) -> Date? {
    usage.snapshots
      .map(\.fetchedAt)
      .max()
      .map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
  }
}

/// One provider card, mirroring the mobile web usage cards: provider header
/// with plan and status, per-window bars, credits, and the cost meta line.
struct SettingsUsageProviderSection: View {
  let snapshot: SettingsUsageSnapshot

  var body: some View {
    Section {
      VStack(alignment: .leading, spacing: 8) {
        header
        ForEach(snapshot.windows, id: \.id) { window in
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(window.label)
              Spacer()
              Text((window.usedPercent / 100).formatted(.percent.precision(.fractionLength(0))))
                .monospacedDigit()
            }
            .font(.footnote)
            ProgressView(value: min(max(window.usedPercent / 100, 0), 1))
          }
          .accessibilityElement(children: .combine)
        }
        if let credits = snapshot.credits {
          HStack {
            Text(credits.label ?? SettingsUIStrings.credits)
            Spacer()
            if credits.unlimited == true {
              Text(SettingsUIStrings.unlimited)
            } else {
              Text(quantity(credits.balance, suffix: credits.currency))
                .monospacedDigit()
            }
          }
          .font(.footnote)
        }
        if let meta = metaLine {
          Text(meta)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .padding(.vertical, 4)
    } header: {
      Text(snapshot.providerId)
    }
  }

  @ViewBuilder
  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(snapshot.plan ?? statusLabel(snapshot.status))
        .font(.subheadline.weight(.semibold))
      Spacer()
      if let plan = snapshot.plan, snapshot.status != .ok {
        Text(statusLabel(snapshot.status))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    if let account = snapshot.authenticatedAs {
      Text(account)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var metaLine: String? {
    guard snapshot.cost != nil || snapshot.tokens?.total != nil else { return nil }
    let cost =
      snapshot.cost.map { "~\(quantity($0.amount, suffix: $0.currency))" } ?? ""
    let tokens = snapshot.tokens?.total.map { $0.formatted() } ?? ""
    let period = snapshot.cost.map(periodLabel) ?? ""
    return [cost, tokens.isEmpty ? "" : "\(tokens) tokens", period]
      .filter { !$0.isEmpty }
      .joined(separator: " · ")
  }

  private func periodLabel(_ cost: SettingsUsageCost) -> String {
    switch cost.period {
    case .today: SettingsUIStrings.periodToday
    case .sevenDays: SettingsUIStrings.periodSevenDays
    case .thirtyDays: SettingsUIStrings.periodThirtyDays
    case .cycle: SettingsUIStrings.periodCycle
    }
  }

  private func statusLabel(_ status: SettingsUsageStatus) -> String {
    switch status {
    case .ok: SettingsUIStrings.statusOK
    case .authMissing: SettingsUIStrings.statusAuthMissing
    case .appNotRunning: SettingsUIStrings.statusAppNotRunning
    case .rateLimited: SettingsUIStrings.statusRateLimited
    case .quotaHit: SettingsUIStrings.statusQuotaHit
    case .unsupported: SettingsUIStrings.statusUnsupported
    case .error: SettingsUIStrings.statusError
    }
  }

  private func quantity(_ value: Double, suffix: String?) -> String {
    [value.formatted(), suffix].compactMap { $0 }.joined(separator: " ")
  }
}

/// Relative "Updated …" timestamps for the usage footer.
enum SettingsUsageRelative {
  static func format(_ date: Date) -> String {
    let seconds = max(0, date.timeIntervalSinceNow * -1)
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits =
      seconds < 60
      ? [.second]
      : seconds < 3_600
        ? [.minute]
        : seconds < 86_400
          ? [.hour]
          : [.day]
    formatter.maximumUnitCount = 1
    formatter.unitsStyle = .abbreviated
    return formatter.string(from: seconds) ?? ""
  }
}

struct SettingsDevicesView: View {
  @Bindable var controller: SettingsHostInformationController
  let refresh: () -> Void

  var body: some View {
    SettingsHostInformationState(
      state: controller.devicesState,
      value: controller.profileDevices,
      refresh: refresh
    ) { devices in
      List(devices.devices, id: \.id) { device in
        HStack(spacing: 12) {
          Image(systemName: "desktopcomputer")
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 3) {
            Text(device.label)
              .font(.body.weight(.medium))
            Text(device.platform)
              .font(.caption)
              .foregroundStyle(.secondary)
            if let lastActiveAt = device.lastActiveAt {
              Text(date(lastActiveAt), format: .dateTime.year().month().day().hour().minute())
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
          }
          Spacer()
          if device.isCurrent == true || device.id == devices.currentDeviceId {
            Text(SettingsUIStrings.currentDevice)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        .accessibilityElement(children: .combine)
      }
      .overlay {
        if devices.devices.isEmpty {
          ContentUnavailableView(SettingsUIStrings.noData, systemImage: "desktopcomputer")
        }
      }
      .listStyle(.insetGrouped)
      .refreshable { await controller.refresh(.devices) }
    }
  }

  private func date(_ milliseconds: Int64) -> Date {
    Date(timeIntervalSince1970: Double(milliseconds) / 1_000)
  }
}

private struct SettingsHostInformationState<Value, Content: View>: View {
  let state: SettingsLoadState
  let value: Value?
  let refresh: () -> Void
  @ViewBuilder let content: (Value) -> Content

  var body: some View {
    if let value {
      content(value)
        .overlay(alignment: .bottom) {
          if case .failed(let failure) = state {
            SettingsRefreshFailureBanner(failure: failure, retry: refresh)
              .padding()
          }
        }
    } else {
      switch state {
      case .idle, .loading, .loaded:
        SettingsLoadingView()
      case .failed(let failure):
        SettingsUnavailableView(failure: failure, retry: refresh)
      }
    }
  }
}
