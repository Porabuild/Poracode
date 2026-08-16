import SwiftUI

struct HomeProjectFilterOption: Identifiable, Sendable, Equatable {
  let id: String
  let connectionID: ClientConnectionID
  let project: RemoteProject
  let host: String
  let online: Bool
  let threadCount: Int
}

struct HomeProjectFilterMenu: View {
  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>

  @State private var presentation: HomeProjectFilterPresentation?

  var body: some View {
    PoracodeCircleButton(surface: .automatic) {
      presentation = .filter
    } label: {
      Image(
        systemName: selectedProjectIDs.isEmpty
          ? "line.3.horizontal.decrease"
          : "line.3.horizontal.decrease.circle.fill"
      )
    }
    .accessibilityLabel(HomeStrings.filterProjects)
    .accessibilityIdentifier("native-e2e.project-filter")
    .sheet(item: $presentation) { _ in
      HomeProjectFilterDrawer(
        session: session,
        options: options,
        selectedProjectIDs: $selectedProjectIDs
      )
    }
  }
}

private enum HomeProjectFilterPresentation: String, Identifiable {
  case filter

  var id: String { rawValue }
}

private struct HomeProjectFilterDrawer: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>

  @State private var projectActions: HomeProjectFilterOption?

  var body: some View {
    NavigationStack {
      List {
        allProjectsRow

        ForEach(options) { option in
          projectRow(option)
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(HomeStrings.filterProjects)
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.height(preferredHeight)])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
    .sheet(item: $projectActions) { option in
      HomeProjectActionsDrawer(session: session, option: option)
    }
  }

  private var preferredHeight: CGFloat {
    min(188 + CGFloat(options.count) * 58, 430)
  }

  private var allProjectsRow: some View {
    Button {
      selectedProjectIDs.removeAll()
    } label: {
      HStack(spacing: 12) {
        Image(systemName: "square.grid.2x2")
          .foregroundStyle(.secondary)
          .frame(width: 22)
        Text(HomeStrings.allProjects)
          .font(.subheadline)
        Spacer(minLength: 12)
        if selectedProjectIDs.isEmpty {
          Image(systemName: "checkmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(palette.accent)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
  }

  private func projectRow(_ option: HomeProjectFilterOption) -> some View {
    HStack(spacing: 8) {
      Button {
        toggle(option.id)
      } label: {
        HStack(spacing: 12) {
          Image(systemName: "server.rack")
            .foregroundStyle(.secondary)
            .frame(width: 22)
          VStack(alignment: .leading, spacing: 2) {
            Text(option.project.name)
              .font(.subheadline)
              .foregroundStyle(.primary)
              .lineLimit(1)
            HStack(spacing: 5) {
              Text(option.host)
              Text("•")
                .accessibilityHidden(true)
              Text(HomeStrings.threadCount(option.threadCount))
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
          }
          Spacer(minLength: 8)
          if selectedProjectIDs.contains(option.id) {
            Image(systemName: "checkmark")
              .font(.caption.weight(.semibold))
              .foregroundStyle(palette.accent)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity, alignment: .leading)

      Button {
        projectActions = option
      } label: {
        Image(systemName: "ellipsis")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.primary)
          .frame(width: 34, height: 34)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(ProjectManagementStrings.title)
      .accessibilityIdentifier("native-e2e.project-actions.\(option.id)")
    }
    .poracodeDrawerRowSurface()
  }

  private func toggle(_ id: String) {
    if selectedProjectIDs.contains(id) {
      selectedProjectIDs.remove(id)
    } else {
      selectedProjectIDs.insert(id)
    }
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }
}

private struct HomeProjectActionsDrawer: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let option: HomeProjectFilterOption

  @State private var destination: HomeProjectMenuDestination?
  @State private var confirmRemoval = false
  @State private var isSyncing = false

  var body: some View {
    NavigationStack {
      List {
        Section {
          Button {
            destination = .settings(option)
          } label: {
            HomeProjectActionLabel(
              ProjectManagementStrings.edit,
              systemImage: "slider.horizontal.3"
            )
          }
          .buttonStyle(.plain)

          NavigationLink {
            List {
              Section {
                Button {
                  destination = .gitChanges(option)
                } label: {
                  HomeProjectActionLabel(
                    HomeStrings.reviewChanges,
                    systemImage: "doc.text.magnifyingglass",
                    showsDisclosureIndicator: true
                  )
                }
                .buttonStyle(.plain)

                Button {
                  destination = .gitHubActions(option)
                } label: {
                  HomeProjectActionLabel(
                    HomeStrings.gitHubActions,
                    systemImage: "point.3.connected.trianglepath.dotted",
                    showsDisclosureIndicator: true
                  )
                }
                .buttonStyle(.plain)

                Button {
                  sync()
                } label: {
                  HStack(spacing: 12) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                      .foregroundStyle(.secondary)
                      .frame(width: 22)
                    Text(GitOperationsStrings.action(.gitSync))
                      .foregroundStyle(.primary)
                    Spacer(minLength: 0)
                    if isSyncing {
                      ProgressView()
                        .controlSize(.small)
                    }
                  }
                  .contentShape(Rectangle())
                  .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .disabled(isSyncing)
              }
              .poracodeDrawerRowSurface()
            }
            .poracodeDrawerListStyle()
            .font(.subheadline)
            .navigationTitle(ProjectWorkspaceStrings.git)
            .navigationBarTitleDisplayMode(.inline)
          } label: {
            HomeProjectActionLabel(
              ProjectWorkspaceStrings.git,
              systemImage: "arrow.triangle.branch"
            )
          }
          .buttonStyle(.plain)

          Button {
            session.projectSyncPreferences.setSynced(
              false,
              connectionID: option.connectionID,
              projectID: option.project.id
            )
            dismiss()
          } label: {
            HomeProjectActionLabel(
              ProjectManagementStrings.stopSyncing,
              systemImage: "eye.slash"
            )
          }
          .buttonStyle(.plain)
        }
        .poracodeDrawerRowSurface()

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
      .poracodeDrawerListStyle()
      .font(.subheadline)
      .navigationTitle(option.project.name)
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.height(302)])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
    .sheet(item: $destination) { destination in
      HomeProjectMenuDestinationView(session: session, destination: destination)
    }
    .confirmationDialog(
      ProjectManagementStrings.remove,
      isPresented: $confirmRemoval,
      titleVisibility: .visible
    ) {
      Button(ProjectManagementStrings.remove, role: .destructive) {
        perform(.remove(projectId: option.project.id))
        dismiss()
      }
      Button(ProjectManagementStrings.cancel, role: .cancel) {}
    } message: {
      Text(ProjectManagementStrings.removeConfirmation)
    }
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

  private var currentProject: RemoteProject {
    session.state.snapshot?.projects.first(where: { $0.id == option.project.id }) ?? option.project
  }
}

private struct HomeProjectActionLabel: View {
  let title: String
  let systemImage: String
  let showsDisclosureIndicator: Bool

  init(_ title: String, systemImage: String, showsDisclosureIndicator: Bool = false) {
    self.title = title
    self.systemImage = systemImage
    self.showsDisclosureIndicator = showsDisclosureIndicator
  }

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 22)
      Text(title)
        .foregroundStyle(.primary)
      Spacer(minLength: 0)
      if showsDisclosureIndicator {
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
    }
    .contentShape(Rectangle())
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private enum HomeProjectMenuDestination: Identifiable {
  case settings(HomeProjectFilterOption)
  case gitChanges(HomeProjectFilterOption)
  case gitHubActions(HomeProjectFilterOption)

  var id: String {
    switch self {
    case .settings(let option): "settings:\(option.id)"
    case .gitChanges(let option): "git-changes:\(option.id)"
    case .gitHubActions(let option): "git-hub-actions:\(option.id)"
    }
  }

  var option: HomeProjectFilterOption {
    switch self {
    case .settings(let option), .gitChanges(let option), .gitHubActions(let option): option
    }
  }
}

private struct HomeProjectMenuDestinationView: View {
  @Bindable var session: AppSession
  let destination: HomeProjectMenuDestination

  @State private var ready = false

  var body: some View {
    NavigationStack {
      if ready {
        switch destination {
        case .settings(let option):
          ProjectManagementView(
            session: session,
            embeddedInNavigationStack: true,
            initialProjectID: option.project.id
          )
        case .gitChanges(let option):
          ProjectWorkspaceSessionView(
            session: session,
            identity: ProjectIdentity(
              connectionId: option.connectionID,
              projectId: option.project.id
            ),
            location: currentProject(for: option).location,
            entryPoint: .workspace(.git)
          )
        case .gitHubActions(let option):
          ProjectWorkspaceSessionView(
            session: session,
            identity: ProjectIdentity(
              connectionId: option.connectionID,
              projectId: option.project.id
            ),
            location: currentProject(for: option).location,
            entryPoint: .gitHubActions
          )
        }
      } else {
        LoadingStateView(message: HomeStrings.loadingProjects)
      }
    }
    .task(id: destination.id) {
      let option = destination.option
      if session.selectedConnectionId != option.connectionID {
        await session.switchHost(option.connectionID)
      }
      ready = session.selectedConnectionId == option.connectionID
    }
  }

  private func currentProject(for option: HomeProjectFilterOption) -> RemoteProject {
    session.state.snapshot?.projects.first(where: { $0.id == option.project.id }) ?? option.project
  }
}
