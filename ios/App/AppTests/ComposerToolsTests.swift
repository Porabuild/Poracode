import XCTest
@testable import App

@MainActor
final class ComposerToolsTests: XCTestCase {
  private func settings(_ enabled: [String: Bool] = [:], disabled: [String: Bool] = [:]) throws -> SettingsDocument {
    var object = SettingsFixtures.settings
    object["enabledMcpServers"] = enabled
    object["disabledBuiltInMcpServers"] = disabled
    return try JSONDecoding.decode(SettingsReadResponse.self, from: SettingsFixtures.data(["settings": object])).settings
  }

  private func host(_ id: ClientConnectionID, operate: Bool = true) -> SettingsHostSelection {
    .init(name: "Fixture", access: .init(lease: .init(connectionID: id, generation: 1),
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: true, isReady: true,
      capabilities: operate ? [.sessionRead, .sessionOperate, .projectsManage] : [.sessionRead]))
  }

  func testPluginRegistryMatchesPresentationLocationAndProviderOwnedSettings() throws {
    let document = try settings(["browser": true, "crossagents": false])
    let location = ProjectLocation.posix(path: "/fixture")
    let ordinary = ComposerPluginCatalog.rows(document: document, agentKind: "fixture", capabilities: [:], presentation: .gui, location: location)
    XCTAssertEqual(ordinary.map(\.id), ["browser", "crossagents", "chrome", "computer-use"])
    XCTAssertEqual(ordinary.filter(\.enabled).map(\.id), ["browser"])
    XCTAssertTrue(ComposerPluginCatalog.rows(document: document, agentKind: "fixture", capabilities: [:], presentation: .terminal, location: location).isEmpty)
    let wsl = ProjectLocation.wsl(distro: "Distro", linuxPath: "/fixture", uncPath: "/fixture")
    XCTAssertEqual(ComposerPluginCatalog.rows(document: document, agentKind: "fixture", capabilities: [:], presentation: .gui, location: wsl).map(\.id), ["browser", "crossagents"])
    let restricted = try settings(["browser": true], disabled: ["browser": true])
    XCTAssertFalse(ComposerPluginCatalog.rows(document: restricted, agentKind: "fixture", capabilities: [:], presentation: .gui, location: location).contains { $0.id == "browser" })
    let owned: [String: JSONValue] = ["mcpConfigSource": .string("agentSettings"),
      "agentSettingsDefaults": .object(["browserMcp": .bool(true)])]
    let provider = ComposerPluginCatalog.rows(document: document, agentKind: "fixture", capabilities: owned, presentation: .gui, location: location)
    XCTAssertEqual(provider.map(\.id), ["browser"])
    XCTAssertFalse(try XCTUnwrap(provider.first).editable)
  }

  func testLaunchUsesStandingDefaultsAndMentionsWithoutChangingTheModelSelection() throws {
    let document = try settings(["browser": true], disabled: ["chrome": true])
    let original = ThreadLaunchConfiguration(model: "model", effort: "", contextSize: "", fast: false,
      thinking: false, browserMcp: false, crossagentMcp: false, computerUse: true, chromeMcp: true,
      mcpServerOverrides: ["extra": false], crew: .null)
    let result = ComposerPluginCatalog.launchConfiguration(original, document: document, capabilities: [:],
      presentation: .gui, location: .posix(path: "/fixture"), mentionedIDs: ["crossagents", "chrome"])
    var expected = original
    expected.browserMcp = true
    expected.crossagentMcp = true
    expected.chromeMcp = nil
    expected.computerUse = nil
    XCTAssertEqual(result, expected)
    XCTAssertEqual(ComposerPluginCatalog.launchConfiguration(original, document: document,
      capabilities: ["mcpConfigSource": .string("agentSettings")], presentation: .gui,
      location: .posix(path: "/fixture"), mentionedIDs: []), original)
  }

  func testWorkspaceServersOverrideGlobalNamesWhileRetainingScopeAndOrder() {
    func server(_ id: String, _ name: String) -> ProjectMCPServer {
      .init(id: id, name: name, transport: .stdio(command: "fixture", args: [], env: .init(), cwd: nil))
    }
    let rows = ComposerCustomMCPRow.merged(global: [server("global-one", "Review"), server("global-two", "Build")],
      workspace: [server("workspace-one", "REVIEW"), server("workspace-two", "Test")], projectID: "p1")
    XCTAssertEqual(rows.map(\.server.id), ["workspace-one", "global-two", "workspace-two"])
    XCTAssertEqual(rows[0].scope, .project("p1"))
    XCTAssertEqual(rows[1].scope, .global)
  }

