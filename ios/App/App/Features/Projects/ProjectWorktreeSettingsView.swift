import SwiftUI

enum ProjectWorktreeLocationChoice: String, CaseIterable, Hashable, Identifiable {
  case desktopDefault
  case custom
  case projectRelative

  var id: Self { self }
}

struct ProjectWorktreeSettingsDraft: Equatable {
  var location: ProjectWorktreeLocationChoice
  var basePath: String
  var setupScript: String
  var cleanupScript: String
  var copyPatterns: String

  init(project: RemoteProject) {
    switch project.worktreeLocation?.mode {
    case .global: location = .custom
    case .projectRelative: location = .projectRelative
    case nil: location = .desktopDefault
    }
    basePath = project.worktreeLocation?.basePath ?? ""
    setupScript = project.scripts?.setupScript ?? ""
    cleanupScript = project.scripts?.cleanupScript ?? ""
    copyPatterns = (project.scripts?.worktreeCopyPatterns ?? []).joined(separator: "\n")
  }
}

struct ProjectWorktreeSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController

  @State private var settingsComposition: SettingsComposition
  @State private var draft: ProjectWorktreeSettingsDraft

  init(
    session: AppSession,
    project: RemoteProject,
    commandController: ProjectControllerCommandController
  ) {
    self.session = session
    self.project = project
    self.commandController = commandController
    _settingsComposition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway())
    )
    _draft = State(initialValue: ProjectWorktreeSettingsDraft(project: project))
  }

  var body: some View {
    Form {
      Section {
        Picker(ProjectSettingsStrings.worktreeLocation, selection: $draft.location) {
          ForEach(ProjectWorktreeLocationChoice.allCases) { choice in
            Text(ProjectSettingsStrings.locationChoice(choice)).tag(choice)
          }
        }

        if draft.location == .desktopDefault {
          LabeledContent(
            ProjectSettingsStrings.defaultValue,
            value: inheritedLocationLabel
          )
          if inheritedStorageMode == .global {
            LabeledContent(ProjectSettingsStrings.baseFolder) {
              Text(inheritedBasePath)
                .font(.body.monospaced())
                .foregroundStyle(.secondary)
            }
          }
        }

        if draft.location == .custom {
          TextField(
            ProjectSettingsStrings.baseFolder,
            text: $draft.basePath,
            prompt: Text(inheritedBasePath)
          )
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        }
      } footer: {
        Text(ProjectSettingsStrings.worktreeLocationDescription)
      }

      Section {
        scriptEditor(
          title: ProjectSettingsStrings.setupScript,
          text: $draft.setupScript
        )
      } footer: {
        Text(ProjectSettingsStrings.setupScriptDescription)
      }

      Section {
        scriptEditor(
          title: ProjectSettingsStrings.cleanupScript,
          text: $draft.cleanupScript
        )
      } footer: {
        Text(ProjectSettingsStrings.cleanupScriptDescription)
      }

      Section {
        scriptEditor(
          title: ProjectSettingsStrings.copyIgnoredFiles,
          text: $draft.copyPatterns
        )
      } footer: {
        Text(ProjectSettingsStrings.copyIgnoredFilesDescription)
      }
    }
    .navigationTitle(ProjectSettingsStrings.worktrees)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save) { save() }
          .disabled(commandController.state.isExecuting || !hasChanges)
      }
    }
    .refreshable { await settingsComposition.document.load() }
    .task(id: session.currentSettingsHostSelection?.lease) {
      settingsComposition.activate(session.currentSettingsHostSelection)
      await settingsComposition.document.load()
    }
  }

  private var inheritedStorageMode: SettingsWorktreeStorageMode {
    settingsComposition.document.document?.worktreeStorageMode ?? .global
  }

  private var inheritedLocationLabel: String {
    switch inheritedStorageMode {
    case .global: ProjectSettingsStrings.baseFolder
    case .projectRelative: ProjectSettingsStrings.insideProject
    }
  }

  private var inheritedBasePath: String {
    let document = settingsComposition.document.document
    let value =
      project.location.distro == nil
      ? document?.worktreeBasePath : document?.wslWorktreeBasePath
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return normalized.isEmpty ? "~/.poracode/worktrees" : normalized
  }

  private func scriptEditor(title: String, text: Binding<String>) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.subheadline.weight(.medium))
      TextEditor(text: text)
        .font(.body.monospaced())
        .frame(minHeight: 88)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityLabel(title)
    }
  }

  private var hasChanges: Bool {
    draft != ProjectWorktreeSettingsDraft(project: project)
  }

  private func save() {
    let originalScripts = project.scripts ?? ProjectScripts()
    var scripts = originalScripts
    scripts.setupScript = normalized(draft.setupScript)
    scripts.cleanupScript = normalized(draft.cleanupScript)
    let patterns = draft.copyPatterns
      .components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    scripts.worktreeCopyPatterns = patterns.isEmpty ? nil : patterns

    let nextLocation: ProjectWorktreeLocation?
    switch draft.location {
    case .desktopDefault:
      nextLocation = nil
    case .custom:
      nextLocation = ProjectWorktreeLocation(
        mode: .global,
        basePath: normalized(draft.basePath)
      )
    case .projectRelative:
      nextLocation = ProjectWorktreeLocation(mode: .projectRelative, basePath: nil)
    }

    let locationPatch: PatchValue<ProjectWorktreeLocation>
    if nextLocation == project.worktreeLocation {
      locationPatch = .unchanged
    } else if let nextLocation {
      locationPatch = .set(nextLocation)
    } else {
      locationPatch = .clear
    }

    let patch = ProjectPatch(
      scripts: scripts == originalScripts ? .unchanged : .set(scripts),
      worktreeLocation: locationPatch
    )
    Task {
      await commandController.perform(
        .update(projectId: project.id, patch: patch),
        detectSetup: false
      )
      if commandController.state.failure == nil { dismiss() }
    }
  }

  private func normalized(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
