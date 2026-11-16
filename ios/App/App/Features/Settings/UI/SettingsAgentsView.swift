import SwiftUI

struct SettingsAgentsView: View {
  @Bindable var session: AppSession
  let connectionID: ClientConnectionID?
  @Bindable var controller: SettingsHostInformationController
  let composition: SettingsComposition
  let refresh: () -> Void

  @State private var visibilityPresented = false
  @State private var selectedDistro: String?
  @State private var disabledAgents: [String] = []

  var body: some View {
    let presentation = session.settingsAgentReplayPresentation(
      for: connectionID,
      fallbackConnectionID: controller.lease?.connectionID,
      fallback: controller.agentStatuses
    )
    List {
      if controller.isDiscoveringAgents {
        Section {
          HStack(spacing: 10) {
            ProgressView()
            Text(SettingsUIStrings.discoveringAgents)
          }
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("native-e2e.settings.agents.discovering")
        }
      }
      agentAvailabilitySection
      modelVisibilitySection
      if !installedAgents.isEmpty {
        ProviderOrderSettingsSection(session: session, composition: composition, statuses: controller.agentStatuses)
      }
      replaySection(
        session.hosts.first(where: { $0.connectionId == connectionID })?.label ?? SettingsUIStrings.desktopSettingsTitle,
        environment: presentation.windows
      )
      replaySection(
        SettingsUIStrings.wsl,
        environment: presentation.wsl
      )
    }
    .accessibilityIdentifier("native-e2e.settings.agents.list")
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .refreshable {
      if let lease = composition.selection?.lease {
        let request = SettingsAgentDiscoveryRequest(wslDistros: visibilityScope.distro.map { [$0] } ?? [])
        await composition.refreshAgentSettings(request, lease: lease)
      }
    }
    .poracodeBottomBar {
      PoracodeBottomActionDock {
        PoracodeCircleButton(action: { beginDiscovery() }) { Image(systemName: "arrow.clockwise") }
        .accessibilityLabel(SettingsUIStrings.refreshDetectedAgents)
        .disabled(controller.isDiscoveringAgents || composition.isMutating || composition.gate(.sessionOperate) != nil)
        .accessibilityIdentifier("native-e2e.settings.agents.discover")
      }
    }
    .poracodeUseKeyboardLayoutGuide()
    .toolbar {
      if installedAgents.count > 1 {
        EditButton().disabled(composition.isMutating || session.composerPreferences.incompatible
          || !session.composerPreferences.machineProviderOrder.canEdit
          || (session.composerPreferences.machineProviderOrder.isSynced && composition.gate(.sessionOperate) != nil))
      }
    }
    .sheet(isPresented: $visibilityPresented) {
      if let lease = composition.selection?.lease {
        SettingsModelVisibilityView(catalog: visibilityCatalog,
          controller: .init(composition: composition, lease: lease))
      }
    }
    .onChange(of: composition.selection?.lease) {
      visibilityPresented = false
      selectedDistro = nil
    }
    .onChange(of: composition.document.document, initial: true) { _, document in
      guard let document else { return }
      disabledAgents = document.disabledAgents
    }
    .overlay(alignment: .bottom) {
      if case .failed(let failure) = controller.agentsState {
        SettingsRefreshFailureBanner(failure: failure, retry: refresh)
          .padding()
          .padding(.bottom, 68)
      }
    }
  }

  @discardableResult private func beginDiscovery() -> Task<Void, Never>? {
    guard let lease = composition.selection?.lease, controller.lease == lease,
      composition.gate(.sessionOperate) == nil else { return nil }
    let request = SettingsAgentDiscoveryRequest(wslDistros: visibilityScope.distro.map { [$0] } ?? [])
    return Task { await composition.discoverAgents(request, lease: lease) }
  }

