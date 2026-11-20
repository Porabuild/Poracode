import SwiftUI

struct SavedCrewEditorSheet: View {
  @Environment(\.dismiss) private var dismiss
  let target: SavedCrewEditorTarget
  @Bindable var controller: SavedCrewsController
  @Bindable var session: AppSession
  @State private var value: SavedCrew
  @State private var baseline: SavedCrew?

  init(target: SavedCrewEditorTarget, controller: SavedCrewsController, session: AppSession) {
    self.target = target
    self.controller = controller
    self.session = session
    _value = State(initialValue: target.value)
    _baseline = State(initialValue: target.baseline)
  }

  private var selection: SettingsHostSelection? { session.currentSettingsHostSelection }
  private var isSourceHost: Bool { selection?.lease.connectionID == target.lease.connectionID }
  private var operationLease: SettingsHostLease? {
    guard isSourceHost, let lease = selection?.lease, controller.selection?.lease == lease else { return nil }
    return lease
  }
  private var isSaving: Bool { operationLease != nil && controller.isMutating }
  private var canSave: Bool {
    operationLease != nil && selection?.gate(.sessionOperate) == nil && controller.canWrite
  }
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
        if !isSourceHost {
          Section { Text(CrewStrings.sourceHost).foregroundStyle(.secondary) }
        } else if let failure = selection?.gate(.sessionOperate) {
          Section { Text(SettingsUIStrings.failure(failure)).foregroundStyle(.secondary) }
        }
        if operationLease != nil, let failure = controller.failure {
          Section {
            Text(CrewStrings.failure(failure)).foregroundStyle(.secondary)
            if baseline != nil {
              Button(CrewStrings.reset) {
                guard !isSaving, let source = operationLease else { return }
                Task {
                  await controller.load()
                  guard operationLease == source,
                    let latest = controller.crews.first(where: { $0.id == value.id }) else { return }
                  value = latest; baseline = latest
                }
              }
              .disabled(isSaving)
            }
          }
        }
        Group {
          Section {
            HStack {
              TextField(CrewStrings.name, text: $value.name)
                .accessibilityIdentifier("native-e2e.crews.name")
              Text(value.name.utf16.count.formatted() + "/" + 40.formatted())
                .font(.caption)
                .foregroundStyle(value.name.utf16.count > 40 ? Color.red : Color.poracodeSecondaryLabel)
            }
          }
          CrewEditorSections(binding: binding, lead: $value.lead, catalog: target.catalog, showsFallbacks: true)
          if !isValid { Section { Text(CrewStrings.invalid).foregroundStyle(.secondary) } }
        }
        .disabled(operationLease == nil || isSaving)
      }
      .poracodeDrawerListStyle()
      .navigationTitle(CrewStrings.edit)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel, systemImage: "xmark") { dismiss() }
            .accessibilityLabel(RichChatStrings.cancel)
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.save, systemImage: "checkmark") {
            guard canSave, isValid, let source = operationLease else { return }
            let proposed = value, original = baseline
            Task {
              let applied = await controller.apply(.upsert(proposed, basedOn: original), lease: source)
              if applied, operationLease == source { dismiss() }
            }
          }
          .disabled(!canSave || !isValid)
          .accessibilityLabel(RichChatStrings.save)
          .accessibilityIdentifier("native-e2e.crews.save")
        }
      }
    }
    .interactiveDismissDisabled(isSaving)
  }
}
