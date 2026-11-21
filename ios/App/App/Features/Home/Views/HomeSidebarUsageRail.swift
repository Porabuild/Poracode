import SwiftUI

/// The selected desktop's sidebar usage. A replaced host loses both its
/// quota readings and its rail preferences before the new host is shown.
struct HomeSidebarUsageRail: View {
  let session: AppSession
  let openUsage: (SettingsHostLease, String?) -> Void

  @Environment(\.scenePhase) private var scenePhase
  @AppStorage(SettingsUsageDisplayPreferences.storageKey) private var storedDisplay = Data()
  @State private var composition: SettingsComposition

  init(session: AppSession, openUsage: @escaping (SettingsHostLease, String?) -> Void) {
    self.session = session
    self.openUsage = openUsage
    _composition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway()))
  }

  private struct RefreshKey: Equatable {
    let selection: SettingsHostSelection?
    let settingsRevision: UInt64
    let scenePhase: ScenePhase
  }

  private var refreshKey: RefreshKey {
    let selection = session.currentSettingsHostSelection
    return RefreshKey(
      selection: selection,
      settingsRevision: session.settingsDocumentChanges.revision(
        for: selection?.lease.connectionID),
      scenePhase: scenePhase
    )
  }

  var body: some View {
    let key = refreshKey
    VStack(spacing: 0) {
      if let selection = key.selection, selection.gate(.sessionRead) == nil,
        composition.hostInformation.lease == selection.lease,
        composition.document.lease == selection.lease,
        let usage = composition.hostInformation.providerUsage,
        let document = composition.document.document
      {
        let display = SettingsUsageDisplayPreferences.resolved(
          storedDisplay, legacy: document.usage)
        let snapshots = SettingsUsagePresentation.sidebarSnapshots(
          usage, preferences: document.usage, providerOrder: display.order
        )
        if !snapshots.isEmpty {
          rail(snapshots, ringLayouts: usage.ringLayouts ?? [:], lease: selection.lease)
        }
      }
    }
    .task(id: key) {
      guard !Task.isCancelled, key == refreshKey, key.scenePhase == .active else { return }
      composition.activate(key.selection)
      await composition.refresh(route: .usage, query: SettingsProfileQuery())
    }
    .onDisappear { composition.activate(nil) }
  }

  private func rail(
    _ snapshots: [SettingsUsageSnapshot],
    ringLayouts: [String: SettingsUsageRingLayout],
    lease: SettingsHostLease
  ) -> some View {
    HStack(spacing: 6) {
      Button {
        openUsage(lease, nil)
      } label: {
        Text(SettingsUIStrings.usageTitle)
          .font(.caption.weight(.semibold))
          .lineLimit(1)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.sidebar.usage")
      ScrollView(.horizontal) {
        HStack(spacing: 2) {
          ForEach(snapshots, id: \.providerId) { snapshot in
            let label = SettingsUsagePresentation.providerLabel(snapshot.providerId)
            let presentation = RichChatProviderUsagePresentation(
              providerID: snapshot.providerId, label: label, snapshot: snapshot,
              ringLayout: ringLayouts[snapshot.providerId]
            )
            Button {
              openUsage(lease, snapshot.providerId)
            } label: {
              HomeSidebarUsageIndicator(presentation: presentation)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityValue(usageValue(snapshot))
            .accessibilityIdentifier("native-e2e.sidebar.usage.\(snapshot.providerId)")
          }
        }
      }
      .scrollIndicators(.hidden)
      .frame(height: 44)
    }
    .foregroundStyle(Color.poracodeSecondaryLabel)
    .padding(.horizontal, 12)
    .padding(.vertical, 2)
  }

  private func usageValue(_ snapshot: SettingsUsageSnapshot) -> String {
    var values = snapshot.windows.map {
      "\($0.label) \(SettingsUsagePresentation.windowValue($0))"
    }
    if snapshot.status != .ok || values.isEmpty {
      values.append(SettingsUsagePresentation.statusLabel(snapshot.status))
    }
    return values.joined(separator: ", ")
  }
}

private struct HomeSidebarUsageIndicator: View {
  let presentation: RichChatProviderUsagePresentation

  var body: some View {
    let rings = presentation.rings
    let windows = presentation.snapshot?.windows ?? []
    let outerPercent = rings.outerPercent ?? (windows.count == 1 ? windows.first?.usedPercent : nil)
    ZStack {
      ring(percent: outerPercent, size: 34)
      if let inner = rings.innerPercent { ring(percent: inner, size: 27) }
      HomeProviderIcon(kind: presentation.providerID, agentLabel: presentation.label)
        .frame(width: 13, height: 13)
    }
    .accessibilityHidden(true)
  }

  private func ring(percent: Double?, size: CGFloat) -> some View {
    ZStack {
      Circle().strokeBorder(Color.secondary.opacity(0.22), lineWidth: 2)
      if let percent, percent.isFinite {
        Circle()
          .trim(from: 0, to: min(max(percent, 0), 100) / 100)
          .stroke(ringColor(percent), style: StrokeStyle(lineWidth: 2, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
    }
    .frame(width: size, height: size)
  }

  private func ringColor(_ percent: Double) -> Color {
    switch SettingsUsagePresentation.tone(for: percent) {
    case .danger: .red
    case .warning: .orange
    case .normal, .unknown: .primary
    }
  }
}