  func testPluginWriteIsSparsePreservesOtherFlagsAndTargetsTheCapturedHost() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings(["chrome": true, "future": true]))
    let projects = ProjectControllerGatewayFake()
    let controller = ComposerToolsController(settings: gateway, projectGateway: projects)
    let id = ClientConnectionID(), selection = host(id)
    controller.activate(selection: selection, projectSession: nil, project: nil)
    await controller.load(servers: false)
    controller.setPlugin(.browser, enabled: true)
    await controller.finishPendingChanges()
    let calls = await gateway.writes
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(calls[0].1, selection.lease)
    XCTAssertEqual(Set(calls[0].0.values.keys), [.enabledMcpServers])
    XCTAssertEqual(controller.document.document?.enabledMcpServers, ["browser": true, "chrome": true, "future": true])
    controller.activate(selection: host(id, operate: false), projectSession: nil, project: nil)
    controller.setPlugin(.browser, enabled: false)
    await controller.finishPendingChanges()
    let finalWriteCount = await gateway.writes.count
    XCTAssertEqual(finalWriteCount, 1)
  }

  func testGlobalMCPEditorCannotSaveOnAReplacementDesktop() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings())
    let controller = GlobalMCPSettingsController(gateway: gateway)
    let original = host(ClientConnectionID())
    let replacement = host(ClientConnectionID())
    controller.activate(replacement)
    let server = ProjectMCPServer(id: "fixture", name: "Fixture", enabled: false,
      transport: .http(url: "https://fixture.invalid/mcp", headers: .init([:])))

    await controller.perform(.upsert(scope: .global, server: server), expectedLease: original.lease)
    let rejected = await gateway.commands
    XCTAssertTrue(rejected.isEmpty)
    await controller.perform(.upsert(scope: .global, server: server), expectedLease: replacement.lease)
    let applied = await gateway.commands
    XCTAssertEqual(applied.count, 1)
    XCTAssertEqual(applied.first?.1, replacement.lease)
  }

  func testWorkspaceOperationOwnerNeverFallsBackToGlobalOAuth() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings())
    let controller = GlobalMCPSettingsController(gateway: gateway, operationScope: .project("p1"))
    let selection = host(ClientConnectionID())
    controller.activate(selection)
    await controller.refreshOAuthStatus()
    let operations = await gateway.operations
    XCTAssertEqual(operations.count, 1)
    let data = try JSONDecoding.encoder.encode(operations[0])
    let value = try JSONDecoding.decode(JSONValue.self, from: data)
    XCTAssertEqual(value["scope"], .object(["kind": .string("project"), "projectId": .string("p1")]))
  }

  func testWorkspaceToggleWritesOnlyItsServerAndKeepsTransportSecrets() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings())
    let projects = ProjectControllerGatewayFake()
    let project = ProjectControllerTestValues.project("p1", name: "Review")
    let original = ProjectMCPServer(id: "workspace", name: "Review", enabled: false,
      transport: .http(url: "https://fixture.invalid/mcp", headers: .init(["Authorization": "Bearer fixture-only"])))
    await projects.enqueueSettings(.value(.init(mcpServers: [original])))
    var enabled = original
    enabled.enabled = true
    await projects.enqueueSettings(.value(.init(mcpServers: [enabled])))
    let controller = ComposerToolsController(settings: gateway, projectGateway: projects)
    let connection = ClientConnectionID(), selection = host(connection)
    controller.activate(selection: selection, projectSession: ProjectControllerTestValues.session(connection), project: project)
    await controller.load(servers: true)
    let row = try XCTUnwrap(controller.rows.first)
    controller.setServer(row, enabled: true)
    await controller.finishPendingChanges()
    let calls = await gateway.commands
    XCTAssertEqual(calls.count, 1)
    guard case .upsert(let scope, let saved) = calls[0].0 else { return XCTFail("Expected one scoped upsert") }
    XCTAssertEqual(scope, .project("p1"))
    XCTAssertEqual(saved, enabled)
    XCTAssertEqual(calls[0].1, selection.lease)
    XCTAssertEqual(controller.rows.first?.server, enabled)
  }

  func testLatePluginAcknowledgementCannotReplaceAnotherHostsSettings() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings(["chrome": true]))
    let barrier = ProjectControllerTestBarrier()
    await gateway.setWriteBarrier(barrier)
    let controller = ComposerToolsController(settings: gateway, projectGateway: ProjectControllerGatewayFake())
    controller.activate(selection: host(ClientConnectionID()), projectSession: nil, project: nil)
    await controller.load(servers: false)
    controller.setPlugin(.browser, enabled: true)
    let completion = Task { await controller.finishPendingChanges() }
    await barrier.waitUntilReached()
    let replacement = host(ClientConnectionID())
    controller.activate(selection: replacement, projectSession: nil, project: nil)
    await controller.load(servers: false)
    await barrier.release()
    await completion.value
    XCTAssertEqual(controller.selection?.lease, replacement.lease)
    XCTAssertEqual(controller.document.document?.enabledMcpServers, ["chrome": true])
    XCTAssertFalse(controller.isMutating)
    XCTAssertNil(controller.failure)
  }

  func testRefreshingToolAuthenticationDoesNotCancelAnAuthorizationInProgress() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings())
    let controller = ComposerToolsController(settings: gateway, projectGateway: ProjectControllerGatewayFake())
    controller.activate(selection: host(ClientConnectionID()), projectSession: nil, project: nil)
    controller.global.oauthLifecycle = .waiting
    XCTAssertTrue(controller.isAuthorizing)
    await controller.refreshAuthentication()
    let operations = await gateway.operations
    XCTAssertTrue(operations.isEmpty)
    XCTAssertEqual(controller.global.oauthLifecycle, .waiting)
  }

  func testDraftToolPickerNeverRetargetsTheOldWorkspaceToAnotherHost() async throws {
    let gateway = ComposerToolsGatewayFake(document: try settings())
    let source = ClientConnectionID(), replacement = ClientConnectionID()
    let controller = ComposerToolsController(settings: gateway, projectGateway: ProjectControllerGatewayFake(), ownerConnectionID: source)
    controller.activate(selection: host(source), projectSession: nil, project: nil)
    await controller.load(servers: false)
    XCTAssertTrue(controller.canEditPlugins)
    controller.activate(selection: host(replacement), projectSession: ProjectControllerTestValues.session(replacement),
      project: ProjectControllerTestValues.project("same-local-id", name: "Different host"))
    XCTAssertNil(controller.selection)
    XCTAssertNil(controller.projectIdentity)
    XCTAssertFalse(controller.canEditPlugins)
    XCTAssertFalse(controller.canEditServers)
    controller.setPlugin(.browser, enabled: true)
    let writes = await gateway.writes
    XCTAssertTrue(writes.isEmpty)
  }
}