  @ViewBuilder private var agentAvailabilitySection: some View {
    if !installedAgents.isEmpty {
      Section {
        ForEach(orderedAgents, id: \.kind) { agent in
          Toggle(isOn: Binding(get: { !disabledAgents.contains(agent.kind) },
            set: { setAgentEnabled($0, kind: agent.kind) })) {
            HStack(spacing: 10) {
              HomeProviderIcon(kind: agent.kind, agentLabel: agent.label).frame(width: 20, height: 20)
                .foregroundStyle(.secondary)
              Text(agent.label)
            }
          }
          .poracodeSwitchStyle()
          .accessibilityIdentifier("native-e2e.settings.agent-enabled.\(agent.kind)")
        }
      } header: { Text(ProviderSelectionStrings.enabledAgents) }
        footer: { Text(ProviderSelectionStrings.availabilityHint) }
        .disabled(composition.document.document == nil || composition.isMutating || composition.gate(.sessionOperate) != nil)
    }
  }

  private func setAgentEnabled(_ enabled: Bool, kind: String) {
    guard composition.document.document != nil, !composition.isMutating,
      composition.gate(.sessionOperate) == nil else { return }
    if enabled { disabledAgents.removeAll { $0 == kind } }
    else if !disabledAgents.contains(kind) { disabledAgents.append(kind) }
    let patch = SettingsPatch(values: [.disabledAgents: .array(disabledAgents.map(SettingsJSON.string))])
    Task {
      await composition.writeSettings(patch)
      if let authoritative = composition.document.document { disabledAgents = authoritative.disabledAgents }
    }
  }

  @ViewBuilder private var modelVisibilitySection: some View {
    let scope = visibilityScope
    let catalog = visibilityCatalog
    let hidden = catalog.effectiveHidden(saved: composition.document.document?.hiddenModels ?? [:])
    let count = ModelVisibilityStrings.count(ModelVisibilityCatalog.visibleCount(catalog.rows, hidden: hidden), total: catalog.rows.count)
    if !catalog.groups.isEmpty || !scope.distros.isEmpty {
      Section {
        if !scope.distros.isEmpty {
          Picker(ProviderOrderStrings.machine, selection: Binding(
            get: { scope.distro ?? "" }, set: { selectedDistro = $0.isEmpty ? nil : $0 }
          )) {
            Text(composition.selection?.name ?? SettingsUIStrings.desktopSettingsTitle).tag("")
            ForEach(scope.distros, id: \.self) { Text("\(SettingsUIStrings.wsl) · \($0)").tag($0) }
          }
          .accessibilityIdentifier("native-e2e.settings.models.machine")
        }
        Button { visibilityPresented = true } label: {
          LabeledContent(SettingsUIStrings.visibleModels) {
            Text(count)
              .monospacedDigit().foregroundStyle(.secondary)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
          }
          .foregroundStyle(.primary)
        }
        .disabled(composition.document.document == nil || catalog.groups.isEmpty)
        .accessibilityLabel(SettingsUIStrings.visibleModels)
        .accessibilityValue(count)
        .accessibilityIdentifier("native-e2e.settings.models.open")
      } footer: { Text(ModelVisibilityStrings.hint) }
    }
  }

  private var visibilityScope: SettingsAgentMachineScope {
    .init(statuses: controller.agentStatuses, preferredDistro: selectedDistro)
  }

  private var visibilityCatalog: ModelVisibilityCatalog {
    let scope = visibilityScope
    let machine = composition.selection.map { ProviderOrderMachine(connectionID: $0.lease.connectionID, distro: scope.distro) }
    let order = session.composerPreferences.machineProviderOrder.order(for: machine,
      fallback: composition.document.document?.providerOrder ?? [])
    return ModelVisibilityCatalog(agents: scope.agents, providerOrder: order)
  }

  private var installedAgents: [SettingsAgentStatus] {
    guard let statuses = controller.agentStatuses else { return [] }
    var seen = Set<String>()
    return (statuses.windows + statuses.wsl).filter { agent in
      agent.installed && seen.insert(agent.kind).inserted
    }
  }

  private var orderedAgents: [SettingsAgentStatus] {
    ComposerProviderCatalog.ordered(installedAgents, providerOrder: composition.document.document?.providerOrder ?? [], kind: { $0.kind })
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
          .accessibilityIdentifier("native-e2e.settings.agents.status.\(agent.id)")
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
