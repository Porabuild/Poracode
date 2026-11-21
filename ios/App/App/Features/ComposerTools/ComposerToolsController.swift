import Foundation
import Observation

@MainActor @Observable
final class ComposerToolsController {
  let document: SettingsDocumentController
  let global: GlobalMCPSettingsController
  let projects: ProjectControllerSettingsController
  let projectCommands: ProjectControllerCommandController
  private(set) var workspaceOperations: GlobalMCPSettingsController?
  private(set) var selection: SettingsHostSelection?
  private(set) var project: RemoteProject?
  private(set) var projectIdentity: ProjectIdentity?
  private(set) var pendingID: String?
  private(set) var failure: SettingsOperationFailure?
  private(set) var isCheckingAuthentication = false

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  /// A home draft belongs to one connection even while its outgoing sheet is
  /// dismissing. Never reinterpret that draft's project id on a different host.
  private let ownerConnectionID: ClientConnectionID?
  @ObservationIgnored private var generation: UInt64 = 0
  @ObservationIgnored private var mutation: Task<Void, Never>?

  init(settings: any SettingsSessionGateway, projectGateway: any ProjectSessionGateway,
    refresh: any ProjectControllerRefreshScheduling = ProjectControllerNoopRefreshScheduler(),
    ownerConnectionID: ClientConnectionID? = nil
  ) {
    gateway = settings
    self.ownerConnectionID = ownerConnectionID
    document = .init(gateway: settings)
    global = .init(gateway: settings)
    projects = .init(gateway: projectGateway)
    projectCommands = .init(gateway: projectGateway, refreshScheduler: refresh)
  }

  convenience init(session: AppSession) {
    self.init(settings: session.makeSettingsSessionGateway(), projectGateway: session.makeProjectSessionGateway(),
      refresh: session.makeProjectRefreshScheduler(), ownerConnectionID: session.selectedConnectionId)
  }

  func activate(selection: SettingsHostSelection?, projectSession: ProjectControllerSession?, project: RemoteProject?) {
    let selection = ownerConnectionID == nil || selection?.lease.connectionID == ownerConnectionID ? selection : nil
    let hostChanged = self.selection?.lease != selection?.lease
    if hostChanged {
      generation &+= 1
      mutation?.cancel()
      mutation = nil
      pendingID = nil
      failure = nil
      isCheckingAuthentication = false
    }
    self.selection = selection
    self.project = project
    document.activate(selection?.lease)
    global.activate(selection)
    let identity = project.flatMap { project in selection.map { project.identity(on: $0.lease.connectionID) } }
    if projectIdentity != identity || hostChanged {
      workspaceOperations?.cancelTransientWork()
      workspaceOperations = identity.map { GlobalMCPSettingsController(gateway: gateway, operationScope: .project($0.projectId)) }
    }
    projectIdentity = identity
    workspaceOperations?.activate(selection)
    if let projectSession, projectSession.lease.connectionId == selection?.lease.connectionID {
      projects.activate(projectSession)
      if projectCommands.state.session?.lease == projectSession.lease { projectCommands.updateAccess(projectSession) }
      else { projectCommands.activate(projectSession, projects: project.map { [$0] } ?? []) }
    } else {
      projects.deactivate()
      projectCommands.deactivate()
    }
  }

  var isMutating: Bool { pendingID != nil }
  var isAuthorizing: Bool {
    ([global] + (workspaceOperations.map { [$0] } ?? [])).contains { operations in
      switch operations.oauthLifecycle {
      case .checking, .starting, .openingBrowser, .waiting: true
      default: false
      }
    }
  }
  var canEditPlugins: Bool { selection?.gate(.sessionOperate) == nil && document.document != nil }
  var canEditServers: Bool { selection.map { $0.gate(.projectsManage) == nil } ?? false }
  func finishPendingChanges() async { await mutation?.value }
  var rows: [ComposerCustomMCPRow] {
    ComposerCustomMCPRow.merged(global: global.servers,
      workspace: projectIdentity.flatMap { projects.cachedSettings(for: $0)?.mcpServers } ?? [],
      projectID: project?.id)
  }

  func load(servers: Bool) async {
    guard !isMutating else { return }
    failure = nil
    if servers {
      async let settingsRead: Void = document.load()
      async let globalRead: Void = global.load()
      if let identity = projectIdentity { await projects.load(identity) }
      _ = await (settingsRead, globalRead)
    } else { await document.load() }
  }

  /// One accepted tap = one write attempt to the captured host. The UI disables
  /// switches until acknowledgement; layout replacement does not cancel it.
  func setPlugin(_ plugin: HomeComposerMCP, enabled: Bool) {
    guard canEditPlugins, !isMutating, let lease = selection?.lease, let settings = document.document else { return }
    var map = settings.enabledMcpServers
    map[plugin.persistentID] = enabled
    let patch = SettingsPatch(values: [.enabledMcpServers: .object(map.mapValues(SettingsJSON.bool))])
    let captured = generation
    pendingID = plugin.persistentID
    failure = nil
    mutation = Task {
      await document.write(patch)
      guard self.generation == captured, self.selection?.lease == lease else { return }
      if case .failed(let problem) = document.state {
        self.failure = problem
        if problem == .ambiguousOutcome { await document.load() }
      }
      guard self.generation == captured else { return }
      self.pendingID = nil
      self.mutation = nil
    }
  }

  func setServer(_ row: ComposerCustomMCPRow, enabled: Bool) {
    guard canEditServers, !isMutating, let lease = selection?.lease,
      let current = rows.first(where: { $0.id == row.id }) else { return }
    let operation: GlobalMCPSettingsController
    switch current.scope {
    case .global: operation = global
    case .project(let id):
      guard id == project?.id, let workspaceOperations else { return }
      operation = workspaceOperations
    }
    var server = current.server
    server.enabled = enabled
    let captured = generation, identity = projectIdentity
    pendingID = current.id
    failure = nil
    mutation = Task {
      await operation.perform(.upsert(scope: current.scope, server: server))
      guard self.generation == captured, self.selection?.lease == lease else { return }
      self.failure = operation.mutationFailure
      if case .project = current.scope, let identity { await projects.load(identity) }
      guard self.generation == captured else { return }
      self.pendingID = nil
      self.mutation = nil
    }
  }

  func operations(for scope: GlobalMCPSettingsScope) -> GlobalMCPSettingsController? {
    switch scope {
    case .global: global
    case .project(let id): id == project?.id ? workspaceOperations : nil
    }
  }

  func refreshAuthentication() async {
    guard canEditServers, !isCheckingAuthentication, !isAuthorizing else { return }
    let captured = generation
    isCheckingAuthentication = true
    await global.refreshOAuthStatus()
    if projectIdentity != nil { await workspaceOperations?.refreshOAuthStatus() }
    for row in rows where row.server.enabled {
      guard generation == captured else { return }
      switch row.server.transport {
      case .http, .sse: await operations(for: row.scope)?.probe(row.server)
      case .stdio: break
      }
    }
    if generation == captured { isCheckingAuthentication = false }
  }

  func suspendAuthentication() {
    global.suspendOAuth()
    workspaceOperations?.suspendOAuth()
  }

  func resumeAuthentication() async {
    await global.resumeOAuth()
    await workspaceOperations?.resumeOAuth()
  }
}
