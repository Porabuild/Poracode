import XCTest
@testable import App

@MainActor final class SessionImportTests: XCTestCase {
  func testGeneratedListingCodecUsesRealFilterEnvelopeAndRejectsMalformedResults() throws {
    let request = try SessionImportContract.listingRequest(.init(agentKind: "", cwd: "/repo", query: "  form  "))
    let json = try JSONDecoder().decode(JSONValue.self, from: request).objectValue
    XCTAssertEqual(json?["procedure"]?.stringValue, "listImportableSessions")
    XCTAssertNil(json?["payload"]?.objectValue?["agentKind"])
    XCTAssertEqual(json?["payload"]?.objectValue?["query"]?.stringValue, "form")
    let valid = #"{"result":{"sessions":[],"facets":{"agentKinds":[],"folders":[]},"truncated":false}}"#
    XCTAssertTrue(try SessionImportContract.listing(Data(valid.utf8)).sessions.isEmpty)
    XCTAssertThrowsError(try SessionImportContract.listing(Data(#"{"result":{"sessions":[]}}"#.utf8)))
  }

  func testOlderHostOmitsImportCapabilityAndImportedMetadataRoundTrips() throws {
    let old = #"{"model":"model-a"}"#
    let config = try JSONDecoder().decode(ThreadConfig.self, from: Data(old.utf8))
    XCTAssertNil(config.importedFrom)
    let current = #"{"model":"model-a","importedFrom":{"path":"/sessions/s.jsonl","importedAt":"2026-11-14"}}"#
    let value = try JSONDecoder().decode(ThreadConfig.self, from: Data(current.utf8))
    XCTAssertEqual(try JSONDecoder().decode(ThreadConfig.self, from: JSONEncoder().encode(value)), value)
    XCTAssertEqual(value.richChatObject["importedFrom"]?.objectValue?["path"], .string("/sessions/s.jsonl"))
    let capabilities = try JSONDecoder().decode(RemoteEnvironmentDescriptor.Capabilities.self, from: Data("{}".utf8))
    XCTAssertNil(capabilities.sessionImport)
    let supported = try JSONDecoder().decode(RemoteEnvironmentDescriptor.Capabilities.self,
      from: Data(#"{"sessionImport":{"versions":[1,99]}}"#.utf8))
    XCTAssertEqual(supported.sessionImport?.versions, [1,99])
  }

  func testImportCommandUsesCanonicalThreadRouteWithoutLaunchingAnAgent() throws {
    let command = SessionImportCommand(projectId: "p", agentKind: "fixture", model: "model-a", title: "Imported",
      path: "/sessions/s.jsonl", providerSessionId: "s")
    let request = try GeneratedRemoteV3Contract.threadCommandRequest(threadID: "new-thread", body: JSONEncoder().encode(command), commandID: nil)
    XCTAssertEqual(request.path, "/api/threads/new-thread/command")
    XCTAssertTrue(request.headers.isEmpty)
    let json = try JSONDecoder().decode(JSONValue.self, from: request.body).objectValue
    XCTAssertEqual(json?["kind"]?.stringValue, "import-session")
    XCTAssertNil(json?["prompt"])
    XCTAssertEqual(json?["providerSessionId"]?.stringValue, "s")
  }

  func testSearchAndModelSelectionMatchPWAImportRules() throws {
    let item = cliSession()
    XCTAssertTrue(SessionImportFilter(query: " FORM ").includes(item))
    XCTAssertTrue(SessionImportFilter(cwd: "/repo", query: "repo").includes(item))
    XCTAssertFalse(SessionImportFilter(agentKind: "another").includes(item))
    XCTAssertFalse(SessionImportFilter(query: "fixture").includes(item), "Agent labels are not part of PWA title/preview/cwd search")
    XCTAssertEqual(SessionImportPresentation.model(item, project: nil, agents: [try importAgent()]), "model-a")
    XCTAssertNil(SessionImportPresentation.model(cliSession(model: nil), project: nil, agents: []))
  }

  func testExactHostGatewayRejectsMissingScopesAndMismatchedLeasesBeforeDial() async throws {
    let api = ImportGatewayFake(), lease = SettingsHostLease(connectionID: ClientConnectionID(), generation: 1)
    let gateway = SelectedSessionImportGateway { _ in
      .init(access: .init(lease: lease, protocolVersion: ProtocolConstants.remoteProtocolVersion,
        isOnline: true, isReady: true, capabilities: []), api: api)
    }
    do { _ = try await gateway.list(.init(), lease: lease); XCTFail("Expected scope failure") }
    catch let failure as SessionImportFailure { XCTAssertEqual(failure, .unavailable(.capabilityMissing("projects:manage"))) }
    let other = SettingsHostLease(connectionID: ClientConnectionID(), generation: 1)
    do { _ = try await gateway.list(.init(), lease: other); XCTFail("Expected stale lease cancellation") }
    catch is CancellationError {}
    let calls = await api.listCalls
    XCTAssertEqual(calls, 0)
  }

  func testAnEmptySessionHeadingShowsItsIdentityWhileTheImportedThreadGetsTheLocalizedDefault() {
    let item = ImportableCLISession(id: "s", agentKind: "fixture", providerSessionId: "provider-session-1",
      path: "/sessions/s", cwd: nil, updatedAt: "2026-11-14", preview: "", title: nil, model: nil, cwdExists: false)
    XCTAssertEqual(item.displayTitle, "provider-session-1")
    XCTAssertEqual(SessionImportPresentation.title(item), SessionImportStrings.importedSession)
  }

  func testLiveFolderRegistersOnItsOwnerAndUsesAffectedProjectForImport() async throws {
    let api = ImportGatewayFake(), claims = SessionImportClaims()
    let controller = SessionImportController(gateway: api, claims: claims)
    controller.activate(.init(connectionID: ClientConnectionID(), generation: 1))
    await controller.load(.init())
    controller.selected = ["s"]
    var refreshed = 0
    await controller.importSelected(projects: [importProject()], fallbackProjectID: "p", threads: [], agents: [try importAgent()], refresh: { refreshed += 1 })
    let registrations = await api.registrations, commands = await api.commands
    XCTAssertEqual(registrations, ["/repo"])
    XCTAssertEqual(commands.count, 1)
    XCTAssertEqual(commands.first?.1.projectId, "registered")
    XCTAssertEqual(controller.importedThreadIDs["s"], commands.first?.0)
    XCTAssertTrue(controller.selected.isEmpty)
    XCTAssertEqual(refreshed, 1)
  }

  func testAResponseFromAHostWhoseLeaseChangedIsDiscarded() async throws {
    let api = ImportGatewayFake()
    let lease = SettingsHostLease(connectionID: ClientConnectionID(), generation: 1)
    let sequence = ImportSelectionSequence(first: lease,
      replacement: .init(connectionID: ClientConnectionID(), generation: 2), api: api)
    let gateway = SelectedSessionImportGateway { _ in await sequence.next() }
    do { _ = try await gateway.list(.init(), lease: lease); XCTFail("Expected a stale completion to be cancelled") }
    catch is CancellationError {}
    let calls = await api.listCalls
    XCTAssertEqual(calls, 1)
  }

  func testMissingFolderAndModelFailBeforeAnyMutationAndKeepTheSelectionForCorrection() async throws {
    let api = ImportGatewayFake()
    await api.setListing(importListing([cliSession(cwdExists: false, model: nil)]))
    let controller = SessionImportController(gateway: api, claims: SessionImportClaims())
    controller.activate(.init(connectionID: ClientConnectionID(), generation: 1))
    await controller.load(.init()); controller.selected = ["s"]
    await controller.importSelected(projects: [], fallbackProjectID: "", threads: [], agents: [], refresh: { XCTFail("Nothing was imported") })
    XCTAssertEqual(controller.failure, .missingProject)
    XCTAssertEqual(controller.selected, ["s"])
    let calls = await api.commands, registrations = await api.registrations
    XCTAssertTrue(calls.isEmpty)
    XCTAssertTrue(registrations.isEmpty)
  }

  func testMissingFolderUsesChosenFallbackAndNeverRegistersTheMissingPath() async throws {
    let api = ImportGatewayFake()
    await api.setListing(importListing([cliSession(cwdExists: false)]))
    let controller = SessionImportController(gateway: api, claims: SessionImportClaims())
    controller.activate(.init(connectionID: ClientConnectionID(), generation: 1))
    await controller.load(.init()); controller.selected = ["s"]
    await controller.importSelected(projects: [importProject(id: "fallback")], fallbackProjectID: "fallback", threads: [], agents: [], refresh: {})
    let registrations = await api.registrations, commands = await api.commands
    XCTAssertTrue(registrations.isEmpty)
    XCTAssertEqual(commands.first?.1.projectId, "fallback")
  }

  func testAmbiguousImportRetryReusesItsThreadIDAcrossControllers() async throws {
    let api = ImportGatewayFake(), claims = SessionImportClaims()
    let lease = SettingsHostLease(connectionID: ClientConnectionID(), generation: 1)
    await api.setError(.ambiguousOutcome)
    let first = SessionImportController(gateway: api, claims: claims)
    first.activate(lease); await first.load(.init()); first.selected = ["s"]
    await first.importSelected(projects: [], fallbackProjectID: "", threads: [], agents: [], refresh: {})
    XCTAssertEqual(first.failure, .ambiguousOutcome)
    XCTAssertEqual(first.selected, ["s"])
    await api.setError(.threadAlreadyExists)
    let next = SessionImportController(gateway: api, claims: claims)
    next.activate(lease); await next.load(.init()); next.selected = ["s"]
    await next.importSelected(projects: [], fallbackProjectID: "", threads: [], agents: [], refresh: {})
    let commands = await api.commands
    XCTAssertEqual(commands.count, 2)
    XCTAssertEqual(commands[0].0, commands[1].0)
    XCTAssertEqual(next.importedThreadIDs["s"], commands[0].0)
    XCTAssertNil(next.failure)
  }

  func testOverlappingImportsJoinOneAttemptAndIdenticalPathsOnOtherHostsStayIndependent() async throws {
    let claims = SessionImportClaims(), entered = ImportTestLatch(), release = ImportTestLatch(), joined = ImportTestLatch()
    let key = SessionImportClaims.Key(connectionID: ClientConnectionID(), path: "/sessions/s")
    var calls = 0
    let first = Task { @MainActor in
      try await claims.run(key: key) { _ in calls += 1; entered.signal(); await release.wait() }
    }
    await entered.wait()
    let second = Task { @MainActor in
      joined.signal()
      return try await claims.run(key: key) { _ in calls += 1 }
    }
    await joined.wait(); release.signal()
    let a = try await first.value, b = try await second.value
    XCTAssertEqual(a, b)
    XCTAssertEqual(calls, 1)
    let c = try await claims.run(key: .init(connectionID: ClientConnectionID(), path: key.path)) { _ in calls += 1 }
    XCTAssertNotEqual(a, c)
    XCTAssertEqual(calls, 2)
  }

  func testSupersededListingKeepsPreviousRowsAndHostSwitchClearsSelections() async throws {
    let api = ImportGatewayFake()
    let active = SessionImportController(gateway: api, claims: SessionImportClaims())
    let lease = SettingsHostLease(connectionID: ClientConnectionID(), generation: 1)
    active.activate(lease); await active.load(.init()); active.selected = ["s"]
    await api.setListing(importListing([], superseded: true))
    await active.load(.init(query: "new"))
    XCTAssertEqual(active.listing?.sessions.count, 1)
    XCTAssertNotNil(active.failure)
    active.activate(.init(connectionID: ClientConnectionID(), generation: 1))
    XCTAssertNil(active.listing)
    XCTAssertTrue(active.selected.isEmpty)
  }
}
