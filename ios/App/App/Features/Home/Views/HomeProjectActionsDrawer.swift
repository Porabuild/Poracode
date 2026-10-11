import SwiftUI

struct HomeProjectActionsDrawer: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let option: HomeProjectFilterOption
  @Binding var selectedDetent: PresentationDetent

  @State private var destination: HomeProjectMenuDestination?
  @State private var confirmRemoval = false
  @State private var isSyncing = false

  var body: some View {
    List {
      Section {
        if !isHomeScope {
          Button(action: openSettings) {
            HomeProjectActionLabel(
              ProjectManagementStrings.edit,
              systemImage: "slider.horizontal.3"
            )
          }
          .buttonStyle(.plain)
        }

        Button(action: openTerminal) {
          HomeProjectActionLabel(
            TerminalStrings.shellOpen,
            systemImage: "terminal"
          )
        }
        .buttonStyle(.plain)

        if !isHomeScope {
          gitActionsLink

          ForEach(currentProject.scripts?.actions ?? [], id: \.id) { action in
            Button {
              destination = .projectAction(option, action)
            } label: {
              HomeProjectActionLabel(
                action.name,
                systemImage: ProjectActionIcon.symbol(action.icon)
              )
            }
            .buttonStyle(.plain)
          }

          Button(action: stopSyncing) {
            HomeProjectActionLabel(
              ProjectManagementStrings.stopSyncing,
              systemImage: "eye.slash"
            )
          }
          .buttonStyle(.plain)
        }
      }
      .poracodeDrawerRowSurface()

      if !isHomeScope {
        removalSection
      }
    }
    .poracodeDrawerListStyle()
    .font(.subheadline)
    .navigationTitle(option.project.name)
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $destination) { destination in
      HomeProjectMenuDestinationView(session: session, destination: destination)
    }
    .onChange(of: destination?.id) { _, destinationID in
      selectedDetent = destinationID == nil ? .height(preferredHeight) : .large
    }
    .confirmationDialog(
      ProjectManagementStrings.remove,
      isPresented: $confirmRemoval,
      titleVisibility: .visible
    ) {
      Button(ProjectManagementStrings.remove, role: .destructive, action: removeProject)
      Button(ProjectManagementStrings.cancel, role: .cancel) {}
    } message: {
      Text(ProjectManagementStrings.removeConfirmation)
    }
  }

  private var gitActionsLink: some View {
    NavigationLink {
      HomeProjectGitActionsView(
        isSyncing: isSyncing,
        openChanges: { destination = .gitChanges(option) },
        openGitHubActions: { destination = .gitHubActions(option) },
        sync: sync
      )
    } label: {
      HomeProjectActionLabel(
        ProjectWorkspaceStrings.git,
        systemImage: "arrow.triangle.branch"
      )
    }
    .buttonStyle(.plain)
  }

  private var removalSection: some View {
    Section {
      Button(role: .destructive) {
        confirmRemoval = true
      } label: {
        HStack(spacing: 12) {
          Image(systemName: "trash")
            .foregroundStyle(.secondary)
            .frame(width: 22)
          Text(ProjectManagementStrings.remove)
            .foregroundStyle(.red)
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
    }
    .poracodeDrawerRowSurface()
  }

  private var currentProject: RemoteProject {
    HomeProjectSnapshotResolver.project(
      connectionID: option.connectionID,
      projectID: option.project.id,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots,
      fallback: option.project
    )
  }

  private var preferredHeight: CGFloat {
    Self.preferredHeight(for: currentProject)
  }

  private var isHomeScope: Bool {
    option.project.id == RemoteProject.homeScopeID
  }

  static func preferredHeight(for project: RemoteProject) -> CGFloat {
    guard project.id != RemoteProject.homeScopeID else { return 220 }
    return min(380 + CGFloat(project.scripts?.actions.count ?? 0) * 48, 620)
  }

  private func openSettings() {
    destination = .settings(option)
  }

  private func openTerminal() {
    destination = .terminal(option)
  }

  private func stopSyncing() {
    session.projectSyncPreferences.setSynced(
      false,
      connectionID: option.connectionID,
      projectID: option.project.id
    )
    dismiss()
  }

  private func removeProject() {
    perform(.remove(projectId: option.project.id))
    dismiss()
  }

  private func perform(_ command: ProjectCommand) {
    Task {
      if session.selectedConnectionId != option.connectionID {
        await session.switchHost(option.connectionID)
      }
      guard let controllerSession = session.currentProjectControllerSession,
        controllerSession.lease.connectionId == option.connectionID
      else { return }

      let controller = ProjectControllerCommandController(
        gateway: session.makeProjectSessionGateway(),
        refreshScheduler: session.makeProjectRefreshScheduler()
      )
      controller.activate(
        controllerSession,
        projects: session.state.snapshot?.projects ?? [],
        snapshotSequence: session.state.lastSeenSeq
      )
      await controller.perform(command, detectSetup: false)
      if let failure = controller.state.failure {
        session.globalError = ProjectFailureText.message(for: failure)
      }
    }
  }

  private func sync() {
    guard !isSyncing else { return }
    isSyncing = true
    Task {
      defer { isSyncing = false }
      if session.selectedConnectionId != option.connectionID {
        await session.switchHost(option.connectionID)
      }

      let project = currentProject
      let source = ProjectWorkspaceSelectionSource(
        session: session,
        identity: ProjectIdentity(
          connectionId: option.connectionID,
          projectId: option.project.id
        ),
        location: project.location
      )
      let gateway = SelectedGitOperationsGateway { @MainActor [weak source] in
        source?.gitOperationsSelection
      }
      let controller = GitOperationsController(gateway: gateway)
      guard let context = source.gitOperationsContext else {
        session.globalError = GitOperationsStrings.unavailable
        return
      }

      controller.activate(context)
      await controller.submit(.gitSync(.init(projectLocation: project.location)))
      if let failure = controller.state.failure {
        session.globalError = GitOperationsStrings.failure(failure)
      } else {
        dismiss()
      }
      controller.deactivate()
    }
  }
}

private struct HomeProjectGitActionsView: View {
  let isSyncing: Bool
  let openChanges: () -> Void
  let openGitHubActions: () -> Void
  let sync: () -> Void

  var body: some View {
    List {
      Section {
        Button(action: openChanges) {
          HomeProjectActionLabel(
            HomeStrings.reviewChanges,
            systemImage: "doc.text.magnifyingglass",
            showsDisclosureIndicator: true
          )
        }
        .buttonStyle(.plain)

        Button(action: openGitHubActions) {
          HomeProjectActionLabel(
            HomeStrings.gitHubActions,
            systemImage: "point.3.connected.trianglepath.dotted",
            showsDisclosureIndicator: true
          )
        }
        .buttonStyle(.plain)

        Button(action: sync) {
          HStack(spacing: 12) {
            Image(systemName: "arrow.triangle.2.circlepath")
              .foregroundStyle(.secondary)
              .frame(width: 22)
            Text(GitOperationsStrings.action(.gitSync))
              .foregroundStyle(.primary)
            Spacer(minLength: 0)
            if isSyncing {
              ProgressView().controlSize(.small)
            }
          }
          .contentShape(Rectangle())
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .disabled(isSyncing)
      }
    }
    .poracodeDrawerRowSurface()
    .poracodeDrawerListStyle()
    .font(.subheadline)
    .navigationTitle(ProjectWorkspaceStrings.git)
    .navigationBarTitleDisplayMode(.inline)
  }
}
