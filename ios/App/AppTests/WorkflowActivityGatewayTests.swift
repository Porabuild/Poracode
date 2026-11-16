import XCTest
@testable import App

private actor WorkflowGatewayCredentials: AdvancedOperationsCredentialRepository {
  let values: [ClientConnectionID: AdvancedOperationsHostCredentials]
  let gate: ContinuationBox?
  init(_ values: [ClientConnectionID: AdvancedOperationsHostCredentials], gate: ContinuationBox? = nil) {
    self.values = values; self.gate = gate
  }
  func advancedOperationsCredentials(for connectionID: ClientConnectionID) async throws -> AdvancedOperationsHostCredentials? {
    await gate?.wait()
    return values[connectionID]
  }
}

private actor WorkflowGatewayAPI: AdvancedOperationsRemoteAPI {
  let result: AdvancedWorkflowGetRunResult
  let gate: ContinuationBox?
  private(set) var requests: [AdvancedOperationRequest] = []
  init(result: AdvancedWorkflowGetRunResult, gate: ContinuationBox? = nil) { self.result = result; self.gate = gate }
  func remoteCall(_ request: AdvancedOperationRequest) async throws -> AdvancedOperationResult {
    requests.append(request)
    await gate?.wait()
    if case .workflowAgentChat = request { return .workflowAgentChat(.init(events: [])) }
    return .workflowGetRun(result)
  }
}

