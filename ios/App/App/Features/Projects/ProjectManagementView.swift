import SwiftUI

struct ProjectManagementView: View {
  @Bindable var session: AppSession

  @State private var commandController: ProjectControllerCommandController
  @State private var settingsController: ProjectControllerSettingsController
  @State private var directoryController: ProjectControllerDirectoryController
  @State private var notesController: ProjectControllerNotesController
  @State private var showingCreation = false
  @State private var actionProject: RemoteProject?
  @State private var removalProject: RemoteProject?
  private let embeddedInNavigationStack: Bool
  private let initialProjectID: String?

  init(
    session: AppSession,
    embeddedInNavigationStack: Bool = false,
    initialProjectID: String? = nil
  ) {
    self.session = session
    self.embeddedInNavigationStack = embeddedInNavigationStack
    self.initialProjectID = initialProjectID
    let gateway = session.makeProjectSessionGateway()
    _commandController = State(
      initialValue: ProjectControllerCommandController(
        gateway: gateway,
        refreshScheduler: session.makeProjectRefreshScheduler()
      )
    )
    _settingsController = State(
      initialValue: ProjectControllerSettingsController(gateway: gateway)
    )
    _directoryController = State(
      initialValue: ProjectControllerDirectoryController(gateway: gateway)
    )
    _notesController = State(initialValue: ProjectControllerNotesController(gateway: gateway))
  }

  @ViewBuilder
  var body: some View {
    Group {
      if let initialProjectID {
        projectDetail(initialProjectID)
      } else if embeddedInNavigationStack {
        projectList
      } else {
        NavigationSplitView {
          projectList
        } detail: {
          ContentUnavailableView(
            ProjectManagementStrings.selectProject,
            systemImage: "folder"
          )
        }
        .navigationSplitViewStyle(.balanced)
      }
    }
    .task(id: session.currentProjectControllerLease) {
      activateControllers()
    }
    .onChange(of: session.phase) {
      updateAccess()
    }
    .onChange(of: session.state.lastSeenSeq) {
      receiveSnapshot()
    }
    .onChange(of: session.state.snapshot?.projects) {
      receiveSnapshot()
    }
  }

  @ViewBuilder
  private func projectDetail(_ projectID: String) -> some View {
    if let project = commandController.state.projects.first(where: { $0.id == projectID })
      ?? managedProjects.first(where: { $0.id == projectID })
    {
      ProjectEditView(
        session: session,
        project: project,
        commandController: commandController,
        settingsController: settingsController,
        directoryController: directoryController,
        notesController: notesController
      )
    } else {
      LoadingStateView(message: ProjectManagementStrings.loading)
    }
  }

