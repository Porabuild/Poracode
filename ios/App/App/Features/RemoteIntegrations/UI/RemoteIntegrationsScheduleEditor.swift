import SwiftUI

struct RemoteIntegrationsScheduleEditor: View {
  @Environment(\.dismiss) private var dismiss

  let target: RemoteIntegrationsScheduleEditorTarget
  let projects: [RemoteIntegrationsProjectOption]
  let agents: [AgentStatusRecord]
  let controller: RemoteIntegrationsSchedulesController

  @State private var draft: RemoteIntegrationsScheduleDraft
  @State private var confirmingSave = false
  @State private var showValidationError = false

  init(
    target: RemoteIntegrationsScheduleEditorTarget,
    projects: [RemoteIntegrationsProjectOption],
    agents: [AgentStatusRecord],
    controller: RemoteIntegrationsSchedulesController
  ) {
    self.target = target
    self.projects = projects
    self.agents = RemoteIntegrationsScheduleAgentCatalog.available(agents)
    self.controller = controller
    switch target {
    case .create:
      var value = RemoteIntegrationsScheduleDraft()
      RemoteIntegrationsScheduleAgentCatalog.selectDefault(in: &value, agents: self.agents)
      _draft = State(initialValue: value)
    case .edit(let task):
      _draft = State(initialValue: RemoteIntegrationsScheduleDraft(task))
    }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section(RemoteIntegrationsStrings.details) {
          Toggle(RemoteIntegrationsStrings.enabled, isOn: $draft.enabled)
          TextField(RemoteIntegrationsStrings.scheduleName, text: $draft.name)
            .textInputAutocapitalization(.sentences)
          Picker(RemoteIntegrationsStrings.project, selection: $draft.projectId) {
            Text(RemoteIntegrationsStrings.home).tag(String?.none)
            ForEach(projects) { project in
              Text(project.name).tag(String?.some(project.id))
            }
          }
        }

        Section(RemoteIntegrationsStrings.prompt) {
          TextEditor(text: $draft.prompt)
            .frame(minHeight: 120)
            .privacySensitive()
        }

        Section(RemoteIntegrationsStrings.configuration) {
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

        Section(RemoteIntegrationsStrings.recurrence) {
          Picker(RemoteIntegrationsStrings.recurrence, selection: $draft.recurrenceKind) {
            Text(RemoteIntegrationsStrings.hourly).tag(RemoteIntegrationsRecurrenceKind.hourly)
            Text(RemoteIntegrationsStrings.weekly).tag(RemoteIntegrationsRecurrenceKind.weekly)
            Text(RemoteIntegrationsStrings.once).tag(RemoteIntegrationsRecurrenceKind.once)
          }
          recurrenceControls
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

  @ViewBuilder
  private var recurrenceControls: some View {
    switch draft.recurrenceKind {
    case .hourly:
      Stepper(value: $draft.minute, in: 0...59) {
        LabeledContent(RemoteIntegrationsStrings.minute) {
          Text(draft.minute, format: .number)
            .monospacedDigit()
        }
      }
    case .weekly:
      VStack(alignment: .leading, spacing: 8) {
        Text(RemoteIntegrationsStrings.days)
          .font(.caption)
          .foregroundStyle(.secondary)
        ViewThatFits(in: .horizontal) {
          HStack { weekdayToggles }
          VStack(alignment: .leading) { weekdayToggles }
        }
      }
      DatePicker(
        RemoteIntegrationsStrings.time,
        selection: $draft.weeklyTime,
        displayedComponents: .hourAndMinute
      )
    case .once:
      DatePicker(
        RemoteIntegrationsStrings.runAt,
        selection: $draft.onceDate,
        displayedComponents: [.date, .hourAndMinute]
      )
    }
  }

  @ViewBuilder
  private var weekdayToggles: some View {
    ForEach(Array(Calendar.current.shortWeekdaySymbols.enumerated()), id: \.offset) { day, label in
      Toggle(
        label,
        isOn: Binding(
          get: { draft.weeklyDays.contains(day) },
          set: { selected in
            if selected { draft.weeklyDays.insert(day) } else { draft.weeklyDays.remove(day) }
          }
        )
      )
      .toggleStyle(.button)
      .accessibilityLabel(label)
    }
  }

  private var title: String {
    switch target {
    case .create: RemoteIntegrationsStrings.createSchedule
    case .edit: RemoteIntegrationsStrings.editSchedule
    }
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

  private var confirmationTitle: String {
    switch target {
    case .create: RemoteIntegrationsStrings.confirmCreateSchedule
    case .edit: RemoteIntegrationsStrings.confirmEditSchedule
    }
  }

  private func submit() {
    guard let value = try? draft.value(), let lease = controller.lease else {
      showValidationError = true
      return
    }
    let command: RemoteIntegrationsScheduleCommand
    switch target {
    case .create: command = .create(value)
    case .edit(let task): command = .update(id: task.id, task: value)
    }
    Task {
      await controller.perform(command)
      guard controller.lease == lease, controller.mutationFailure == nil else { return }
      dismiss()
    }
  }
}

struct RemoteIntegrationsSchedulePickerOption: Identifiable, Equatable {
  let id: String
  let label: String
}

enum RemoteIntegrationsScheduleAgentCatalog {
  static func available(_ agents: [AgentStatusRecord]) -> [AgentStatusRecord] {
    var kinds = Set<String>()
    return agents.filter { kinds.insert($0.kind).inserted }
  }

  static func selectDefault(
    in draft: inout RemoteIntegrationsScheduleDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first else { return }
    selectAgent(agent.kind, in: &draft, agents: agents)
  }

  static func selectDefault(
    in draft: inout RemoteIntegrationsPRWatchDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first else { return }
    selectAgent(agent.kind, in: &draft, agents: agents)
  }

  static func defaultConfiguration(
    for agent: AgentStatusRecord
  ) -> RemoteIntegrationsAgentConfig? {
    guard let model = models(agent).first?.modelID else { return nil }
    return RemoteIntegrationsAgentConfig(
      model: model,
      effort: defaultEffort(agent, model: model)
    )
  }

  static func selectAgent(
    _ agentKind: String,
    in draft: inout RemoteIntegrationsScheduleDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first(where: { $0.kind == agentKind }) else { return }
    draft.agentKind = agent.kind
    draft.model = models(agent).first?.modelID ?? ""
    draft.effort = defaultEffort(agent, model: draft.model) ?? ""
    draft.fast = false
  }

  static func selectAgent(
    _ agentKind: String,
    in draft: inout RemoteIntegrationsPRWatchDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first(where: { $0.kind == agentKind }) else { return }
    draft.agentKind = agent.kind
    draft.model = models(agent).first?.modelID ?? ""
    draft.effort = defaultEffort(agent, model: draft.model) ?? ""
    draft.fast = false
  }

  static func selectModel(
    _ model: String,
    in draft: inout RemoteIntegrationsScheduleDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first(where: { $0.kind == draft.agentKind }) else { return }
    draft.model = model
    let valid = Set(efforts(agent, model: model))
    if !draft.effort.isEmpty, !valid.contains(draft.effort) {
      draft.effort = defaultEffort(agent, model: model) ?? ""
    }
    let fastModels =
      HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)[
        "fastModels"
      ]?.arrayValue?.compactMap(\.stringValue) ?? []
    if !fastModels.contains(model) { draft.fast = false }
  }

  static func selectModel(
    _ model: String,
    in draft: inout RemoteIntegrationsPRWatchDraft,
    agents: [AgentStatusRecord]
  ) {
    guard let agent = agents.first(where: { $0.kind == draft.agentKind }) else { return }
    draft.model = model
    let valid = Set(efforts(agent, model: model))
    if !draft.effort.isEmpty, !valid.contains(draft.effort) {
      draft.effort = defaultEffort(agent, model: model) ?? ""
    }
    let fastModels =
      HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)[
        "fastModels"
      ]?.arrayValue?.compactMap(\.stringValue) ?? []
    if !fastModels.contains(model) { draft.fast = false }
  }

  static func agentOptions(
    _ agents: [AgentStatusRecord],
    selectedKind: String
  ) -> [RemoteIntegrationsSchedulePickerOption] {
    var values = agents.map { RemoteIntegrationsSchedulePickerOption(id: $0.kind, label: $0.label) }
    if !selectedKind.isEmpty, !values.contains(where: { $0.id == selectedKind }) {
      values.insert(.init(id: selectedKind, label: selectedKind), at: 0)
    }
    return values
  }

  static func modelOptions(
    _ agents: [AgentStatusRecord],
    agentKind: String,
    selectedModel: String
  ) -> [RemoteIntegrationsSchedulePickerOption] {
    var values =
      agents.first(where: { $0.kind == agentKind }).map(models)?.map {
        RemoteIntegrationsSchedulePickerOption(id: $0.modelID, label: $0.label)
      } ?? []
    if !selectedModel.isEmpty, !values.contains(where: { $0.id == selectedModel }) {
      values.insert(.init(id: selectedModel, label: selectedModel), at: 0)
    }
    return values
  }

  static func effortOptions(
    _ agents: [AgentStatusRecord],
    agentKind: String,
    model: String,
    selectedEffort: String
  ) -> [RemoteIntegrationsSchedulePickerOption] {
    var values =
      agents.first(where: { $0.kind == agentKind }).map {
        efforts($0, model: model).map {
          RemoteIntegrationsSchedulePickerOption(id: $0, label: $0.capitalized)
        }
      } ?? []
    if !selectedEffort.isEmpty, !values.contains(where: { $0.id == selectedEffort }) {
      values.insert(.init(id: selectedEffort, label: selectedEffort.capitalized), at: 0)
    }
    return values
  }

  private static func models(_ agent: AgentStatusRecord) -> [HomeComposerModel] {
    HomeComposerCatalog.models(for: agent, presentationMode: .gui)
  }

  private static func efforts(_ agent: AgentStatusRecord, model: String) -> [String] {
    let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)
    let scoped =
      capabilities["modelEfforts"]?.objectValue?[model]?.arrayValue?
      .compactMap(\.stringValue) ?? []
    return scoped.isEmpty
      ? capabilities["efforts"]?.arrayValue?.compactMap(\.stringValue) ?? []
      : scoped
  }

  private static func defaultEffort(_ agent: AgentStatusRecord, model: String) -> String? {
    let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)
    return capabilities["modelDefaultEfforts"]?.objectValue?[model]?.stringValue
      ?? capabilities["defaultEffort"]?.stringValue
  }
}
