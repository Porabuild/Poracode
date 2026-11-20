import Observation
import SwiftUI

@Observable
final class MCPServerEditSession<Lease>: Identifiable {
  let id = UUID()
  let lease: Lease
  let server: ProjectMCPServer?
  var draft: ProjectMCPServerDraft

  init(lease: Lease, server: ProjectMCPServer? = nil) {
    self.lease = lease
    self.server = server
    draft = server.map(ProjectMCPServerDraft.init(server:)) ?? .init()
  }
}

struct ProjectMCPSettingsView: View {
  @Bindable var session: AppSession
  let project: RemoteProject
  let identity: ProjectIdentity
  @Bindable var settingsController: ProjectControllerSettingsController
  @Bindable var commandController: ProjectControllerCommandController

  @State private var servers: [ProjectMCPServer] = []
  @State private var editor: MCPServerEditSession<ProjectControllerHostLease>?
  @State private var moveFailure: SettingsOperationFailure?

  var body: some View {
    Group {
      switch settingsController.loadStateByProject[identity] ?? .idle {
      case .idle, .loading:
        if settingsController.cachedSettings(for: identity) == nil {
          LoadingStateView(message: ProjectManagementStrings.loading)
        } else {
          content
        }
      case .failed(let failure):
        if settingsController.cachedSettings(for: identity) == nil {
          ErrorStateView(
            message: ProjectFailureText.message(for: failure),
            retryTitle: ProjectManagementStrings.retry
          ) {
            Task { await load() }
          }
        } else {
          content
        }
      default:
        content
      }
    }
    .navigationTitle(ProjectSettingsStrings.mcpServers)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .bottomBar) {
        Button(ProjectSettingsStrings.addMCPServer, systemImage: "plus") {
          presentEditor()
        }
        .disabled(editingLease == nil)
        .accessibilityIdentifier("native-e2e.project-mcp.add")
      }
    }
    .sheet(item: $editor) { selection in
      NavigationStack {
        ProjectMCPServerEditor(
          session: selection,
          existingNames: Set(servers.map { $0.name.lowercased() })
        ) { server in
          guard editingLease == selection.lease else { return }
          upsert(server, expectedLease: selection.lease)
          editor = nil
        }
      }
      .poracodeFormSheetSizing()
    }
    .task(id: identity) { await load() }
    .onChange(of: session.currentProjectControllerLease) {
      editor = nil
    }
    .onChange(of: settingsController.cachedSettings(for: identity)) { _, settings in
      guard let settings else { return }
      servers = settings.mcpServers ?? []
    }
    .overlay(alignment: .bottom) {
      if let moveFailure {
        SettingsMutationBanner(notice: nil, failure: moveFailure) {
          self.moveFailure = nil
        }
        .padding()
      } else if let failure = commandController.state.failure {
        ProjectFailureBanner(failure: failure)
          .padding()
      }
    }
  }

  private var content: some View {
    List {
      Section {
        NavigationLink {
          SettingsIntegrationsSessionView(
            session: session,
            initialProjectIdentity: identity,
            initialRoute: .mcp,
            embeddedInNavigationStack: true,
            configuredMCPServers: servers.map { SettingsMCPServer(projectServer: $0) },
            onImportMCPServer: importServer,
            onUpdateMCPServer: updateConfiguredServer
          )
        } label: {
          Label(ProjectSettingsStrings.discoverAndImportMCP, systemImage: "square.and.arrow.down")
        }
      }

      Section(SettingsIntegrationsStrings.configured) {
        if servers.isEmpty {
          Label(ProjectSettingsStrings.noConfiguredMCPServers, systemImage: "server.rack")
            .foregroundStyle(.secondary)
        } else {
          ForEach(servers, id: \.id) { server in
            serverRow(server)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(760)
    .refreshable { await load() }
  }

  private func serverRow(_ server: ProjectMCPServer) -> some View {
    Toggle(
      isOn: Binding(
        get: { servers.first(where: { $0.id == server.id })?.enabled ?? server.enabled },
        set: { enabled in
          guard !commandController.state.isExecuting else { return }
          persist(
            servers.map { item in
              guard item.id == server.id else { return item }
              var next = item
              next.enabled = enabled
              return next
            })
        }
      )
    ) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(server.name)
          Text(server.transport.kindLabel)
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
        }
        Text(server.transport.summary)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
        if !server.descriptionText.isEmpty {
          Text(server.descriptionText)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
    }
    .poracodeSwitchStyle()
    .disabled(commandController.state.isExecuting)
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      Button {
        presentEditor(server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      .tint(.gray)
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        persist(servers.filter { $0.id != server.id })
      } label: {
        Label(SettingsIntegrationsStrings.delete, systemImage: "trash")
      }
    }
    .contextMenu {
      Button {
        presentEditor(server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      Button {
        moveToGlobal(server)
      } label: {
        Label(SettingsIntegrationsStrings.global, systemImage: "globe")
      }
      .disabled(session.currentSettingsHostSelection?.gate(.projectsManage) != nil)
      Button(role: .destructive) {
        persist(servers.filter { $0.id != server.id })
      } label: {
        Label(SettingsIntegrationsStrings.delete, systemImage: "trash")
      }
    }
  }

  private func load() async {
    await settingsController.load(identity)
    if let settings = settingsController.cachedSettings(for: identity) {
      servers = settings.mcpServers ?? []
    }
  }

  private var editingLease: ProjectControllerHostLease? {
    guard let access = session.currentProjectControllerSession,
      access.lease.connectionId == identity.connectionId,
      commandController.state.session?.lease == access.lease,
      access.gate(.projectsManage) == nil, !commandController.state.isExecuting,
      !commandController.state.isRunningSetupFollowUp,
      settingsController.cachedSettings(for: identity) != nil else { return nil }
    return access.lease
  }

  private func presentEditor(_ server: ProjectMCPServer? = nil) {
    guard let lease = editingLease else { return }
    editor = .init(lease: lease, server: server)
  }

  private func upsert(_ server: ProjectMCPServer, expectedLease: ProjectControllerHostLease? = nil) {
    if servers.contains(where: { $0.id == server.id }) {
      persist(servers.map { $0.id == server.id ? server : $0 }, expectedLease: expectedLease)
    } else {
      persist(servers + [server], expectedLease: expectedLease)
    }
  }

  private func importServer(_ source: SettingsMCPServer) {
    guard !commandController.state.isExecuting else { return }
    let normalizedName = source.name.lowercased()
    guard !servers.contains(where: { $0.name.lowercased() == normalizedName }) else { return }
    let imported = ProjectMCPServer(
      imported: source,
      id: UUID().uuidString
    )
    persist(servers + [imported])
  }

  private func updateConfiguredServer(_ source: SettingsMCPServer) {
    guard let existing = servers.first(where: { $0.id == source.id }) else { return }
    upsert(ProjectMCPServer(imported: source, id: existing.id))
  }

  private func persist(_ next: [ProjectMCPServer], expectedLease: ProjectControllerHostLease? = nil) {
    guard next != servers, let lease = editingLease,
      expectedLease == nil || expectedLease == lease else { return }
    let previous = servers
    servers = next
    Task {
      await commandController.perform(
        .update(
          projectId: project.id,
          patch: ProjectPatch(mcpServers: .set(next))
        ),
        detectSetup: false,
        expectedLease: lease
      )
      guard session.currentProjectControllerLease == lease else { return }
      if commandController.state.failure != nil {
        servers = previous
        return
      }
      await load()
    }
  }

  private func moveToGlobal(_ server: ProjectMCPServer) {
    guard editingLease != nil, let selection = session.currentSettingsHostSelection,
      selection.lease.connectionID == identity.connectionId,
      selection.gate(.projectsManage) == nil
    else { return }
    moveFailure = nil
    let gateway = session.makeSettingsSessionGateway()
    Task {
      do {
        _ = try await gateway.commandGlobalMCPSettings(
          .move(
            source: .project(project.id),
            destination: .global,
            serverID: server.id
          ),
          lease: selection.lease
        )
        await load()
      } catch {
        moveFailure = SettingsOperationFailure.map(error)
      }
    }
  }
}

struct ProjectMCPServerEditor<Lease>: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: MCPServerEditSession<Lease>
  let existingNames: Set<String>
  let onSave: (ProjectMCPServer) -> Void

  @State private var validationError: ProjectMCPDraftError?

  var body: some View {
    Form {
      Section {
        TextField(ProjectManagementStrings.name, text: $session.draft.name)
          .accessibilityIdentifier("native-e2e.mcp-editor.name")
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        Toggle(ProjectSettingsStrings.mcpEnabled, isOn: $session.draft.enabled)
          .accessibilityIdentifier("native-e2e.mcp-editor.enabled")
        .poracodeSwitchStyle()
        Picker(ProjectSettingsStrings.mcpTransport, selection: $session.draft.transportKind) {
          ForEach(ProjectMCPTransportKind.allCases) { kind in
            Text(kind.label).tag(kind)
          }
        }
        .accessibilityIdentifier("native-e2e.mcp-editor.transport")
        TextField(ProjectSettingsStrings.mcpTimeout, text: $session.draft.timeoutText)
          .keyboardType(.numberPad)
      }

      if session.draft.transportKind == .stdio {
        Section {
          TextField(ProjectSettingsStrings.mcpCommand, text: $session.draft.command)
            .font(.body.monospaced())
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(
            ProjectSettingsStrings.mcpArguments, text: $session.draft.argumentsText, axis: .vertical
          )
          .lineLimit(2...5)
          .font(.body.monospaced())
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          TextField(ProjectSettingsStrings.mcpWorkingDirectory, text: $session.draft.workingDirectory)
            .font(.body.monospaced())
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Section(ProjectSettingsStrings.mcpEnvironment) {
          multilineEditor(
            text: $session.draft.environmentText,
            label: ProjectSettingsStrings.mcpEnvironment
          )
        }
      } else {
        Section {
          TextField(ProjectSettingsStrings.mcpURL, text: $session.draft.url)
            .accessibilityIdentifier("native-e2e.mcp-editor.url")
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Section(ProjectSettingsStrings.mcpHeaders) {
          multilineEditor(text: $session.draft.headersText, label: ProjectSettingsStrings.mcpHeaders)
        }
      }

      Section {
        TextField(
          ProjectSettingsStrings.mcpDescription, text: $session.draft.descriptionText, axis: .vertical
        )
        .lineLimit(2...5)
      }

      if let validationError {
        Section {
          Label(
            ProjectSettingsStrings.mcpError(validationError),
            systemImage: "exclamationmark.triangle"
          )
          .foregroundStyle(.red)
        }
      }
    }
    .navigationTitle(
      session.server == nil ? ProjectSettingsStrings.addMCPServer : ProjectSettingsStrings.editMCPServer
    )
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(ProjectManagementStrings.cancel, systemImage: "xmark") { dismiss() }
          .accessibilityIdentifier("native-e2e.mcp-editor.cancel")
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save, systemImage: "checkmark") { save() }
          .accessibilityIdentifier("native-e2e.mcp-editor.save")
      }
    }
  }

  private func multilineEditor(text: Binding<String>, label: String) -> some View {
    TextEditor(text: text)
      .font(.body.monospaced())
      .frame(minHeight: 88)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .accessibilityLabel(label)
  }

  private func save() {
    do {
      let value = try session.draft.server(
        existingNames: existingNames,
        previousName: session.server?.name
      )
      validationError = nil
      onSave(value)
    } catch let error {
      validationError = error
    }
  }
}

extension ProjectMCPTransportKind {
  fileprivate var label: String {
    switch self {
    case .stdio: "stdio"
    case .http: "HTTP"
    case .sse: "SSE"
    }
  }
}

extension ProjectMCPTransport {
  var kindLabel: String {
    switch self {
    case .stdio: "STDIO"
    case .http: "HTTP"
    case .sse: "SSE"
    }
  }

  var summary: String {
    switch self {
    case .stdio(let command, let args, _, let cwd):
      ([command] + args + (cwd.map { ["·", $0] } ?? [])).joined(separator: " ")
    case .http(let url, _), .sse(let url, _):
      url
    }
  }
}