  private var projectList: some View {
    Group {
      if commandController.state.projects.isEmpty {
        ContentUnavailableView {
          Label(ProjectManagementStrings.noProjects, systemImage: "folder.badge.plus")
        } description: {
          if canManageProjects {
            Text(ProjectManagementStrings.emptyHint)
          }
        }
      } else {
        List(commandController.state.projects) { project in
          Button {
            actionProject = project
          } label: {
            ProjectManagementRow(
              project: project,
              isSynced: isSynced(project)
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(project.name)
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle(ProjectManagementStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(ProjectManagementStrings.add, systemImage: "plus") {
          showingCreation = true
        }
        .disabled(!canManageProjects)
      }
    }
    .sheet(isPresented: $showingCreation) {
      ProjectCreationView(
        controller: commandController,
        directoryController: directoryController
      )
    }
    .confirmationDialog(
      actionProject?.name ?? ProjectManagementStrings.title,
      isPresented: Binding(
        get: { actionProject != nil },
        set: { if !$0 { actionProject = nil } }
      ),
      titleVisibility: .visible
    ) {
      if let project = actionProject {
        Button(ProjectManagementStrings.edit) {
          editorProject = project
        }
        Button(
          isSynced(project)
            ? ProjectManagementStrings.excludeFromSync
            : ProjectManagementStrings.includeInSync
        ) {
          if let connectionId = session.selectedConnectionId {
            session.projectSyncPreferences.setSynced(
              !isSynced(project),
              connectionID: connectionId,
              projectID: project.id
            )
          }
        }
        Button(ProjectManagementStrings.remove, role: .destructive) {
          removalProject = project
        }
        Button(ProjectManagementStrings.cancel, role: .cancel) {}
      }
    }
    .confirmationDialog(
      removalProject.map { ProjectManagementStrings.removeConfirmTitle($0.name) }
        ?? ProjectManagementStrings.remove,
      isPresented: Binding(
        get: { removalProject != nil },
        set: { if !$0 { removalProject = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(ProjectManagementStrings.remove, role: .destructive) {
        if let project = removalProject {
          Task {
            await commandController.perform(.remove(projectId: project.id), detectSetup: false)
          }
        }
        removalProject = nil
      }
      Button(ProjectManagementStrings.cancel, role: .cancel) {
        removalProject = nil
      }
    } message: {
      if let project = removalProject {
        Text(ProjectManagementStrings.removeConfirmMessage(project.name))
      }
    }
    .navigationDestination(item: $editorProject) { project in
      ProjectEditView(
        session: session,
        project: project,
        commandController: commandController,
        settingsController: settingsController,
        directoryController: directoryController,
        notesController: notesController
      )
    }
    .overlay(alignment: .bottom) {
      if let failure = commandController.state.failure {
        ProjectFailureBanner(failure: failure)
          .padding()
      } else if let notice = availabilityNotice {
        Text(notice)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .padding()
      }
    }
  }

  /// The PWA mobile list keeps the full editor as iOS-native depth, reached
  /// from the row action sheet instead of the row itself.
  @State private var editorProject: RemoteProject?

  private func isSynced(_ project: RemoteProject) -> Bool {
    session.selectedConnectionId.map {
      session.projectSyncPreferences.isSynced(connectionID: $0, projectID: project.id)
    } ?? true
  }

  private var canManageProjects: Bool {
    session.currentProjectControllerSession?.gate(.projectsManage) == nil
  }

  private var availabilityNotice: String? {
    guard let controllerSession = session.currentProjectControllerSession else { return nil }
    if !controllerSession.isOnline { return ProjectManagementStrings.offlineNotice }
    if controllerSession.gate(.projectsManage) != nil {
      return ProjectManagementStrings.noManageScopeNotice
    }
    return nil
  }

  private func activateControllers() {
    guard let controllerSession = session.currentProjectControllerSession else { return }
    commandController.activate(
      controllerSession,
      projects: managedProjects,
      snapshotSequence: session.state.lastSeenSeq
    )
    settingsController.activate(controllerSession)
    directoryController.activate(controllerSession)
    notesController.activate(controllerSession)
  }

  private func updateAccess() {
    guard let controllerSession = session.currentProjectControllerSession else { return }
    commandController.updateAccess(controllerSession)
    settingsController.activate(controllerSession)
    directoryController.updateAccess(controllerSession)
    notesController.activate(controllerSession)
  }

  private func receiveSnapshot() {
    guard let lease = session.currentProjectControllerLease else { return }
    commandController.receiveSnapshot(
      projects: managedProjects,
      sequence: session.state.lastSeenSeq,
      lease: lease
    )
  }

  private var managedProjects: [RemoteProject] {
    (session.state.snapshot?.projects ?? []).sorted {
      $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
  }
}

private struct ProjectManagementRow: View {
  let project: RemoteProject
  let isSynced: Bool

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: project.disabled == true ? "folder.badge.minus" : "folder")
        .foregroundStyle(project.disabled == true ? Color.secondary : Color.accentColor)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(project.name)
          .font(.body.weight(.medium))
        Text(project.location.displayPath)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
      if project.disabled == true {
        Text(ProjectManagementStrings.disabled)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      if !isSynced {
        Text(ProjectManagementStrings.notSynced)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
  }
}

struct ProjectFailureBanner: View {
  let failure: ProjectOperationFailure

  var body: some View {
    Label(ProjectFailureText.message(for: failure), systemImage: "exclamationmark.triangle")
      .font(.footnote)
      .padding(12)
      .frame(maxWidth: .infinity)
      .poracodeGlassBackground()
      .accessibilityElement(children: .combine)
  }
}

enum ProjectFailureText {
  static func message(for failure: ProjectOperationFailure) -> String {
    switch failure {
    case .offline:
      String(localized: "projects.error.offline", defaultValue: "This desktop is offline.")
    case .notReady:
      String(localized: "projects.error.notReady", defaultValue: "The desktop is still connecting.")
    case .busy:
      String(
        localized: "projects.error.busy",
        defaultValue: "Another project operation is running."
      )
    case .capabilityMissing, .authorizationMissingScope:
      String(
        localized: "projects.error.missingPermission",
        defaultValue: "This connection does not have permission to manage projects."
      )
    case .authenticationExpired:
      String(localized: "projects.error.expired", defaultValue: "Reconnect to this desktop.")
    case .authorizationDenied:
      String(localized: "projects.error.denied", defaultValue: "The desktop denied this operation.")
    case .ambiguousOutcome:
      String(
        localized: "projects.error.ambiguous",
        defaultValue: "The result is uncertain. Refresh before trying again."
      )
    case .invalidResponse, .transport, .rejected:
      ProjectManagementStrings.unknownError
    }
  }
}
