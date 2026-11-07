import Foundation
import XCTest

@testable import App

/// The resume action after the host restarted or the provider closed
/// unexpectedly. A restarted host holds no session for the thread and refuses
/// the send with a typed pre-effect 422, so the resume relaunches the thread
/// with the same prompt (desktop's resume launch), never after an ambiguous
/// failure. An unexpected close settles the row with a marker but sends no
/// `turn.completed`, so the row outranks the transcript's stale open turn.
@MainActor
final class RichChatResumeRecoveryTests: XCTestCase {
  override func setUp() {
    super.setUp()
    BoundedCatalogURLProtocol.reset()
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  // MARK: - Relaunch after a host restart

  func testASendTheHostRefusedForWantOfASessionRelaunchesTheThreadWithTheSamePrompt() async {
    let (conversation, gateway) = await refusedConversation()
    let refusal = conversation.state.failure
    XCTAssertEqual(
      refusal, .rejected(statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode)
    )
    let latest = row(sessionRef: sessionRef("session-b"))
    XCTAssertTrue(RichChatResumePlanner.relaunches(after: refusal, latest: latest))
    let api = ThreadLifecycleRemoteAPIFake()

    let relaunched = await RichChatResumeRelaunch.relaunch(
      RichChatResumePlanner.relaunchRequest(
        base(prompt: "Fix the build"), latest: latest, configuration: ThreadConfig(model: "model-b")
      ),
      target: ThreadLifecycleTestValues.target(threadID: "thread-rich"),
      lifecycle: lifecycle(api),
      replacing: .rejected(statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode),
      in: conversation
    )

    XCTAssertTrue(relaunched)
    let starts = await api.starts()
    XCTAssertEqual(starts.count, 1)
    XCTAssertEqual(starts.first?.threadID, "thread-rich")
    XCTAssertEqual(starts.first?.prompt, "Fix the build")
    XCTAssertEqual(starts.first?.config.model, "model-b", "the send's configuration")
    XCTAssertEqual(
      starts.first?.sessionReference,
      ThreadSessionReference(
        providerSessionID: "session-b", discoveredAt: "2026-10-29T00:00:00Z",
        executionIdentity: "scope-b"),
      "the latest row's provider session is resumed"
    )
    let calls = await gateway.calls
    XCTAssertEqual(calls, ["send"], "the refused send is never repeated")
    // The relaunch replaced the refused send, so no failure is left on the banner.
    XCTAssertNil(conversation.state.failure)
    XCTAssertFalse(conversation.state.requiresAuthoritativeRefresh)
  }

  func testAFailedRelaunchKeepsTheRefusalAndAnUncertainOneIsReconciledNotResent() async {
    let refusal = RichChatControllerFailure.rejected(
      statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode
    )
    let (failedConversation, _) = await refusedConversation()
    let failedAPI = ThreadLifecycleRemoteAPIFake()
    await failedAPI.setOutcome(.transport(.http(statusCode: 409, code: "conflict")))

    let failed = await RichChatResumeRelaunch.relaunch(
      base(prompt: "Fix the build"),
      target: ThreadLifecycleTestValues.target(threadID: "thread-rich"),
      lifecycle: lifecycle(failedAPI),
      replacing: refusal,
      in: failedConversation
    )
    XCTAssertFalse(failed, "the action stays to retry")
    XCTAssertEqual(failedConversation.state.failure, refusal)
    XCTAssertFalse(failedConversation.state.requiresAuthoritativeRefresh)

    let recorder = RichChatRefreshRecorder()
    let (uncertainConversation, uncertainGateway) = await refusedConversation(refresh: recorder)
    let uncertainAPI = ThreadLifecycleRemoteAPIFake()
    await uncertainAPI.setOutcome(.transport(.ambiguousOutcome))
    let lifecycleRefresh = ThreadLifecycleRefreshSpy()

    let uncertain = await RichChatResumeRelaunch.relaunch(
      base(prompt: "Fix the build"),
      target: ThreadLifecycleTestValues.target(threadID: "thread-rich"),
      lifecycle: lifecycle(uncertainAPI, refresh: lifecycleRefresh),
      replacing: refusal,
      in: uncertainConversation
    )

    XCTAssertFalse(uncertain)
    XCTAssertEqual(uncertainConversation.state.failure, .ambiguousOutcome)
    // One authoritative read on each side reconciles it; nothing is sent again.
    XCTAssertTrue(uncertainConversation.state.requiresAuthoritativeRefresh)
    let refreshes = await recorder.requests
    XCTAssertEqual(refreshes.map(\.1), [.ambiguousMutation])
    XCTAssertEqual(lifecycleRefresh.leases.count, 1)
    let starts = await uncertainAPI.starts()
    XCTAssertEqual(starts.count, 1)
    let calls = await uncertainGateway.calls
    XCTAssertEqual(calls, ["send"])
  }

  func testOnlyTheTypedRefusalOfASettledRowThatCanResumeRelaunches() {
    let refused = RichChatControllerFailure.rejected(
      statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode
    )

    XCTAssertTrue(RichChatResumePlanner.relaunches(after: refused, latest: row()))
    XCTAssertTrue(
      RichChatResumePlanner.relaunches(after: refused, latest: row(canResumeWithConfig: nil)))
    XCTAssertTrue(RichChatResumePlanner.relaunches(after: refused, latest: row(sessionRef: nil)))
    // Like desktop: no session to resume and no config resume, no relaunch.
    XCTAssertFalse(
      RichChatResumePlanner.relaunches(
        after: refused, latest: row(sessionRef: nil, canResumeWithConfig: false)))
    for status in ["launching", "working", "needs_approval", "needs_reply"] {
      XCTAssertFalse(
        RichChatResumePlanner.relaunches(after: refused, latest: row(status: status)), status)
    }
    XCTAssertFalse(RichChatResumePlanner.relaunches(after: refused, latest: nil))
    for failure: RichChatControllerFailure? in [
      .ambiguousOutcome, .rejected(statusCode: 409, code: "conflict"),
      .rejected(statusCode: 422, code: nil), .transport, .offline, nil,
    ] {
      XCTAssertFalse(
        RichChatResumePlanner.relaunches(after: failure, latest: row()), "\(String(describing: failure))")
    }
  }

  /// The page's row is the bounded catalog row a delivered `thread-state`
  /// folds into, re-read after the send returns. A turn another client started
  /// while the send was out therefore blocks the relaunch: the host's start
  /// would replace that live session.
  func testTheRelaunchReadsTheLiveCatalogRowSoARunningThreadIsNeverRestarted() async throws {
    let harness = try await catalogHarness()
    func state(_ seq: Int, _ status: String, _ extra: [String: JSONValue]) {
      deliverThreadState(harness, seq: seq, status: status, extra: extra)
    }
    let refused = RichChatControllerFailure.rejected(
      statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode
    )

    state(10, "inactive", ["interruptedTurn": .string("restart"), "canResumeWithConfig": .bool(true)])
    XCTAssertTrue(
      RichChatResumePlanner.relaunches(
        after: refused, latest: harness.session.richChatThread(id: "t00000")))
    state(11, "working", [:])
    let live = harness.session.richChatThread(id: "t00000")
    XCTAssertEqual(live?.status, "working")
    XCTAssertNil(live?.interruptedTurn)
    XCTAssertFalse(RichChatResumePlanner.relaunches(after: refused, latest: live))
  }

  /// `thread-state` folds the live provider session like the host's
  /// `persistThreadStateEvent`: a stated reference naming another provider
  /// session or execution identity replaces the row's; an absent, null,
  /// unreadable or unchanged one keeps it; a foreign-provider straggler and a
  /// thread exit leave it alone.
  func testThreadStateFoldsTheSessionReferenceLikeTheHost() async throws {
    let harness = try await catalogHarness()
    func state(_ seq: Int, _ status: String, _ extra: [String: JSONValue]) {
      deliverThreadState(harness, seq: seq, status: status, extra: extra)
    }
    func stored() -> RemoteSessionRef? {
      harness.session.richChatThread(id: "t00000")?.sessionRef
    }
    let first = RemoteSessionRef(
      providerSessionID: "session-a", discoveredAt: "2026-10-29T00:00:00Z",
      executionIdentity: "scope-a")

    state(10, "working", ["sessionRef": wireRef("session-a", "2026-10-29T00:00:00Z", "scope-a")])
    XCTAssertEqual(stored(), first, "a row adopts the first stated reference")
    state(11, "working", ["sessionRef": wireRef("session-a", "2026-10-29T00:09:00Z", "scope-a")])
    XCTAssertEqual(stored(), first, "the same session restated keeps the stored reference")
    for (seq, value) in [
      (12, JSONValue.null), (13, .string("session-b")), (14, .object([:])),
      (15, wireRef("", "2026-10-29T00:01:00Z", nil)),
      (16, .object(["providerSessionId": .string("session-b")])),
    ] {
      state(seq, "working", ["sessionRef": value])
      XCTAssertEqual(stored(), first, "\(value)")
    }
    state(17, "working", [:])
    XCTAssertEqual(stored(), first, "an absent reference keeps it")
    state(
      18, "idle",
      [
        "agentKind": .string("other-provider"),
        "sessionRef": wireRef("session-z", "2026-10-29T00:01:00Z", nil),
      ])
    XCTAssertEqual(stored(), first, "a foreign-provider straggler never touches it")

    state(19, "working", ["sessionRef": wireRef("session-a", "2026-10-29T00:02:00Z", "scope-b")])
    XCTAssertEqual(stored()?.executionIdentity, "scope-b", "a new execution identity replaces it")
    state(20, "working", ["sessionRef": wireRef("session-b", "2026-10-29T00:03:00Z", nil)])
    XCTAssertEqual(
      stored(),
      RemoteSessionRef(
        providerSessionID: "session-b", discoveredAt: "2026-10-29T00:03:00Z", executionIdentity: nil),
      "a new provider session replaces it"
    )
    harness.session.handleServerMessageForTests(
      .event(
        seq: 21,
        event: .object([
          "type": .string("thread-exited"), "threadId": .string("t00000"), "exitCode": .null,
        ])
      )
    )
    XCTAssertEqual(stored()?.providerSessionID, "session-b", "a thread exit keeps it")
  }

  /// A provider session reported while the turn ran, then a supervisor reset
  /// that publishes restart without restating it: the relaunch resumes that
  /// newer conversation, not the one the row was loaded with.
  func testARestartRelaunchResumesTheSessionDeliveredBeforeIt() async throws {
    let harness = try await catalogHarness()
    deliverThreadState(
      harness, seq: 10, status: "working",
      extra: ["sessionRef": wireRef("session-a", "2026-10-29T00:00:00Z", nil)])
    deliverThreadState(
      harness, seq: 11, status: "working",
      extra: ["sessionRef": wireRef("session-b", "2026-10-29T00:01:00Z", nil)])
    deliverThreadState(
      harness, seq: 12, status: "inactive",
      extra: ["interruptedTurn": .string("restart"), "canResumeWithConfig": .bool(true)])
    let refusal = RichChatControllerFailure.rejected(
      statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode
    )
    let latest = try XCTUnwrap(harness.session.richChatThread(id: "t00000"))
    XCTAssertTrue(RichChatResumePlanner.relaunches(after: refusal, latest: latest))
    let (conversation, _) = await refusedConversation()
    let api = ThreadLifecycleRemoteAPIFake()

    let relaunched = await RichChatResumeRelaunch.relaunch(
      RichChatResumePlanner.relaunchRequest(
        base(prompt: RichChatStrings.resumeContinuePrompt), latest: latest,
        configuration: ThreadConfig(model: "model-b")),
      target: ThreadLifecycleTestValues.target(threadID: "thread-rich"),
      lifecycle: lifecycle(api),
      replacing: refusal,
      in: conversation
    )

    XCTAssertTrue(relaunched)
    let starts = await api.starts()
    XCTAssertEqual(starts.map(\.sessionReference?.providerSessionID), ["session-b"])
  }

  /// An uncertain relaunch requires an authoritative read. A failed read
  /// acknowledges nothing, so the page's `canOperate` gate keeps the action
  /// withheld until a read succeeds.
  func testResumeStaysWithheldUntilAnUncertainRelaunchIsReconciled() async {
    let gateway = RichChatControllerGatewayFake()
    let history = RichChatControllerTestValues.history(items: [
      RichChatControllerTestValues.persistedItem(
        id: "u1", type: RichItemType.userMessage, text: "Fix the build")
    ])
    await gateway.configureHistory(.value(history))
    await gateway.configureMutation(
      .failure(
        .http(
          statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode, missingScope: nil)),
      for: "send"
    )
    let suite = RichChatControllerSuite(gateway: gateway, refreshRequester: RichChatRefreshRecorder())
    suite.select(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    await suite.refreshAuthoritativeHistory()
    let settled = row()
    func offered() -> RichChatResumePlan? {
      RichChatResumePlanner.offer(
        thread: settled,
        items: suite.transcript.state.transcript?.itemsInOrder ?? [],
        canSubmit: !suite.requiresAuthoritativeRefresh,
        isTurnActive: false
      )
    }
    XCTAssertEqual(offered(), .resend(prompt: "Fix the build"))
    let sent = await suite.conversation.send(
      RichChatResumePlanner.sendInput(for: .resend(prompt: "Fix the build"), config: [:])
    )
    XCTAssertFalse(sent)
    let api = ThreadLifecycleRemoteAPIFake()
    await api.setOutcome(.transport(.ambiguousOutcome))
    _ = await RichChatResumeRelaunch.relaunch(
      base(prompt: "Fix the build"),
      target: ThreadLifecycleTestValues.target(threadID: "thread-rich"),
      lifecycle: lifecycle(api),
      replacing: .rejected(statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode),
      in: suite.conversation
    )
    XCTAssertTrue(suite.requiresAuthoritativeRefresh)
    XCTAssertNil(offered())

    await gateway.configureHistory(.failure(.transport))
    await suite.refreshAuthoritativeHistory()
    XCTAssertTrue(suite.requiresAuthoritativeRefresh, "a failed read reconciles nothing")
    XCTAssertNil(offered())

    await gateway.configureHistory(.value(history))
    await suite.refreshAuthoritativeHistory()
    XCTAssertFalse(suite.requiresAuthoritativeRefresh)
    XCTAssertEqual(offered(), .resend(prompt: "Fix the build"))
  }

  /// The selected gateway keeps a safe host code and the 422 classifies as a
  /// definite rejection, so the controller publishes the typed refusal.
  func testTheHostsTypedRefusalReachesTheControllerAsADefiniteRejection() {
    XCTAssertEqual(
      RemoteMutationClassification.classify(
        statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode),
      .definiteFailure
    )
    XCTAssertEqual(
      RichChatControllerFailure.map(
        RichChatGatewayError.http(
          statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode, missingScope: nil)
      ),
      .rejected(statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode)
    )
  }

  // MARK: - Stale open turn after an unexpected close

  func testASettledRowWithACutOffMarkerOutranksTheOpenTurnAnUnexpectedCloseLeaves() async throws {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureHistory(
      .value(
        RichChatControllerTestValues.history(items: [
          RichChatControllerTestValues.persistedItem(
            id: "u1", type: RichItemType.userMessage, text: "Fix the build")
        ])))
    let transcript = RichChatTranscriptController(gateway: gateway)
    let target = RichChatControllerTestValues.target()
    transcript.activate(access: RichChatControllerTestValues.access(), threadID: target.threadID)
    await transcript.loadHistory()
    transcript.receiveLiveEvents(
      [.turnStarted(threadID: target.threadID, turnID: "turn-a")], sequence: 11, target: target
    )
    // The host's unexpected-close sequence: inactive with a marker, then the
    // exit, and no `turn.completed`. Neither reaches the rich transcript.
    for envelope: RichJSON in [
      .object([
        "type": .string("thread-state"), "threadId": .string(target.threadID),
        "status": .string("inactive"), "attention": .string("none"),
        "interruptedTurn": .string("error"),
      ]),
      .object([
        "type": .string("thread-exited"), "threadId": .string(target.threadID), "exitCode": .null,
      ]),
    ] {
      XCTAssertThrowsError(try RichRuntimeEventDecoder.decode(envelope))
    }
    XCTAssertEqual(transcript.state.transcript?.openTurn, true)
    let items = transcript.state.transcript?.itemsInOrder ?? []
    let settled = row(marker: "error")

    // The composer drops Stop and offers the resume, as desktop does.
    let openTurnCounts = RichChatResumePlanner.countsOpenTurn(true, thread: settled)
    XCTAssertFalse(openTurnCounts)
    XCTAssertEqual(
      RichChatResumePlanner.offer(
        thread: settled, items: items, canSubmit: true, isTurnActive: openTurnCounts),
      .resend(prompt: "Fix the build")
    )
    // Until the host settles the row, its open turn still holds.
    var working = settled
    working.status = "working"
    var unmarked = settled
    unmarked.interruptedTurn = nil
    for live in [working, unmarked] {
      XCTAssertTrue(RichChatResumePlanner.countsOpenTurn(true, thread: live))
    }
    XCTAssertFalse(RichChatResumePlanner.countsOpenTurn(false, thread: unmarked))
  }

  /// The page and composer glue cannot be rendered in a unit test; its wiring
  /// to the tested rules is pinned here.
  func testThePageAndComposerRouteTheResumeThroughTheseRules() throws {
    let page = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadView.swift")
    let resume = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadResume.swift")
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerResume.swift")

    XCTAssertTrue(page.contains("isTurnActive: isComposerTurnActive,"))
    XCTAssertTrue(page.contains("resumeContext: composerResume"))
    // The relaunch is admitted against the live catalog row, and the offer is
    // gated on reconciliation through `canOperate`.
    XCTAssertTrue(page.contains("var thread: RemoteThread? { session.richChatThread(id: threadID) }"))
    XCTAssertTrue(page.contains("hasOperateAccess && !suite.requiresAuthoritativeRefresh"))
    XCTAssertTrue(resume.contains("canSubmit: canOperate && !suite.conversation.state.isSending"))
    XCTAssertTrue(resume.contains("guard let refusal = suite.conversation.state.failure, let latest = thread,"))
    XCTAssertTrue(resume.contains("RichChatResumePlanner.countsOpenTurn("))
    XCTAssertTrue(resume.contains("isTurnActive: isComposerTurnActive,"))
    XCTAssertTrue(resume.contains("RichChatResumePlanner.relaunches(after: refusal, latest: latest)"))
    XCTAssertTrue(
      resume.contains("session.threadStartExistingRequest(threadID: threadID, prompt: prompt)"))
    XCTAssertTrue(resume.contains("lifecycle: session.makeThreadLifecycleController()"))
    XCTAssertTrue(resume.contains("&& !resumeState.isRelaunching"))
    XCTAssertTrue(composer.contains("var succeeded = await controller.send(input)"))
    XCTAssertTrue(
      composer.contains("succeeded = await context.relaunchRefused(input.prompt, sentConfiguration)"))
  }

  // MARK: - Fixtures

  private func catalogHarness() async throws -> BoundedCatalogSessionHarness {
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: BoundedCatalogHostFixture(),
      threadCount: 1,
      projectCount: 1,
      configurePolicy: { policy in
        var next = policy
        next.drainDebounceMs = 1
        next.periodicReconcileEnabled = false
        return next
      }
    )
    await harness.waitUntil("threads converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 1
    }
    return harness
  }

  private func deliverThreadState(
    _ harness: BoundedCatalogSessionHarness,
    seq: Int,
    status: String,
    extra: [String: JSONValue]
  ) {
    harness.session.handleServerMessageForTests(
      .event(
        seq: seq,
        event: .object(
          [
            "type": .string("thread-state"), "threadId": .string("t00000"),
            "status": .string(status), "attention": .string("none"),
          ].merging(extra) { _, new in new }
        )
      )
    )
  }

  private func wireRef(_ id: String, _ discoveredAt: String, _ identity: String?) -> JSONValue {
    var object: [String: JSONValue] = [
      "providerSessionId": .string(id), "discoveredAt": .string(discoveredAt),
    ]
    if let identity { object["executionIdentity"] = .string(identity) }
    return .object(object)
  }

  private func refusedConversation(
    refresh: any RichChatAuthoritativeRefreshRequesting = RichChatNoopRefreshRequester()
  ) async -> (RichChatConversationController, RichChatControllerGatewayFake) {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(
      .failure(
        .http(
          statusCode: 422, code: RichChatResumePlanner.sessionAbsenceRefusalCode, missingScope: nil))
    )
    let conversation = RichChatConversationController(gateway: gateway, refreshRequester: refresh)
    conversation.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let sent = await conversation.send(
      RichChatResumePlanner.sendInput(for: .resend(prompt: "Fix the build"), config: [:])
    )
    XCTAssertFalse(sent)
    return (conversation, gateway)
  }

  private func lifecycle(
    _ api: ThreadLifecycleRemoteAPIFake,
    refresh: ThreadLifecycleRefreshSpy? = nil
  ) -> ThreadLifecycleController {
    let box = ThreadLifecycleSelectionBox(
      selection: ThreadLifecycleTransportSelection(
        access: ThreadLifecycleTestValues.access(),
        api: api
      ))
    return ThreadLifecycleController(
      gateway: SelectedThreadSessionGateway { box.selection },
      authoritativeRefresh: { lease in await refresh?.refresh(lease) }
    )
  }

  private func base(prompt: String) -> ThreadStartExistingRequest {
    var request = ThreadLifecycleTestValues.startExisting(threadID: "thread-rich")
    request.prompt = prompt
    return request
  }

  private func row(
    status: String = "inactive",
    marker: String? = "restart",
    sessionRef: RemoteSessionRef? = RemoteSessionRef(
      providerSessionID: "session-a", discoveredAt: "2026-10-29T00:00:00Z", executionIdentity: nil),
    canResumeWithConfig: Bool? = true
  ) -> RemoteThread {
    var thread = RichChatControllerTestValues.thread()
    thread.status = status
    thread.interruptedTurn = marker
    thread.sessionRef = sessionRef
    thread.canResumeWithConfig = canResumeWithConfig
    return thread
  }

  private func sessionRef(_ id: String) -> RemoteSessionRef {
    RemoteSessionRef(
      providerSessionID: id, discoveredAt: "2026-10-29T00:00:00Z", executionIdentity: "scope-b")
  }

  private static func source(_ path: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(path)
    return try String(contentsOf: url, encoding: .utf8)
  }
}
