import SwiftUI

struct RemoteIntegrationsScheduleEditor: View {
  @Environment(\.dismiss) private var dismiss

  let target: RemoteIntegrationsScheduleEditorTarget
  let projects: [RemoteIntegrationsProjectOption]
  let controller: RemoteIntegrationsSchedulesController

  @State private var draft: RemoteIntegrationsScheduleDraft
  @State private var confirmingSave = false
  @State private var showValidationError = false

  init(
    target: RemoteIntegrationsScheduleEditorTarget,
    projects: [RemoteIntegrationsProjectOption],
    controller: RemoteIntegrationsSchedulesController
  ) {
    self.target = target
    self.projects = projects
    self.controller = controller
    switch target {
    case .create:
      _draft = State(initialValue: RemoteIntegrationsScheduleDraft())
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
          TextField(RemoteIntegrationsStrings.agent, text: $draft.agentKind)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(RemoteIntegrationsStrings.model, text: $draft.model)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(RemoteIntegrationsStrings.effort, text: $draft.effort)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
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
