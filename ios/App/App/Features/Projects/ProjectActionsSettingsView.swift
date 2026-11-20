import SwiftUI

enum ProjectActionIcon {
  static let tokens = [
    "play", "terminal", "rocket", "hammer", "wrench", "cog", "zap", "bug",
    "test-tube", "gauge", "package", "upload", "server", "database", "globe",
    "file-code", "file-text", "braces",
  ]

  static func symbol(_ token: String?) -> String {
    switch token {
    case "terminal": "terminal"
    case "rocket": "paperplane"
    case "hammer": "hammer"
    case "wrench": "wrench.and.screwdriver"
    case "cog": "gearshape"
    case "zap": "bolt"
    case "bug": "ant"
    case "test-tube": "testtube.2"
    case "gauge": "gauge.with.dots.needle.67percent"
    case "package": "shippingbox"
    case "upload": "arrow.up.circle"
    case "server": "server.rack"
    case "database": "cylinder"
    case "globe": "globe"
    case "file-code": "doc.badge.gearshape"
    case "file-text": "doc.text"
    case "braces": "curlybraces"
    default: "play"
    }
  }
}

@MainActor @Observable
final class ProjectActionsDraft {
  let identity: ProjectIdentity
  let lease: ProjectControllerHostLease
  let location: ProjectLocation
  private var originalActions: [ProjectAction]

  var actions: [ProjectAction]
  var newName = ""
  var newCommand = ""
  var newIcon = "play"
  var isSaving = false
  var failure: ProjectOperationFailure?

  init(project: RemoteProject, lease: ProjectControllerHostLease) {
    identity = ProjectIdentity(connectionId: lease.connectionId, projectId: project.id)
    location = project.location
    self.lease = lease
    let initialActions = project.scripts?.actions ?? []
    originalActions = initialActions
    actions = initialActions
  }

  var canAdd: Bool { !newName.actionTrimmed.isEmpty && !newCommand.actionTrimmed.isEmpty }

  func addAction() {
    guard canAdd, !isSaving else { return }
    actions.append(ProjectAction(
      id: UUID().uuidString, name: newName.actionTrimmed,
      command: newCommand.actionTrimmed, icon: newIcon
    ))
    newName = ""
    newCommand = ""
    newIcon = "play"
  }

  func acknowledge(_ scripts: ProjectScripts) {
    originalActions = scripts.actions
    actions = scripts.actions
  }

  func scriptsToSave(for current: RemoteProject) -> ProjectScripts? {
    guard current.id == identity.projectId, current.location == location,
      actions != originalActions, newName.actionTrimmed.isEmpty, newCommand.actionTrimmed.isEmpty,
      actions.allSatisfy({ !$0.name.actionTrimmed.isEmpty && !$0.command.actionTrimmed.isEmpty })
    else { return nil }

    let baseline = current.scripts ?? ProjectScripts()
    var result = baseline
    let draftIDs = Set(actions.map(\.id))
    let removed = Set(originalActions.lazy.map(\.id).filter { !draftIDs.contains($0) })
    result.actions.removeAll { removed.contains($0.id) }
    for action in actions {
      let original = originalActions.first { $0.id == action.id }
      guard action != original else { continue }
      if let index = result.actions.firstIndex(where: { $0.id == action.id }) {
        if action.name != original?.name { result.actions[index].name = action.name.actionTrimmed }
        if action.command != original?.command { result.actions[index].command = action.command.actionTrimmed }
        if original == nil || action.icon != original?.icon { result.actions[index].icon = action.icon }
      } else {
        result.actions.append(ProjectAction(
          id: action.id, name: action.name.actionTrimmed, command: action.command.actionTrimmed,
          icon: action.icon
        ))
      }
    }
    return result == baseline ? nil : result
  }
}

private extension String {
  var actionTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

struct ProjectActionsSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  @Bindable var commandController: ProjectControllerCommandController
  @State private var draft: ProjectActionsDraft

  init(
    session: AppSession, project: RemoteProject, lease: ProjectControllerHostLease,
    commandController: ProjectControllerCommandController
  ) {
    self.session = session
    self.commandController = commandController
    _draft = State(initialValue: ProjectActionsDraft(project: project, lease: lease))
  }

