import SwiftUI

struct SettingsUsageSidebarFocus: Hashable, Sendable {
  let lease: SettingsHostLease
  let providerID: String
}

extension EnvironmentValues {
  @Entry var settingsUsageSidebarFocus: SettingsUsageSidebarFocus? = nil
}

struct SettingsUsageView: View {
  let selection: SettingsHostSelection?
  let composition: SettingsComposition
  let refresh: () -> Void

  @AppStorage(SettingsUsageDisplayPreferences.storageKey, store: .standard)
  private var storedDisplay = Data()
  @Environment(\.settingsUsageSidebarFocus) private var sidebarFocus
  @State private var appliedFocus: SettingsUsageSidebarFocus?
  @State private var expandedSidebarProvider: String?
  @State private var editMode: EditMode = .inactive

  private var display: SettingsUsageDisplayPreferences {
    SettingsUsageDisplayPreferences.resolved(storedDisplay, legacy: legacyDocument?.usage)
  }

  private var legacyDocument: SettingsDocument? {
    guard let lease = selection?.lease, composition.document.lease == lease else { return nil }
    return composition.document.document
  }

  private var hostFailure: SettingsOperationFailure? {
    guard let selection else { return .offline }
    return selection.gate(.sessionRead)
  }

  private var hasCurrentHost: Bool {
    guard let lease = selection?.lease else { return false }
    return lease == composition.hostInformation.lease && hostFailure == nil
  }

  private var usage: SettingsProviderUsage? {
    hasCurrentHost ? composition.hostInformation.providerUsage : nil
  }

  private var usageState: SettingsLoadState {
    if let hostFailure { return .failed(hostFailure) }
    return hasCurrentHost ? composition.hostInformation.usageState : .loading
  }

  var body: some View {
    ScrollViewReader { scroll in
      usageList.task(id: availableFocus) {
        guard let focus = availableFocus, appliedFocus != focus else { return }
        appliedFocus = focus
        expandedSidebarProvider = focus.providerID
        await Task.yield()
        guard !Task.isCancelled, availableFocus == focus else { return }
        scroll.scrollTo(focus.providerID, anchor: .center)
      }
    }
  }

  private var availableFocus: SettingsUsageSidebarFocus? {
    guard let sidebarFocus, sidebarFocus.lease == selection?.lease,
      usage?.snapshots.contains(where: { $0.providerId == sidebarFocus.providerID }) == true
    else { return nil }
    return sidebarFocus
  }

  private var usageList: some View {
    List {
      Toggle(SettingsUIStrings.cost, isOn: estimatedCostBinding)
        .poracodeSwitchStyle()
      if let usage {
        quotaRows(usage)
      } else {
        switch usageState {
        case .idle, .loading, .loaded:
          SettingsLoadingView()
        case .failed(let failure):
          SettingsUnavailableView(failure: failure, retry: refresh)
        }
      }
    }
    .listStyle(.insetGrouped)
    .contentMargins(.top, 0, for: .scrollContent)
    .poracodeReadableListMargins(740)
    .environment(\.editMode, $editMode)
    .refreshable {
      guard composition.selection == selection else { return }
      await composition.refresh(route: .usage, query: SettingsProfileQuery())
    }
    .overlay(alignment: .bottom) {
      if usage != nil, case .failed(let failure) = usageState {
        SettingsRefreshFailureBanner(failure: failure, retry: refresh)
          .padding()
      }
    }
    .toolbar {
      if (usage?.snapshots.count ?? 0) > 1 {
        ToolbarItem(placement: .bottomBar) {
          Button(
            editMode.isEditing ? SettingsUIStrings.done : SettingsUIStrings.edit,
            systemImage: editMode.isEditing ? "checkmark" : "arrow.up.arrow.down"
          ) {
            withAnimation {
              editMode = editMode.isEditing ? .inactive : .active
            }
          }
          .accessibilityIdentifier("native-e2e.usage.reorder")
        }
      }
    }
    .onChange(of: legacyDocument, initial: true) { _, document in
      if let document,
        let migrated = SettingsUsageDisplayPreferences.migrated(currentDisplayData, from: document.usage)
      {
        storedDisplay = migrated
      }
    }
    .onChange(of: selection?.lease) { _, _ in
      editMode = .inactive
      expandedSidebarProvider = nil
    }
  }

  @ViewBuilder
  private func quotaRows(_ usage: SettingsProviderUsage) -> some View {
    if usage.fromCache {
      Label(SettingsUIStrings.cached, systemImage: "clock.arrow.circlepath")
        .foregroundStyle(.secondary)
    }
    if usage.snapshots.isEmpty {
      Text(SettingsUIStrings.noProvidersTracked)
        .foregroundStyle(.secondary)
    }
    let snapshots = SettingsUsagePresentation.ordered(
      usage.snapshots, providerOrder: display.order
    )
    ForEach(snapshots, id: \.providerId) { snapshot in
      SettingsUsageProviderSection(
        snapshot: snapshot,
        showsEstimatedCost: display.showEstimatedCost,
        isExpanded: Binding(
          get: { expandedSidebarProvider == snapshot.providerId || !display.isCollapsed(snapshot.providerId) },
          set: { expanded in
            if expandedSidebarProvider == snapshot.providerId { expandedSidebarProvider = nil }
            updateDisplay { $0.setCollapsed(!expanded, providerID: snapshot.providerId) }
          }
        )
      )
      .id(snapshot.providerId)
    }
    .onMove { offsets, destination in
      var visible = snapshots.map(\.providerId)
      visible.move(fromOffsets: offsets, toOffset: destination)
      let visibleSet = Set(visible)
      updateDisplay {
        $0.order = visible + $0.order.filter { !visibleSet.contains($0) }
      }
    }
    if let fetchedAt = usage.snapshots.map(\.fetchedAt).max() {
      let date = Date(timeIntervalSince1970: TimeInterval(fetchedAt) / 1_000)
      Text(SettingsUIStrings.updatedAgo(SettingsUsageRelative.format(date)))
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
  }

  private var estimatedCostBinding: Binding<Bool> {
    Binding(
      get: { display.showEstimatedCost },
      set: { value in updateDisplay { $0.showEstimatedCost = value } }
    )
  }

  private func updateDisplay(_ change: (inout SettingsUsageDisplayPreferences) -> Void) {
    var updated = SettingsUsageDisplayPreferences.decoded(currentDisplayData) ?? .init()
    if let legacy = legacyDocument?.usage {
      updated = updated.seeding(from: legacy)
    }
    change(&updated)
    if let encoded = try? JSONEncoder().encode(updated) {
      storedDisplay = encoded
    }
  }

  private var currentDisplayData: Data {
    UserDefaults.standard.data(forKey: SettingsUsageDisplayPreferences.storageKey) ?? Data()
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
      .poracodeReadableListMargins(740)
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
