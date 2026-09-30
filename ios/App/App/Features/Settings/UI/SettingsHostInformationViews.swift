import SwiftUI

struct SettingsAgentsView: View {
  @Bindable var session: AppSession
  let connectionID: ClientConnectionID?
  @Bindable var controller: SettingsHostInformationController
  let composition: SettingsComposition
  let refresh: () -> Void

  @State private var hiddenModels: [String: [String]] = [:]
  @State private var providerOrder: [String] = []

  var body: some View {
    let presentation = session.settingsAgentReplayPresentation(
      for: connectionID,
      fallbackConnectionID: controller.lease?.connectionID,
      fallback: controller.agentStatuses
    )
    List {
      modelVisibilitySection
      modelOrderSection
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
    .refreshable {
      await controller.refresh(.agents)
      await composition.document.load()
    }
    .toolbar {
      if installedAgents.count > 1, composition.gate(.sessionOperate) == nil {
        EditButton().disabled(composition.isMutating)
      }
    }
    .onChange(of: composition.document.document, initial: true) { _, document in
      guard let document else { return }
      hiddenModels = document.hiddenModels
      providerOrder = document.providerOrder
    }
    .overlay(alignment: .bottom) {
      if case .failed(let failure) = controller.agentsState {
        SettingsRefreshFailureBanner(failure: failure, retry: refresh)
          .padding()
      }
    }
  }

  @ViewBuilder
  private var modelVisibilitySection: some View {
    if !installedAgents.isEmpty {
      Section(SettingsUIStrings.visibleModels) {
        ForEach(installedAgents, id: \.kind) { agent in
          if !agent.models.isEmpty {
            DisclosureGroup {
              ForEach(agent.models) { model in
                Toggle(
                  model.label,
                  isOn: Binding(
                    get: { !(hiddenModels[agent.kind] ?? []).contains(model.id) },
                    set: { visible in setModelVisible(visible, modelID: model.id, agent: agent) }
                  )
                )
              }
            } label: {
              LabeledContent(agent.label) {
                Text(visibleModelCount(agent))
                  .monospacedDigit()
                  .foregroundStyle(.secondary)
              }
            }
          }
        }
      }
      .disabled(composition.document.document == nil || composition.isMutating)
    }
  }

  @ViewBuilder
  private var modelOrderSection: some View {
    if !installedAgents.isEmpty {
      Section(SettingsUIStrings.modelOrder) {
        ForEach(orderedAgents, id: \.kind) { agent in
          Label(agent.label, systemImage: "line.3.horizontal")
        }
        .onMove(perform: moveAgents)
      }
      .disabled(composition.document.document == nil || composition.isMutating)
    }
  }

  private var installedAgents: [SettingsAgentStatus] {
    guard let statuses = controller.agentStatuses else { return [] }
    var seen = Set<String>()
    return (statuses.windows + statuses.wsl).filter { agent in
      agent.installed && seen.insert(agent.kind).inserted
    }
  }

  private var orderedAgents: [SettingsAgentStatus] {
    let ranks = Dictionary(uniqueKeysWithValues: providerOrder.enumerated().map { ($1, $0) })
    return installedAgents.enumerated().sorted { left, right in
      let leftRank = ranks[left.element.kind] ?? Int.max
      let rightRank = ranks[right.element.kind] ?? Int.max
      return leftRank == rightRank ? left.offset < right.offset : leftRank < rightRank
    }.map(\.element)
  }

  private func visibleModelCount(_ agent: SettingsAgentStatus) -> String {
    let hidden = Set(hiddenModels[agent.kind] ?? [])
    let visible = agent.models.filter { !hidden.contains($0.id) }.count
    return "\(visible) / \(agent.models.count)"
  }

  private func setModelVisible(
    _ visible: Bool,
    modelID: String,
    agent: SettingsAgentStatus
  ) {
    guard !composition.isMutating else { return }
    var hidden = Set(hiddenModels[agent.kind] ?? [])
    if visible { hidden.remove(modelID) } else { hidden.insert(modelID) }
    hiddenModels[agent.kind] = hidden.sorted()
    Task {
      await composition.writeSettings(
        SettingsPatch(
          values: [
            .hiddenModels: .object(
              hiddenModels.mapValues { .array($0.map(SettingsJSON.string)) }
            )
          ]
        )
      )
      if let authoritative = composition.document.document {
        hiddenModels = authoritative.hiddenModels
      }
    }
  }

  private func moveAgents(from offsets: IndexSet, to destination: Int) {
    guard !composition.isMutating else { return }
    var visible = orderedAgents.map(\.kind)
    visible.move(fromOffsets: offsets, toOffset: destination)
    let visibleSet = Set(visible)
    providerOrder = visible + providerOrder.filter { !visibleSet.contains($0) }
    Task {
      await composition.writeSettings(
        SettingsPatch(values: [.providerOrder: .array(providerOrder.map(SettingsJSON.string))])
      )
      if let authoritative = composition.document.document {
        providerOrder = authoritative.providerOrder
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
  let composition: SettingsComposition
  let refresh: () -> Void

  @State private var collapsedProviderIDs = Set<String>()
  @State private var providerOrder: [String] = []
  @State private var editMode: EditMode = .inactive

  var body: some View {
    SettingsHostInformationState(
      state: controller.usageState,
      value: controller.providerUsage,
      refresh: refresh
    ) { usage in
      List {
        if composition.document.document?.usage != nil {
          Toggle(SettingsUIStrings.cost, isOn: estimatedCostBinding)
            .disabled(composition.isMutating || composition.gate(.sessionOperate) != nil)
        }
        if usage.fromCache {
          Label(SettingsUIStrings.cached, systemImage: "clock.arrow.circlepath")
            .foregroundStyle(.secondary)
        }
        if usage.snapshots.isEmpty {
          Text(SettingsUIStrings.noProvidersTracked)
            .foregroundStyle(.secondary)
        }
        ForEach(ordered(usage.snapshots), id: \.providerId) { snapshot in
          SettingsUsageProviderSection(
            snapshot: snapshot,
            showsEstimatedCost: composition.document.document?.usage?.showEstimatedCost ?? true,
            isExpanded: Binding(
              get: { !collapsedProviderIDs.contains(snapshot.providerId) },
              set: { expanded in setExpanded(expanded, providerID: snapshot.providerId) }
            )
          )
        }
        .onMove { offsets, destination in
          moveProviders(usage.snapshots, from: offsets, to: destination)
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
      .contentMargins(.top, 0, for: .scrollContent)
      .environment(\.editMode, $editMode)
      .refreshable {
        await controller.refresh(.usage)
        await composition.document.load()
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if canReorder(usage) {
          PoracodeBottomActionDock(placement: .trailing) {
            PoracodeCircleButton {
              withAnimation {
                editMode = editMode.isEditing ? .inactive : .active
              }
            } label: {
              Image(systemName: editMode.isEditing ? "checkmark" : "arrow.up.arrow.down")
            }
            .disabled(composition.isMutating)
            .accessibilityLabel(
              editMode.isEditing ? SettingsUIStrings.done : SettingsUIStrings.edit
            )
          }
        }
      }
      .onChange(of: composition.document.document?.usage, initial: true) { _, value in
        guard let value else { return }
        collapsedProviderIDs = Set(value.collapsedProviders)
        providerOrder = value.providerOrder
      }
    }
  }

  private func latestUpdate(_ usage: SettingsProviderUsage) -> Date? {
    usage.snapshots
      .map(\.fetchedAt)
      .max()
      .map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
  }

  private func canReorder(_ usage: SettingsProviderUsage) -> Bool {
    usage.snapshots.count > 1
      && composition.document.document?.usage != nil
      && composition.gate(.sessionOperate) == nil
  }

  private func ordered(_ snapshots: [SettingsUsageSnapshot]) -> [SettingsUsageSnapshot] {
    SettingsUsagePresentation.ordered(snapshots, providerOrder: providerOrder)
  }

  private var estimatedCostBinding: Binding<Bool> {
    Binding(
      get: { composition.document.document?.usage?.showEstimatedCost ?? true },
      set: { show in setEstimatedCost(show) }
    )
  }

  private func setEstimatedCost(_ show: Bool) {
    guard var usage = composition.document.document?.usage, !composition.isMutating else { return }
    usage.showEstimatedCost = show
    Task { await composition.writeSettings(SettingsPatch(values: [.usage: usage.settingsJSON])) }
  }

  private func setExpanded(_ expanded: Bool, providerID: String) {
    guard var usage = composition.document.document?.usage, !composition.isMutating else { return }
    if expanded {
      collapsedProviderIDs.remove(providerID)
    } else {
      collapsedProviderIDs.insert(providerID)
    }
    usage.collapsedProviders = collapsedProviderIDs.sorted()
    Task { await composition.writeSettings(SettingsPatch(values: [.usage: usage.settingsJSON])) }
  }

  private func moveProviders(
    _ snapshots: [SettingsUsageSnapshot],
    from offsets: IndexSet,
    to destination: Int
  ) {
    guard var usage = composition.document.document?.usage, !composition.isMutating else { return }
    var visible = ordered(snapshots).map(\.providerId)
    visible.move(fromOffsets: offsets, toOffset: destination)
    let visibleSet = Set(visible)
    providerOrder = visible + usage.providerOrder.filter { !visibleSet.contains($0) }
    usage.providerOrder = providerOrder
    Task { await composition.writeSettings(SettingsPatch(values: [.usage: usage.settingsJSON])) }
  }
}

/// One provider card, mirroring the mobile web usage cards: provider header
/// with plan and status, per-window bars, credits, and the cost meta line.
struct SettingsUsageProviderSection: View {
  let snapshot: SettingsUsageSnapshot
  let showsEstimatedCost: Bool
  @Binding var isExpanded: Bool

  var body: some View {
    DisclosureGroup(isExpanded: $isExpanded) {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(snapshot.windows, id: \.id) { window in
          SettingsUsageWindowMeter(window: window)
        }
        if let credits = snapshot.credits {
          HStack {
            Text(credits.label ?? SettingsUIStrings.credits)
            Spacer()
            if credits.unlimited == true {
              Text(SettingsUIStrings.unlimited)
            } else {
              Text(SettingsUsagePresentation.quantity(credits.balance, suffix: credits.currency))
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
      .padding(.vertical, 2)
    } label: {
      HStack(alignment: .firstTextBaseline) {
        HStack(spacing: 8) {
          HomeProviderIcon(kind: snapshot.providerId)
            .frame(width: 16, height: 16)
            .foregroundStyle(.secondary)
            .opacity(0.78)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(SettingsUsagePresentation.providerLabel(snapshot.providerId))
              .font(.body.weight(.medium))
            if let account = snapshot.authenticatedAs {
              Text(account)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text(snapshot.plan ?? statusLabel(snapshot.status))
          if snapshot.plan != nil, snapshot.status != .ok {
            Text(statusLabel(snapshot.status))
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .disclosureGroupStyle(SettingsUsageDisclosureStyle())
  }

  private var metaLine: String? {
    SettingsUsagePresentation.metaLine(
      snapshot,
      showsEstimatedCost: showsEstimatedCost
    )
  }

  private func statusLabel(_ status: SettingsUsageStatus) -> String {
    SettingsUsagePresentation.statusLabel(status)
  }
}

private struct SettingsUsageDisclosureStyle: DisclosureGroupStyle {
  func makeBody(configuration: Configuration) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Button {
        withAnimation(.easeInOut(duration: 0.2)) {
          configuration.isExpanded.toggle()
        }
      } label: {
        HStack(spacing: 8) {
          configuration.label
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .rotationEffect(.degrees(configuration.isExpanded ? 0 : -90))
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if configuration.isExpanded {
        configuration.content
      }
    }
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