@MainActor final class WorkflowActivityGatewayTests: XCTestCase {
  private func setup(gate: ContinuationBox? = nil, credentialGate: ContinuationBox? = nil,
    makeRichAPI: WorkflowActivityGateway.RichAPIFactory? = nil) async throws ->
    (AppSession, WorkflowActivityGateway, [WorkflowActivityOwner], [WorkflowGatewayAPI]) {
    let suite = "workflow-gateway-\(UUID().uuidString)"
    let (session, _, _) = try await makeSession(suite: suite) { endpoint, _ in FakeRemoteAPI(endpoint: endpoint) }
    addTeardownBlock { @MainActor in
      session.workflowActivityStore?.pause()
      await session.sessionPool.stopAll()
      UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
      try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory
        .appendingPathComponent("poracode-composition-hosts-\(suite)"))
    }
    let records = ["a", "b"].map { name in
      HostRecord(connectionId: ClientConnectionID(), desktopId: "desk-\(name)", label: name,
        httpBaseURL: "https://\(name).test", wsBaseURL: "wss://\(name).test", appVersion: "test",
        scopes: ["session:read"], pairedAt: Date())
    }
    session.state.hosts = records
    session.state.hostsLRU = records.map(\.connectionId)
    session.state.selectedConnectionId = records[1].connectionId
    session.state.profile = makeProfile(desktopId: records[1].desktopId, endpoint: records[1].httpBaseURL,
      scopes: records[1].scopes)
    session.state.phase = .ready
    for record in records {
      let lease = await session.sessionPool.startSocket(key: .host(record.connectionId),
        api: FakeRemoteAPI(endpoint: record.httpBaseURL), workGeneration: session.state.workGeneration, lastSeenSeq: 0)
      XCTAssertNotNil(lease)
      session.recordSocketState(.online, for: .host(record.connectionId))
    }
    let credentials = WorkflowGatewayCredentials(Dictionary(uniqueKeysWithValues: records.enumerated().map { index, record in
      (record.connectionId, AdvancedOperationsHostCredentials(connectionID: record.connectionId,
        desktopID: record.desktopId, endpoint: record.httpBaseURL, credential: "fixture-token-\(index)",
        protocolVersion: record.protocolVersion, scopes: Set(record.scopes), environment: nil))
    }), gate: credentialGate)
    let apis = try records.enumerated().map { index, _ in
      let run = try ProjectFixtureLoader.decode(AdvancedWorkflowRun.self, json: .object([
        "runId": .string("wf-\(index)"), "status": .string("running"), "agentCount": .number(0),
        "phases": .array([]), "unphasedAgents": .array([])]))
      return WorkflowGatewayAPI(result: .init(run: run, mtimeMs: nil), gate: index == 0 ? gate : nil)
    }
    let gateway = WorkflowActivityGateway(session: session, credentials: credentials, makeAPI: { endpoint, token, _ in
      guard let index = records.firstIndex(where: { $0.httpBaseURL == endpoint }), token == "fixture-token-\(index)" else {
        throw WorkflowActivityReadFailure.unavailable
      }
      return apis[index]
    }, makeRichAPI: makeRichAPI ?? WorkflowActivityGateway.productionRichAPIFactory())
    let owners = try records.map { record in
      try XCTUnwrap(session.workflowOwner(connectionID: record.connectionId, threadID: "same-thread",
        location: .posix(path: "/workspace")))
    }
    return (session, gateway, owners, apis)
  }

  private func reference(_ index: Int) throws -> WorkflowRunReference {
    try XCTUnwrap(WorkflowRunReference(metadata: .object(["runId": .string("wf-\(index)"),
      "transcriptDir": .string("/session/subagents/workflows/wf-\(index)")])))
  }

  func testBackgroundOwnerReadsItsOwnHostWhileAnotherHostIsSelected() async throws {
    let (session, gateway, owners, apis) = try await setup()
    XCTAssertEqual(session.selectedConnectionId, owners[1].thread.connectionID)
    let first = try await gateway.read(owner: owners[0], reference: reference(0))
    let second = try await gateway.read(owner: owners[1], reference: reference(1))
    XCTAssertEqual(first.run?.runId, "wf-0"); XCTAssertEqual(second.run?.runId, "wf-1")
    let requestsA = await apis[0].requests, requestsB = await apis[1].requests
    XCTAssertEqual(requestsA, [.workflowGetRun(.init(manifestPath: "/session/workflows/wf-0.json",
      location: owners[0].location, includeAgentChats: false, transcriptDir: "/session/subagents/workflows/wf-0"))])
    XCTAssertEqual(requestsB.count, 1)
  }

  func testScopeRevocationAndOfflineConnectionRefuseBeforeAnAPIRead() async throws {
    let (session, gateway, owners, apis) = try await setup()
    session.state.hosts[0].scopes = []
    do { _ = try await gateway.read(owner: owners[0], reference: reference(0)); XCTFail("Expected scope refusal") }
    catch { }
    session.recordSocketState(.idle, for: .host(owners[1].thread.connectionID))
    do { _ = try await gateway.read(owner: owners[1], reference: reference(1)); XCTFail("Expected offline refusal") }
    catch { }
    let requestsA = await apis[0].requests, requestsB = await apis[1].requests
    XCTAssertTrue(requestsA.isEmpty); XCTAssertTrue(requestsB.isEmpty)
  }

  func testReplacingTheAuthorityDuringAReadRejectsItsReply() async throws {
    let gate = ContinuationBox()
    let (session, gateway, owners, _) = try await setup(gate: gate)
    let reference = try reference(0)
    let held = Task { try await gateway.read(owner: owners[0], reference: reference) }
    defer { held.cancel() }
    try await gate.waitUntilWaiting()
    session.state.hosts[0].desktopId = "replacement-desktop"
    await gate.resume()
    do { _ = try await held.value; XCTFail("The old authority reply must be rejected") }
    catch WorkflowActivityReadFailure.staleOwner { }
  }

  func testAgentTranscriptReadsItsOwnAuthorityAndRefusesRevokedScope() async throws {
    let (session, gateway, owners, apis) = try await setup()
    let reference = try reference(0)
    _ = try await gateway.readAgentChat(owner: owners[0], reference: reference,
      agentID: "agent", threadID: "synthetic", finished: false)
    let calls = await apis[0].requests
    XCTAssertEqual(calls, [.workflowAgentChat(.init(threadId: "synthetic",
      transcriptDir: reference.transcriptDirectory, agentId: "agent", agentFinished: false, location: owners[0].location))])
    session.state.hosts[0].scopes = []
    do { _ = try await gateway.readAgentChat(owner: owners[0], reference: reference,
      agentID: "agent", threadID: "synthetic", finished: false); XCTFail("Expected scope refusal") }
    catch { }
    let after = await apis[0].requests
    XCTAssertEqual(after.count, 1)
  }

  func testAgentTranscriptRejectsAResponseFromAReplacedAuthority() async throws {
    let gate = ContinuationBox()
    let (session, gateway, owners, _) = try await setup(gate: gate)
    let reference = try reference(0)
    let pending = Task { try await gateway.readAgentChat(owner: owners[0], reference: reference,
      agentID: "agent", threadID: "synthetic", finished: true) }
    try await gate.waitUntilWaiting()
    session.state.hosts[0].desktopId = "replacement"
    await gate.resume()
    do { _ = try await pending.value; XCTFail("The previous authority cannot populate the viewer") }
    catch WorkflowActivityReadFailure.staleOwner { }
  }

  func testRichViewerReadsItsSourceHostAndCannotInvokeMutations() async throws {
    let (session, gateway, owners, _) = try await setup(makeRichAPI: { endpoint, token, environment in
      guard endpoint == "https://a.test", token == "fixture-token-0" else { throw WorkflowActivityReadFailure.invalidResponse }
      return GeneratedRichChatRemoteAPI(json: RemoteAPIClient(endpoint: endpoint, accessToken: token, environment: environment))
    })
    XCTAssertEqual(session.selectedConnectionId, owners[1].thread.connectionID)
    let value = try await gateway.richSelection(owner: owners[0])
    let selection = try XCTUnwrap(value)
    XCTAssertEqual(selection.access.lease.connectionID, owners[0].thread.connectionID)
    XCTAssertEqual(selection.access.capabilities, [.sessionRead])
    let transport = SelectedRichChatSessionGateway { try? await gateway.richSelection(owner: owners[0]) }
    do {
      _ = try await transport.executeMutation(target: .init(lease: selection.access.lease, threadID: "same-thread"),
        capability: .sessionOperate) { _ in XCTFail("A read-only viewer must not dispatch a mutation"); return true }
      XCTFail("Expected an operate-scope refusal")
    } catch { }
  }

  func testRichViewerRejectsAnAuthorityReplacedDuringCredentialResolution() async throws {
    let gate = ContinuationBox()
    let (session, gateway, owners, _) = try await setup(credentialGate: gate)
    let pending = Task { try await gateway.richSelection(owner: owners[0]) }
    try await gate.waitUntilWaiting()
    session.state.hosts[0].desktopId = "replacement"
    await gate.resume()
    let value = try await pending.value
    XCTAssertNil(value)
  }

  func testWindowViewerRetainsItsReadersWhenAdaptiveNavigationReplacesTheThread() async throws {
    let (session, _, owners, _) = try await setup()
    let owner = owners[0], access = try XCTUnwrap(session.workflowRichAccess(for: owners[0]))
    let source = session.makeRichChatControllerSuite()
    source.select(access: access, threadID: owner.thread.threadID)
    let context = WorkflowViewerContext(session: session, transcript: source.transcript,
      headings: source.runtimeItemHeadings, location: owner.location)
    let presenter = WorkflowViewerPresentationStore()
    presenter.present(context: context, input: .init(owner: owner, reference: try reference(0), request: nil), catalog: nil)
    let selection = try XCTUnwrap(presenter.selection)
    selection.controller.agentID = "selected-agent"
    source.deselect()
    XCTAssertNil(source.transcript.state.target)
    XCTAssertTrue(context.owns(owner))
    XCTAssertEqual(selection.controller.agentID, "selected-agent")
    XCTAssertEqual(selection.mediaController.state.target?.threadID, owner.thread.threadID)
    XCTAssertEqual(selection.headings.target?.threadID, owner.thread.threadID)
    presenter.selection = nil
    XCTAssertNil(selection.mediaController.state.target)
    XCTAssertNil(selection.headings.target)
  }

  func testWorkflowRosterCanQueueARegisteredRunAfterItsToolScrollsOutOfHistory() async throws {
    let (session, _, owners, _) = try await setup()
    let owner = owners[0], access = try XCTUnwrap(session.workflowRichAccess(for: owners[0]))
    let source = session.makeRichChatControllerSuite(); source.select(access: access, threadID: owner.thread.threadID)
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { $0 == owner },
      read: { _, _ in throw WorkflowActivityReadFailure.unavailable })
    session.workflowActivityStore = store
    store.register(owner: owner, itemID: "registered", metadata: .object([
      "runId": .string("wf-0"), "transcriptDir": .string("/session/subagents/workflows/wf-0")]))
    let context = WorkflowViewerContext(session: session, transcript: source.transcript,
      headings: source.runtimeItemHeadings, location: owner.location)
    let input = try XCTUnwrap(context.input(itemID: "registered", catalog: nil))
    XCTAssertEqual(input.reference, try reference(0))
    let presenter = WorkflowViewerPresentationStore()
    presenter.queue(context: context, input: input, catalog: nil)
    XCTAssertNil(presenter.selection, "The roster sheet must finish dismissing first")
    source.deselect()
    presenter.presentPending()
    XCTAssertEqual(presenter.selection?.input.reference, try reference(0))
    presenter.selection = nil
  }

  func testPendingWorkflowNavigationCannotCrossAScopeRevocationOrReplayLater() async throws {
    let (session, _, owners, _) = try await setup()
    let owner = owners[0], access = try XCTUnwrap(session.workflowRichAccess(for: owners[0]))
    let source = session.makeRichChatControllerSuite(); source.select(access: access, threadID: owner.thread.threadID)
    let context = WorkflowViewerContext(session: session, transcript: source.transcript,
      headings: source.runtimeItemHeadings, location: owner.location)
    let presenter = WorkflowViewerPresentationStore()
    presenter.queue(context: context, input: .init(owner: owner, reference: try reference(0), request: nil), catalog: nil)
    session.state.hosts[0].scopes = []
    presenter.presentPending(); XCTAssertNil(presenter.selection)
    session.state.hosts[0].scopes = ["session:read"]
    presenter.presentPending(); XCTAssertNil(presenter.selection)
  }
}
