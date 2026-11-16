import SwiftUI

struct SavedCrewEditorSheet: View {
  @Environment(\.dismiss) private var dismiss
  let target: SavedCrewEditorTarget
  @Bindable var controller: SavedCrewsController
  @State private var value: SavedCrew
  @State private var baseline: SavedCrew?
  @State private var operationLease: SettingsHostLease

  init(target: SavedCrewEditorTarget, controller: SavedCrewsController) {
    self.target = target
    self.controller = controller
    _value = State(initialValue: target.value)
    _baseline = State(initialValue: target.baseline)
    _operationLease = State(initialValue: target.lease)
  }

  private var ownsHost: Bool { controller.selection?.lease.connectionID == target.lease.connectionID }
  private var isValid: Bool {
    var normalized = value
    normalized.name = value.name.trimmingCharacters(in: CrewWire.whitespace)
    normalized.roles = CrewWire.normalized(value.roles)
    return normalized.isValid && normalized.roles.count == value.roles.count
  }
  private var binding: Binding<ThreadCrewBinding> {
    Binding(get: {
      .init(crewID: value.id, name: value.name, policy: value.policy, roles: value.roles)
    }, set: { value.policy = $0.policy; value.roles = $0.roles })
  }

  var body: some View {
    NavigationStack {
      Form {
        if !ownsHost {
          Section { Text(CrewStrings.sourceHost).foregroundStyle(.secondary) }
        }
        if let failure = controller.failure {
          Section {
            Text(CrewStrings.failure(failure)).foregroundStyle(.secondary)
            if baseline != nil {
              Button(CrewStrings.reset) {
                Task {
                  await controller.load()
                  guard ownsHost, let latest = controller.crews.first(where: { $0.id == value.id }) else { return }
                  value = latest; baseline = latest
                }
              }
              .disabled(!ownsHost || controller.isMutating)
            }
          }
        }
        Group {
          Section {
            HStack {
              TextField(CrewStrings.name, text: $value.name)
                .accessibilityIdentifier("native-e2e.crews.name")
              Text(value.name.utf16.count.formatted() + "/" + 40.formatted())
                .font(.caption).foregroundStyle(value.name.utf16.count > 40 ? Color.red : Color.secondary)
            }
          }
          CrewEditorSections(binding: binding, lead: $value.lead, catalog: target.catalog, showsFallbacks: true)
          if !isValid { Section { Text(CrewStrings.invalid).foregroundStyle(.secondary) } }
        }
        .disabled(!ownsHost || controller.isMutating)
      }
      .poracodeDrawerListStyle()
      .navigationTitle(CrewStrings.edit)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button(RichChatStrings.cancel) { dismiss() }.disabled(controller.isMutating) }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.save) {
            let proposed = value, source = operationLease, original = baseline
            Task {
              let applied = await controller.apply(.upsert(proposed, basedOn: original), lease: source)
              if applied { dismiss() }
            }
          }
          .disabled(!ownsHost || !controller.canWrite || !isValid)
          .accessibilityIdentifier("native-e2e.crews.save")
        }
      }
    }
    .interactiveDismissDisabled(controller.isMutating)
    .onChange(of: controller.selection?.lease) { _, lease in
      if let lease, lease.connectionID == target.lease.connectionID { operationLease = lease }
    }
  }
}
