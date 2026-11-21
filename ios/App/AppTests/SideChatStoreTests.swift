import XCTest
@testable import App

@MainActor
final class SideChatStoreTests: XCTestCase {
  func testRetainedDraftKeepsTheFullSourceConfigurationAndOriginalWorktree() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    var source = makeThread(id: "parent")
    source.agentInstanceId = "profile-b"
    source.worktreePath = "/fixture/worktree"
    source.worktreeBranch = "review"
    source.config.model = "exact-model"
    source.config.mode = "agent"
    source.config.effort = "high"
    source.config.contextSize = "128k"
    source.config.fast = false
    source.config.thinking = true
    source.config.crew = .null
    source.config.mcpServerOverrides = ["private-server": false]
    let entry = try session.sideChats.open(session: session, source: source, owner: try XCTUnwrap(session.selectedConnectionId))
    XCTAssertEqual(entry.draft.configuredConfiguration, source.config.lifecycleLaunchConfiguration)
    XCTAssertEqual(entry.draft.launchSeed?.initialAgentInstanceID, "profile-b")
    XCTAssertEqual(entry.draft.launchSeed?.worktreePath, "/fixture/worktree")
    XCTAssertEqual(entry.draft.launchSeed?.parentThreadID, "parent")
    XCTAssertTrue(entry.draft.launchSeed?.locksPresentationMode == true)
    entry.draft.prompt = "Keep this unsent question"
    XCTAssertTrue(try session.sideChats.open(session: session, source: source, owner: try XCTUnwrap(session.selectedConnectionId)) === entry)
    XCTAssertEqual(entry.draft.prompt, "Keep this unsent question")
    XCTAssertTrue(session.sideChats.isHidden(threadID: entry.launchThreadID, connectionID: entry.key.connectionID))
    session.sideChats.retire(entry, session: session)
  }

  func testCaptureIsFreshPerQuestionAndInitialRetryReusesItsExactPrivatePayload() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    let reader = SideChatCaptureDouble()
    let store = SideChatStore(contextGateway: { _ in reader })
    let source = makeThread(id: "parent")
    let entry = try store.open(session: session, source: source, owner: try XCTUnwrap(session.selectedConnectionId))
    let target = try XCTUnwrap(session.threadLifecycleTarget(threadID: entry.launchThreadID))
    let request = ThreadRelaunchRequest(projectID: source.projectId, agentKind: source.agentKind,
      config: .init(model: "model"), prompt: "Side question")
    let first = try await store.prepare(request, target: target, commandID: "original", session: session)
    XCTAssertEqual(first.clientContext?.conversationSnapshot?.text, "Parent revision 1")
    XCTAssertEqual(first.parentThreadID, source.id)
    XCTAssertEqual(first.focus, false)
    let retry = try await store.prepare(request, target: target, commandID: "original", session: session)
    XCTAssertEqual(first, retry, "The same idempotency command must keep the original question and context bytes")
    let access = try XCTUnwrap(session.currentRichChatAccess)
    let followUp = try await store.capture(for: .init(lease: access.lease, threadID: entry.launchThreadID), session: session)
    XCTAssertEqual(followUp?.conversationSnapshot?.text, "Parent revision 3")
    let targets = await reader.targets
    XCTAssertEqual(targets.map(\.threadID), [source.id, source.id, source.id])
    store.retire(entry, session: session)
  }

  func testRevocationStopsAnOutgoingViewFromSendingWithoutItsContext() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    let reader = SideChatCaptureDouble(), store = SideChatStore(contextGateway: { _ in reader })
    let entry = try store.open(session: session, source: makeThread(id: "parent"), owner: try XCTUnwrap(session.selectedConnectionId))
    let target = try XCTUnwrap(session.currentRichChatAccess).lease
    let child = RichChatThreadTarget(lease: target, threadID: entry.launchThreadID)
    store.retire(entry, session: session)
    do { _ = try await store.capture(for: child, session: session); XCTFail("Revoked child continued as an ordinary conversation") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .staleHost) }
    XCTAssertTrue(store.isHidden(threadID: child.threadID, connectionID: target.connectionID))
    let reads = await reader.targets
    XCTAssertTrue(reads.isEmpty)
  }

  func testReplacingAHostLeaseDiscardsTheCaptureAndDifferentHostsNeverBorrowContext() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    let reader = SideChatCaptureDouble(), store = SideChatStore(contextGateway: { _ in reader })
    let entry = try store.open(session: session, source: makeThread(id: "parent"), owner: try XCTUnwrap(session.selectedConnectionId))
    let old = try XCTUnwrap(session.currentRichChatAccess).lease
    _ = session.state.operationOwner.bumpWorkGeneration()
    do { _ = try await store.capture(for: .init(lease: old, threadID: entry.launchThreadID), session: session); XCTFail("Stale lease accepted") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .staleHost) }
    let foreign = RichChatHostLease(connectionID: ClientConnectionID(), generation: 1)
    let context = try await store.capture(for: .init(lease: foreign, threadID: entry.launchThreadID), session: session)
    XCTAssertNil(context)
    store.retire(entry, session: session)
  }

  func testAStaleSourceCannotOpenSideChatOnAnotherHostWithTheSameThreadID() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    let sourceOwner = try XCTUnwrap(session.selectedConnectionId)
    let source = makeThread(id: "same-id")
    session.state.selectedConnectionId = ClientConnectionID()
    session.state.snapshot = makeShell(seq: 2, threads: [makeThread(id: "same-id")])
    XCTAssertThrowsError(try session.sideChats.open(session: session, source: source, owner: sourceOwner))
    XCTAssertTrue(session.sideChats.entries.isEmpty)
  }

  func testContextBudgetMatchesThePWAForSmallAndLargeWindows() {
    XCTAssertEqual(SideChatContextBudget.limit("8k"), 11_200)
    XCTAssertEqual(SideChatContextBudget.limit("1,000"), 1_400)
    XCTAssertEqual(SideChatContextBudget.limit("128K"), 50_000)
    XCTAssertEqual(SideChatContextBudget.limit("1m"), 50_000)
    XCTAssertEqual(SideChatContextBudget.limit("unknown"), 50_000)
  }

  func testParentRemovalRequiresAuthoritativeMembershipAndTransportErrorsRetainTheDraft() async throws {
    let (session, repository) = try await readySession()
    defer { Task { await repository.wipeSuiteForTests() } }
    let reader = SideChatCaptureDouble(), store = SideChatStore(contextGateway: { _ in reader })
    let entry = try store.open(session: session, source: makeThread(id: "parent"), owner: try XCTUnwrap(session.selectedConnectionId))
    entry.draft.prompt = "Do not lose this because the parent was paged out"
    session.state.snapshot = makeShell(seq: 2, threads: [])
    await reader.setParents(["parent"])
    await store.reconcileParents(session: session)
    XCTAssertFalse(entry.revoked)
    XCTAssertEqual(entry.draft.prompt, "Do not lose this because the parent was paged out")
    await reader.setMembershipFailure(true)
    await store.reconcileParents(session: session)
    XCTAssertFalse(entry.revoked)
    await reader.setMembershipFailure(false)
    await reader.setParents([])
    await store.reconcileParents(session: session)
    XCTAssertTrue(entry.revoked)
    XCTAssertTrue(store.entries.isEmpty)
  }

  private func readySession() async throws -> (AppSession, SessionCredentialRepository) {
    let (session, repository, _) = try await makeSession(seedProfile: makeProfile(), seedToken: "fixture") { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "parent")]))
      return api
    }
    await session.bootstrap()
    session.state.socketState = .online
    session.state.conversationSnapshotsSupported = true
    return (session, repository)
  }
}

private actor SideChatCaptureDouble: SideChatContextCapturing {
  private(set) var targets: [RichChatThreadTarget] = []
  private var parents: Set<String>?
  private var membershipFailure = false
  func setParents(_ ids: Set<String>) { parents = ids }
  func setMembershipFailure(_ value: Bool) { membershipFailure = value }
  func existingParents(_ ids: [String], lease: RichChatHostLease) async throws -> Set<String>? {
    if membershipFailure { throw SideChatContextFailure.unavailable }
    return parents
  }
  func capture(parent: RichChatThreadTarget, maximumUTF16Count: Int) async throws -> TurnClientContext? {
    targets.append(parent)
    return .init(conversationSnapshot: .init(text: "Parent revision \(targets.count)"))
  }
}