  var body: some View {
    Form {
      if let failure = draft.failure {
        Section { ProjectFailureBanner(failure: failure) }
      }
      if !draft.actions.isEmpty {
        Section {
          ForEach($draft.actions, id: \.id) { $action in
            NavigationLink {
              ProjectActionEditor(action: $action, canEdit: canWrite && !draft.isSaving)
            } label: {
              Label {
                VStack(alignment: .leading, spacing: 2) {
                  Text(action.name)
                  Text(action.command)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
              } icon: {
                Image(systemName: ProjectActionIcon.symbol(action.icon))
                  .foregroundStyle(.secondary)
              }
            }
          }
          .onDelete(perform: canWrite && !draft.isSaving ? { draft.actions.remove(atOffsets: $0) } : nil)
        } header: {
          Text(ProjectSettingsStrings.actionsDescription)
            .textCase(nil)
        }
      }

      Section {
        TextField(ProjectSettingsStrings.actionName, text: $draft.newName)
          .accessibilityIdentifier("native-e2e.project-actions.new-name")
        TextField(ProjectSettingsStrings.actionCommand, text: $draft.newCommand, axis: .vertical)
          .lineLimit(2...5)
          .font(.body.monospaced())
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .accessibilityIdentifier("native-e2e.project-actions.new-command")
        ProjectActionIconPicker(selection: $draft.newIcon)
      } header: {
        if draft.actions.isEmpty {
          Text(ProjectSettingsStrings.actionsDescription)
            .textCase(nil)
        }
      }
      .disabled(!canWrite || draft.isSaving)
    }
    .contentMargins(.top, 0, for: .scrollContent)
    .poracodeReadableListMargins(760)
    .navigationTitle(ProjectSettingsStrings.actions)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button(ProjectManagementStrings.save, systemImage: draft.isSaving ? "hourglass" : "checkmark") {
          Task { await save() }
        }
        .disabled(!canWrite || draft.isSaving || commandController.state.isExecuting
          || commandController.state.isRunningSetupFollowUp || scriptsToSave == nil)
        .accessibilityIdentifier("native-e2e.project-actions.save")
        Button(ProjectSettingsStrings.addAction, systemImage: "plus") { draft.addAction() }
          .disabled(!canWrite || draft.isSaving || !draft.canAdd)
          .accessibilityIdentifier("native-e2e.project-actions.add")
      }
    }
    .onChange(of: session.currentProjectControllerLease) { _, lease in
      if let lease, lease != draft.lease { dismiss() }
    }
  }

  private var canWrite: Bool {
    session.currentProjectControllerLease == draft.lease
      && commandController.state.session?.lease == draft.lease
      && commandController.state.session?.gate(.projectsManage) == nil
  }

  private var scriptsToSave: ProjectScripts? {
    // The project list may be behind a pushed settings screen. Its command
    // controller can hold an older row while the session receives snapshots.
    session.state.snapshot?.projects.first { $0.id == draft.identity.projectId }
      .flatMap(draft.scriptsToSave)
  }

  private func save() async {
    guard canWrite, !draft.isSaving, let scripts = scriptsToSave else { return }
    draft.isSaving = true
    draft.failure = nil
    let accepted = await commandController.perform(
      .update(projectId: draft.identity.projectId, patch: ProjectPatch(scripts: .set(scripts))),
      detectSetup: false, expectedLease: draft.lease
    )
    draft.isSaving = false
    guard session.currentProjectControllerLease == draft.lease else { return }
    if accepted {
      draft.acknowledge(scripts)
      dismiss()
    } else {
      draft.failure = commandController.state.failure ?? .notReady
    }
  }
}

private struct ProjectActionEditor: View {
  @Binding var action: ProjectAction
  let canEdit: Bool

  var body: some View {
    Form {
      TextField(ProjectSettingsStrings.actionName, text: $action.name)
      TextField(ProjectSettingsStrings.actionCommand, text: $action.command, axis: .vertical)
        .lineLimit(3...8)
        .font(.body.monospaced())
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      ProjectActionIconPicker(
        selection: Binding(
          get: { action.icon ?? "play" },
          set: { action.icon = $0 }
        )
      )
    }
    .disabled(!canEdit)
    .poracodeReadableListMargins(760)
    .navigationTitle(action.name.isEmpty ? ProjectSettingsStrings.actions : action.name)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct ProjectActionIconPicker: View {
  @Binding var selection: String

  var body: some View {
    Menu {
      ForEach(ProjectActionIcon.tokens, id: \.self) { token in
        Button {
          selection = token
        } label: {
          Label {
            Text(verbatim: token)
          } icon: {
            Image(systemName: ProjectActionIcon.symbol(token))
          }
        }
      }
    } label: {
      HStack {
        Text(ProjectSettingsStrings.icon)
          .foregroundStyle(.primary)
        Spacer()
        Image(systemName: ProjectActionIcon.symbol(selection))
          .foregroundStyle(.secondary)
        Image(systemName: "chevron.up.chevron.down")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .tint(.secondary)
    .accessibilityLabel(ProjectSettingsStrings.icon)
    .accessibilityValue(selection)
  }
}