private actor ComposerToolsGatewayFake: SettingsSessionGateway {
  private var document: SettingsDocument
  private(set) var writes: [(SettingsPatch, SettingsHostLease)] = []
  private(set) var operations: [GlobalMCPSettingsOperation] = []
  private(set) var commands: [(GlobalMCPSettingsCommand, SettingsHostLease)] = []
  private var writeBarrier: ProjectControllerTestBarrier?
  init(document: SettingsDocument) { self.document = document }
  func readSettings(lease: SettingsHostLease) -> SettingsReadResponse { .init(settings: document) }
  func setWriteBarrier(_ barrier: ProjectControllerTestBarrier) { writeBarrier = barrier }
  func writeSettings(_ patch: SettingsPatch, lease: SettingsHostLease) async throws -> SettingsReadResponse {
    writes.append((patch, lease))
    if let writeBarrier { await writeBarrier.suspend() }
    var value = try JSONDecoding.decode([String: SettingsJSON].self, from: JSONDecoding.encoder.encode(document))
    for (key, field) in patch.values { value[key.rawValue] = field }
    document = try JSONDecoding.decode(SettingsDocument.self, from: JSONDecoding.encoder.encode(value))
    return .init(settings: document)
  }
  func readGlobalMCPSettings(lease: SettingsHostLease) -> GlobalMCPSettingsResponse { .init(servers: []) }
  func commandGlobalMCPSettings(_ command: GlobalMCPSettingsCommand, lease: SettingsHostLease) -> GlobalMCPSettingsResponse {
    commands.append((command, lease))
    return .init(servers: [])
  }
  func operateGlobalMCPSettings(_ operation: GlobalMCPSettingsOperation, lease: SettingsHostLease) throws -> GlobalMCPSettingsOperationResult {
    operations.append(operation)
    return .oauthStatus(authenticatedServerIDs: [])
  }
  func agentStatuses(lease: SettingsHostLease) throws -> SettingsAgentStatuses { throw SettingsGatewayError.transport }
  func providerUsage(lease: SettingsHostLease) throws -> SettingsProviderUsage { throw SettingsGatewayError.transport }
  func profileDevices(lease: SettingsHostLease) throws -> SettingsProfileDevices { throw SettingsGatewayError.transport }
  func profileCoreStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(_ identity: SettingsProfileIdentity, lease: SettingsHostLease) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}
