import XCTest
@testable import App

@MainActor
final class SideChatAuxiliarySessionTests: XCTestCase {
  func testPrimarySuiteStaysLiveUntilTheLastPresentationDetaches() async throws {
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture") { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "parent")]))
      return api
    }
    defer { Task { await repository.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    let access = try XCTUnwrap(session.currentRichChatAccess)
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(.value(RichChatControllerTestValues.history(threadID: "parent", nextCursor: nil)))
    let suite = RichChatControllerSuite(gateway: gateway)
    suite.select(access: access, threadID: "parent")
    await suite.refreshAuthoritativeHistory()
    let first = UUID(), second = UUID()
    session.attachRichChatSuite(suite, owner: first)
    session.attachRichChatSuite(suite, owner: second)
    session.detachRichChatSuite(suite, owner: first, preservingState: true)
    session.detachRichChatSuite(suite, owner: first)
    XCTAssertTrue(session.activeRichChatSuite === suite)
    XCTAssertFalse(suite.scope.isBackgrounded)
    XCTAssertEqual(suite.transcript.state.loadState, .loaded)
    session.detachRichChatSuite(suite, owner: second, preservingState: true)
    XCTAssertNil(session.activeRichChatSuite)
    XCTAssertTrue(suite.scope.isBackgrounded)
    XCTAssertEqual(suite.transcript.state.loadState, .loaded)
  }

  func testLiveFramesReachBothReducersWithoutMixingTheirTurns() async throws {
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture") { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "parent"), makeThread(id: "side")]))
      return api
    }
    defer { Task { await repository.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    let access = try XCTUnwrap(session.currentRichChatAccess)
    let parentGateway = RichChatControllerGatewayFake(), sideGateway = RichChatControllerGatewayFake()
    await parentGateway.configureHistory(.value(RichChatControllerTestValues.history(threadID: "parent", nextCursor: nil)))
    await sideGateway.configureHistory(.value(RichChatControllerTestValues.history(threadID: "side", nextCursor: nil)))
    let parent = RichChatControllerSuite(gateway: parentGateway), side = RichChatControllerSuite(gateway: sideGateway)
    parent.select(access: access, threadID: "parent"); side.select(access: access, threadID: "side")
    await parent.refreshAuthoritativeHistory(); await side.refreshAuthoritativeHistory()
    XCTAssertNotNil(parent.transcript.state.transcript)
    XCTAssertNotNil(side.transcript.state.transcript)
    let sideBefore = side.transcript.state.transcript?.openTurn
    session.attachRichChatSuite(parent); session.attachRichChatSuite(side, auxiliary: true)
    func frame(_ id: String) -> JSONValue {
      .object(["type": .string("thread-runtime-event"), "threadId": .string(id),
        "event": .object(["type": .string("turn.started"), "threadId": .string(id), "turnId": .string("turn-\(id)")])])
    }
    session.receiveRichChatSupervisoryEvent(frame("parent"), sequence: 11)
    XCTAssertEqual(parent.transcript.state.transcript?.openTurn, true)
    XCTAssertEqual(side.transcript.state.transcript?.openTurn, sideBefore)
    session.receiveRichChatSupervisoryEvent(frame("side"), sequence: 12)
    XCTAssertEqual(parent.transcript.state.transcript?.openTurn, true)
    XCTAssertEqual(side.transcript.state.transcript?.openTurn, true)
    session.detachRichChatSuite(side); session.detachRichChatSuite(parent)
  }

  func testOverlappingAuxiliaryPresentationsKeepOneLiveOwnerAndRetainHiddenState() async throws {
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture") { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "side")]))
      return api
    }
    defer { Task { await repository.wipeSuiteForTests() } }
    await session.bootstrap()
    let suite = session.makeRichChatControllerSuite(), access = try XCTUnwrap(session.currentRichChatAccess)
    suite.select(access: access, threadID: "side")
    let first = UUID(), second = UUID()
    session.attachRichChatSuite(suite, auxiliary: true, owner: first)
    session.attachRichChatSuite(suite, auxiliary: true, owner: second)
    session.detachRichChatSuite(suite, owner: first, preservingState: true)
    XCTAssertEqual(session.attachedRichChatSuites.count, 1)
    XCTAssertFalse(suite.scope.isBackgrounded)
    session.detachRichChatSuite(suite, owner: second, preservingState: true)
    XCTAssertTrue(session.attachedRichChatSuites.isEmpty)
    XCTAssertEqual(suite.scope.threadID, "side")
    XCTAssertTrue(suite.scope.isBackgrounded)
    suite.deselect()
  }

  func testParentAndSideChatKeepIndependentSubscriptionsAndDetachIndependently() async throws {
    var sockets: [FakeLiveSocket] = []
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture",
      apiFactory: { endpoint, token in
        let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "parent"), makeThread(id: "side")]))
        return api
      }, socketFactory: { _ in let socket = FakeLiveSocket(); sockets.append(socket); return socket })
    defer { Task { await repository.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    let access = try XCTUnwrap(session.currentRichChatAccess)
    let parent = session.makeRichChatControllerSuite(), side = session.makeRichChatControllerSuite()
    parent.select(access: access, threadID: "parent")
    side.select(access: access, threadID: "side")
    session.attachRichChatSuite(parent)
    session.attachRichChatSuite(side, auxiliary: true)
    XCTAssertTrue(session.activeRichChatSuite === parent)
    XCTAssertEqual(parent.scope.threadID, "parent")
    XCTAssertEqual(side.scope.threadID, "side")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      Set(sockets.last?.interests ?? []) == Set(["parent", "side"])
    }
    session.detachRichChatSuite(side)
    XCTAssertTrue(session.activeRichChatSuite === parent)
    XCTAssertEqual(parent.scope.threadID, "parent")
    XCTAssertNil(side.scope.threadID)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) { sockets.last?.interests == ["parent"] }
    session.detachRichChatSuite(parent)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) { sockets.last?.interests == [] }
  }

  func testReplacingThePrimaryPageKeepsTheAuxiliaryOwnerAndRejectsAnotherHostsSuite() async throws {
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture") { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "parent"), makeThread(id: "side"), makeThread(id: "next")]))
      return api
    }
    defer { Task { await repository.wipeSuiteForTests() } }
    await session.bootstrap()
    let access = try XCTUnwrap(session.currentRichChatAccess)
    let parent = session.makeRichChatControllerSuite(), side = session.makeRichChatControllerSuite(), next = session.makeRichChatControllerSuite()
    for (suite, id) in [(parent, "parent"), (side, "side"), (next, "next")] { suite.select(access: access, threadID: id) }
    session.attachRichChatSuite(parent)
    session.attachRichChatSuite(side, auxiliary: true)
    session.attachRichChatSuite(next)
    XCTAssertNil(parent.scope.threadID)
    XCTAssertEqual(side.scope.threadID, "side")
    XCTAssertTrue(session.attachedRichChatSuite(threadID: "side") === side)
    let foreign = session.makeRichChatControllerSuite()
    foreign.select(access: RichChatControllerTestValues.access(host: ClientConnectionID()), threadID: "side")
    session.attachRichChatSuite(foreign, auxiliary: true)
    XCTAssertEqual(session.attachedRichChatSuites.count, 2)
    session.detachRichChatSuite(side)
    session.detachRichChatSuite(next)
  }
}
