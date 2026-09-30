import SwiftUI

struct RemoteIntegrationsPRWatchEditor: View {
  @Environment(\.dismiss) private var dismiss

  let target: RemoteIntegrationsPRWatchEditorTarget
  let projects: [RemoteIntegrationsProjectOption]
  let agents: [AgentStatusRecord]
  let controller: RemoteIntegrationsPRWatchController

  @State private var draft: RemoteIntegrationsPRWatchDraft
  @State private var confirmingSave = false
  @State private var showValidationError = false

  init(
    target: RemoteIntegrationsPRWatchEditorTarget,
    projects: [RemoteIntegrationsProjectOption],
    agents: [AgentStatusRecord],
    controller: RemoteIntegrationsPRWatchController
  ) {
    self.target = target
    self.projects = projects
    self.agents = RemoteIntegrationsScheduleAgentCatalog.available(agents)
    self.controller = controller
    switch target {
    case .create(let key):
      var value = RemoteIntegrationsPRWatchDraft(projectId: key.projectId)
      value.prNumber = key.prNumber
      RemoteIntegrationsScheduleAgentCatalog.selectDefault(in: &value, agents: self.agents)
      _draft = State(initialValue: value)
    case .edit(let watch):
      _draft = State(initialValue: RemoteIntegrationsPRWatchDraft(watch))
    }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section(RemoteIntegrationsStrings.target) {
          LabeledContent(RemoteIntegrationsStrings.project) {
            Text(projectName)
              .privacySensitive(projectName == draft.projectId)
          }
          LabeledContent(RemoteIntegrationsStrings.prNumber) {
            Text(draft.prNumber, format: .number)
              .monospacedDigit()
          }
          TextField(RemoteIntegrationsStrings.headBranch, text: $draft.headBranch)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .privacySensitive()
          TextField(RemoteIntegrationsStrings.worktreePath, text: $draft.worktreePath)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .privacySensitive()
        }

        Section(RemoteIntegrationsStrings.automation) {
          Toggle(RemoteIntegrationsStrings.watchEnabled, isOn: $draft.watchEnabled)
          Toggle(RemoteIntegrationsStrings.autoMerge, isOn: $draft.autoMerge)
          if agents.isEmpty {
            TextField(RemoteIntegrationsStrings.agent, text: $draft.agentKind)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
          } else {
            Picker(RemoteIntegrationsStrings.agent, selection: $draft.agentKind) {
              ForEach(agentOptions) { option in Text(option.label).tag(option.id) }
            }
            .onChange(of: draft.agentKind) { _, agentKind in
              RemoteIntegrationsScheduleAgentCatalog.selectAgent(
                agentKind,
                in: &draft,
                agents: agents
              )
            }
          }

          if modelOptions.isEmpty {
            TextField(RemoteIntegrationsStrings.model, text: $draft.model)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
          } else {
            Picker(RemoteIntegrationsStrings.model, selection: $draft.model) {
              ForEach(modelOptions) { option in Text(option.label).tag(option.id) }
            }
            .onChange(of: draft.model) { _, model in
              RemoteIntegrationsScheduleAgentCatalog.selectModel(
                model,
                in: &draft,
                agents: agents
              )
            }
          }

          if effortOptions.isEmpty {
            TextField(RemoteIntegrationsStrings.effort, text: $draft.effort)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
          } else {
            Picker(RemoteIntegrationsStrings.effort, selection: $draft.effort) {
              Text(HomeStrings.auto).tag("")
              ForEach(effortOptions) { option in Text(option.label).tag(option.id) }
            }
          }
          Toggle(RemoteIntegrationsStrings.fastMode, isOn: $draft.fast)
        }

        if showValidationError {
          Section {
            Label(
              RemoteIntegrationsStrings.invalidFields,
              systemImage: "exclamationmark.triangle"
            )
            .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RemoteIntegrationsStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RemoteIntegrationsStrings.save) {
            showValidationError = !draft.isValid
            confirmingSave = draft.isValid
          }
          .disabled(controller.isMutating || !draft.isValid)
        }
      }
      .interactiveDismissDisabled(controller.isMutating)
      .confirmationDialog(
        confirmationTitle,
        isPresented: $confirmingSave,
        titleVisibility: .visible
      ) {
        Button(RemoteIntegrationsStrings.save) { submit() }
        Button(RemoteIntegrationsStrings.cancel, role: .cancel) {}
      }
    }
  }

  private var projectName: String {
    projects.first(where: { $0.id == draft.projectId })?.name ?? draft.projectId
  }

  private var agentOptions: [RemoteIntegrationsSchedulePickerOption] {
    RemoteIntegrationsScheduleAgentCatalog.agentOptions(
      agents,
      selectedKind: draft.agentKind
    )
  }

  private var modelOptions: [RemoteIntegrationsSchedulePickerOption] {
    RemoteIntegrationsScheduleAgentCatalog.modelOptions(
      agents,
      agentKind: draft.agentKind,
      selectedModel: draft.model
    )
  }

  private var effortOptions: [RemoteIntegrationsSchedulePickerOption] {
    RemoteIntegrationsScheduleAgentCatalog.effortOptions(
      agents,
      agentKind: draft.agentKind,
      model: draft.model,
      selectedEffort: draft.effort
    )
  }

  private var title: String {
    switch target {
    case .create: RemoteIntegrationsStrings.createPRWatch
    case .edit: RemoteIntegrationsStrings.editPRWatch
    }
  }

  private var confirmationTitle: String {
    switch target {
    case .create: RemoteIntegrationsStrings.confirmCreatePRWatch
    case .edit: RemoteIntegrationsStrings.confirmEditPRWatch
    }
  }

  private func submit() {
    guard let value = try? draft.value(), let lease = controller.lease else {
      showValidationError = true
      return
    }
    Task {
      await controller.upsert(value)
      guard controller.lease == lease, controller.mutationFailure == nil else { return }
      dismiss()
    }
  }
}
