import SwiftUI

struct ProviderOrderSettingsSection: View {
  @Bindable var session: AppSession
  let composition: SettingsComposition
  let statuses: SettingsAgentStatuses?
  @State private var selectedDistro: String?
  @State private var pendingOrder: [String]?
  @State private var pendingID: UUID?
  @State private var saveFailed = false

  private var store: ComposerPreferencesStore { session.composerPreferences }
  private var preferences: ProviderOrderPreferences { store.machineProviderOrder }
  private var hostOrder: [String] { composition.document.document?.providerOrder ?? [] }
  private var machines: [ProviderOrderMachine] {
    guard let owner = composition.selection?.lease.connectionID else { return [] }
    let distros = Set((statuses?.wsl ?? []).compactMap { $0.payload.objectValue?["envDistro"]?.stringValue }.filter { !$0.isEmpty }).sorted()
    return [.init(connectionID: owner)] + distros.map { .init(connectionID: owner, distro: $0) }
  }
  private var machine: ProviderOrderMachine? { machines.first { $0.distro == selectedDistro } ?? machines.first }
  private var effectiveOrder: [String] { pendingOrder ?? preferences.order(for: machine, fallback: hostOrder) }
  private var agents: [SettingsAgentStatus] {
    let candidates: [SettingsAgentStatus]
    if preferences.isSynced { candidates = (statuses?.windows ?? []) + (statuses?.wsl ?? []) }
    else if let distro = machine?.distro {
      candidates = (statuses?.wsl ?? []).filter { $0.payload.objectValue?["envDistro"]?.stringValue == distro }
    } else { candidates = statuses?.windows ?? [] }
    var seen = Set<String>()
    return ComposerProviderCatalog.ordered(candidates.filter { $0.installed && seen.insert($0.kind).inserted },
      providerOrder: effectiveOrder, kind: { $0.kind })
  }
  private var canEdit: Bool {
    !store.incompatible && preferences.canEdit && composition.document.document != nil
      && !composition.isMutating && pendingID == nil
  }
  private var canReorder: Bool {
    canEdit && (preferences.isSynced ? composition.gate(.sessionOperate) == nil : machine.map { preferences.canEdit($0) } == true)
  }

  var body: some View {
    Section {
      Toggle(ProviderOrderStrings.sameOrder, isOn: Binding(get: { preferences.isSynced }, set: setSynced))
        .poracodeSwitchStyle()
        .disabled(!canEdit || (!preferences.isSynced
          && (!preferences.canLockToHostOrder || (effectiveOrder != hostOrder && composition.gate(.sessionOperate) != nil))))
        .accessibilityIdentifier("native-e2e.settings.provider-order.synced")
      if !preferences.isSynced, machines.count > 1 {
        Picker(ProviderOrderStrings.machine, selection: Binding(
          get: { machine?.id ?? "" },
          set: { value in selectedDistro = machines.first { $0.id == value }?.distro; saveFailed = false }
        )) {
          ForEach(machines) { target in
            Text(target.distro.map { "\(SettingsUIStrings.wsl) · \($0)" }
              ?? composition.selection?.name ?? SettingsUIStrings.desktopSettingsTitle).tag(target.id)
          }
        }
        .disabled(!canEdit)
        .accessibilityIdentifier("native-e2e.settings.provider-order.machine")
      }
      ForEach(agents, id: \.kind) { agent in
        Label(agent.label, systemImage: "line.3.horizontal")
          .accessibilityIdentifier("native-e2e.settings.provider-order.row.\(agent.kind)")
      }
      .onMove(perform: moveAgents)
      .moveDisabled(!canReorder)
      if !preferences.isSynced, let machine, preferences.hasOverride(for: machine) {
        Button(ProviderOrderStrings.reset) {
          guard canReorder else { return }
          saveFailed = !store.updateMachineProviderOrder { $0.setOrder([], for: machine) }
        }
        .disabled(!canReorder)
        .accessibilityIdentifier("native-e2e.settings.provider-order.reset")
      }
    } header: { Text(ProviderSelectionStrings.agentOrder) }
      footer: {
        VStack(alignment: .leading, spacing: 8) {
          Text(preferences.isSynced ? ProviderOrderStrings.syncedHint : ProviderOrderStrings.machineHint)
          if store.incompatible || !preferences.canEdit || machine.map({ !preferences.canEdit($0) }) == true {
            Text(ProviderOrderStrings.future)
          }
          if saveFailed { Text(ProviderOrderStrings.saveFailed) }
        }
      }
      .onChange(of: composition.selection?.lease) {
        selectedDistro = nil; pendingID = nil; pendingOrder = nil; saveFailed = false
      }
  }

