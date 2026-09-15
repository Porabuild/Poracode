import SwiftUI

private struct ProjectMCPEditorSelection: Identifiable {
  let id: String
  let server: ProjectMCPServer?

  init(server: ProjectMCPServer? = nil) {
    id = server?.id ?? UUID().uuidString
    self.server = server
  }
}

struct ProjectMCPSettingsView: View {
  @Bindable var session: AppSession
  let project: RemoteProject
  let identity: ProjectIdentity
  @Bindable var settingsController: ProjectControllerSettingsController
  @Bindable var commandController: ProjectControllerCommandController

  @State private var servers: [ProjectMCPServer] = []
  @State private var editor: ProjectMCPEditorSelection?
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
    .safeAreaInset(edge: .bottom, spacing: 0) {
      PoracodeBottomActionDock(placement: .trailing) {
        PoracodeCircleButton {
          editor = ProjectMCPEditorSelection()
        } label: {
          Label(ProjectSettingsStrings.addMCPServer, systemImage: "plus")
            .labelStyle(.iconOnly)
        }
        .disabled(commandController.state.isExecuting)
        .accessibilityLabel(ProjectSettingsStrings.addMCPServer)
        .accessibilityIdentifier("native-e2e.project-mcp.add")
      }
    }
    .sheet(item: $editor) { selection in
      NavigationStack {
        ProjectMCPServerEditor(
          server: selection.server,
          existingNames: Set(servers.map { $0.name.lowercased() })
        ) { server in
          upsert(server)
          editor = nil
        }
      }
    }
    .task(id: identity) { await load() }
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
    .disabled(commandController.state.isExecuting)
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      Button {
        editor = ProjectMCPEditorSelection(server: server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      .tint(.accentColor)
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
        editor = ProjectMCPEditorSelection(server: server)
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

  private func upsert(_ server: ProjectMCPServer) {
    guard !commandController.state.isExecuting else { return }
    if servers.contains(where: { $0.id == server.id }) {
      persist(servers.map { $0.id == server.id ? server : $0 })
    } else {
      persist(servers + [server])
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

  private func persist(_ next: [ProjectMCPServer]) {
    guard next != servers, !commandController.state.isExecuting else { return }
    let previous = servers
    servers = next
    Task {
      await commandController.perform(
        .update(
          projectId: project.id,
          patch: ProjectPatch(mcpServers: .set(next))
        ),
        detectSetup: false
      )
      if commandController.state.failure != nil {
        servers = previous
        return
      }
      await load()
    }
  }

  private func moveToGlobal(_ server: ProjectMCPServer) {
    guard let selection = session.currentSettingsHostSelection,
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

struct ProjectMCPServerEditor: View {
  @Environment(\.dismiss) private var dismiss
  let server: ProjectMCPServer?
  let existingNames: Set<String>
  let onSave: (ProjectMCPServer) -> Void

  @State private var draft: ProjectMCPServerDraft
  @State private var validationError: ProjectMCPDraftError?

  init(
    server: ProjectMCPServer?,
    existingNames: Set<String>,
    onSave: @escaping (ProjectMCPServer) -> Void
  ) {
    self.server = server
    self.existingNames = existingNames
    self.onSave = onSave
    _draft = State(initialValue: server.map(ProjectMCPServerDraft.init(server:)) ?? .init())
  }

  var body: some View {
    Form {
      Section {
        TextField(ProjectManagementStrings.name, text: $draft.name)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        Toggle(ProjectSettingsStrings.mcpEnabled, isOn: $draft.enabled)
        Picker(ProjectSettingsStrings.mcpTransport, selection: $draft.transportKind) {
          ForEach(ProjectMCPTransportKind.allCases) { kind in
            Text(kind.label).tag(kind)
          }
        }
        TextField(ProjectSettingsStrings.mcpTimeout, text: $draft.timeoutText)
          .keyboardType(.numberPad)
      }

      if draft.transportKind == .stdio {
        Section {
          TextField(ProjectSettingsStrings.mcpCommand, text: $draft.command)
            .font(.body.monospaced())
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(
            ProjectSettingsStrings.mcpArguments, text: $draft.argumentsText, axis: .vertical
          )
          .lineLimit(2...5)
          .font(.body.monospaced())
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          TextField(ProjectSettingsStrings.mcpWorkingDirectory, text: $draft.workingDirectory)
            .font(.body.monospaced())
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Section(ProjectSettingsStrings.mcpEnvironment) {
          multilineEditor(
            text: $draft.environmentText,
            label: ProjectSettingsStrings.mcpEnvironment
          )
        }
      } else {
        Section {
          TextField(ProjectSettingsStrings.mcpURL, text: $draft.url)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Section(ProjectSettingsStrings.mcpHeaders) {
          multilineEditor(text: $draft.headersText, label: ProjectSettingsStrings.mcpHeaders)
        }
      }

      Section {
        TextField(
          ProjectSettingsStrings.mcpDescription, text: $draft.descriptionText, axis: .vertical
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
      server == nil ? ProjectSettingsStrings.addMCPServer : ProjectSettingsStrings.editMCPServer
    )
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(ProjectManagementStrings.cancel) { dismiss() }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save) { save() }
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
      let value = try draft.server(
        existingNames: existingNames,
        previousName: server?.name
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
