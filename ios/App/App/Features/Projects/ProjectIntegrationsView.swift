import SwiftUI

struct ProjectIntegrationsView: View {
  let project: RemoteProject
  let identity: ProjectIdentity
  @Bindable var settingsController: ProjectControllerSettingsController
  @Bindable var commandController: ProjectControllerCommandController

  @State private var servers: [ProjectMCPServer] = []

  var body: some View {
    Group {
      switch settingsController.loadStateByProject[identity] ?? .idle {
      case .idle, .loading:
        LoadingStateView(message: ProjectManagementStrings.loading)
      case .empty:
        EmptyStateView(title: ProjectManagementStrings.noIntegrations, systemImage: "puzzlepiece")
      case .failed(let failure):
        ErrorStateView(
          message: ProjectFailureText.message(for: failure),
          retryTitle: ProjectManagementStrings.retry
        ) {
          Task { await settingsController.load(identity) }
        }
      case .loaded:
        if servers.isEmpty {
          EmptyStateView(
            title: ProjectManagementStrings.noIntegrations,
            systemImage: "puzzlepiece"
          )
        } else {
          List {
            ForEach($servers, id: \.id) { $server in
              Toggle(isOn: $server.enabled) {
                VStack(alignment: .leading, spacing: 3) {
                  Text(server.name)
                  if !server.descriptionText.isEmpty {
                    Text(server.descriptionText)
                      .font(.caption)
                      .foregroundStyle(.secondary)
                  }
                }
              }
              .onChange(of: server.enabled) {
                save()
              }
            }
          }
          .listStyle(.insetGrouped)
        }
      }
    }
    .navigationTitle(ProjectManagementStrings.integrations)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: identity) {
      await settingsController.load(identity)
      servers = settingsController.cachedSettings(for: identity)?.mcpServers ?? []
    }
    .onChange(of: settingsController.cachedSettings(for: identity)) { _, settings in
      servers = settings?.mcpServers ?? []
    }
    .overlay(alignment: .bottom) {
      if let failure = commandController.state.failure {
        ProjectFailureBanner(failure: failure)
          .padding()
      }
    }
  }

  private func save() {
    let patch = ProjectPatch(mcpServers: .set(servers))
    Task {
      await commandController.perform(
        .update(projectId: project.id, patch: patch),
        detectSetup: false
      )
    }
  }
}