  private func moveAgents(from offsets: IndexSet, to destination: Int) {
    guard canReorder, let machine else { return }
    var visible = agents.map(\.kind)
    guard offsets.allSatisfy({ visible.indices.contains($0) }), (0...visible.count).contains(destination) else { return }
    visible.move(fromOffsets: offsets, toOffset: destination)
    let visibleSet = Set(visible)
    let next = visible + effectiveOrder.filter { !visibleSet.contains($0) }
    if preferences.isSynced { writeHostOrder(next, adopting: nil) }
    else { saveFailed = !store.updateMachineProviderOrder { $0.setOrder(next, for: machine) } }
  }

  private func setSynced(_ value: Bool) {
    guard canEdit, value != preferences.isSynced else { return }
    if !value { saveFailed = !store.updateMachineProviderOrder { $0.setSynced(false) } }
    else if preferences.canLockToHostOrder {
      if effectiveOrder == hostOrder {
        saveFailed = !store.lockMachineProviderOrder(matching: preferences)
      } else if composition.gate(.sessionOperate) == nil {
        writeHostOrder(effectiveOrder, adopting: preferences)
      }
    }
  }

  private func writeHostOrder(_ order: [String], adopting snapshot: ProviderOrderPreferences?) {
    guard let lease = composition.selection?.lease, composition.gate(.sessionOperate) == nil else { return }
    let token = UUID()
    pendingID = token; pendingOrder = order; saveFailed = false
    Task {
      await composition.writeSettings(.init(values: [.providerOrder: .array(order.map(SettingsJSON.string))]))
      guard pendingID == token else { return }
      defer { pendingID = nil; pendingOrder = nil }
      guard composition.selection?.lease == lease, composition.document.state == .loaded,
        composition.document.document?.providerOrder == order,
        composition.mutationNotice == .saved || composition.mutationNotice == .ambiguousRefreshed else { return }
      if let snapshot {
        // Another window's newer local order must survive a slow host write.
        saveFailed = !store.lockMachineProviderOrder(matching: snapshot)
      }
    }
  }
}

enum ProviderOrderStrings {
  static var sameOrder: String { String(localized: "providerOrder.sameOrder", defaultValue: "Same provider order on all machines", table: "ProviderSelection") }
  static var machine: String { String(localized: "providerOrder.machine", defaultValue: "Machine", table: "ProviderSelection") }
  static var reset: String { String(localized: "providerOrder.reset", defaultValue: "Use host order for this machine", table: "ProviderSelection") }
  static var syncedHint: String { String(localized: "providerOrder.syncedHint", defaultValue: "Use the host's provider order. Turn off to arrange machines separately on this device.", table: "ProviderSelection") }
  static var machineHint: String { String(localized: "providerOrder.machineHint", defaultValue: "Reorder providers for this machine. Turning sharing on applies this order to the selected host and removes device-specific orders.", table: "ProviderSelection") }
  static var future: String { String(localized: "providerOrder.future", defaultValue: "Update this app to edit saved provider display preferences.", table: "ProviderSelection") }
  static var saveFailed: String { String(localized: "providerOrder.saveFailed", defaultValue: "Could not update display preferences. Reload and try again.", table: "ProviderSelection") }
}
