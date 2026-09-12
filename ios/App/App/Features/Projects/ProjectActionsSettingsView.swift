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

struct ProjectActionsSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController

  @State private var actions: [ProjectAction]
  @State private var newName = ""
  @State private var newCommand = ""
  @State private var newIcon = "play"

  init(
    project: RemoteProject,
    commandController: ProjectControllerCommandController
  ) {
    self.project = project
    self.commandController = commandController
    _actions = State(initialValue: project.scripts?.actions ?? [])
  }

  var body: some View {
    Form {
      if !actions.isEmpty {
        Section {
          ForEach($actions, id: \.id) { $action in
            NavigationLink {
              ProjectActionEditor(action: $action)
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
          .onDelete { actions.remove(atOffsets: $0) }
        } header: {
          Text(ProjectSettingsStrings.actionsDescription)
            .textCase(nil)
        }
      }

      Section {
        TextField(ProjectSettingsStrings.actionName, text: $newName)
        TextField(ProjectSettingsStrings.actionCommand, text: $newCommand, axis: .vertical)
          .lineLimit(2...5)
          .font(.body.monospaced())
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        ProjectActionIconPicker(selection: $newIcon)
      } header: {
        if actions.isEmpty {
          Text(ProjectSettingsStrings.actionsDescription)
            .textCase(nil)
        }
      }
    }
    .contentMargins(.top, 0, for: .scrollContent)
    .navigationTitle(ProjectSettingsStrings.actions)
    .navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      PoracodeBottomActionBar {
        PoracodeCircleButton {
          save()
        } label: {
          Image(systemName: "checkmark")
        }
        .disabled(commandController.state.isExecuting || !hasValidChanges)
        .accessibilityLabel(ProjectManagementStrings.save)
      } trailing: {
        PoracodeCircleButton {
          addAction()
        } label: {
          Image(systemName: "plus")
        }
        .disabled(!canAdd)
        .accessibilityLabel(ProjectSettingsStrings.addAction)
      }
    }
  }

  private var canAdd: Bool {
    !newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !newCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var hasValidChanges: Bool {
    actions != (project.scripts?.actions ?? [])
      && actions.allSatisfy {
        !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          && !$0.command.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      }
  }

  private func addAction() {
    guard canAdd else { return }
    actions.append(
      ProjectAction(
        id: UUID().uuidString,
        name: newName.trimmingCharacters(in: .whitespacesAndNewlines),
        command: newCommand.trimmingCharacters(in: .whitespacesAndNewlines),
        icon: newIcon
      )
    )
    newName = ""
    newCommand = ""
    newIcon = "play"
  }

  private func save() {
    var scripts = project.scripts ?? ProjectScripts()
    scripts.actions = actions.map {
      ProjectAction(
        id: $0.id,
        name: $0.name.trimmingCharacters(in: .whitespacesAndNewlines),
        command: $0.command.trimmingCharacters(in: .whitespacesAndNewlines),
        icon: $0.icon
      )
    }
    Task {
      await commandController.perform(
        .update(
          projectId: project.id,
          patch: ProjectPatch(scripts: .set(scripts))
        ),
        detectSetup: false
      )
      if commandController.state.failure == nil { dismiss() }
    }
  }
}

private struct ProjectActionEditor: View {
  @Binding var action: ProjectAction

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
