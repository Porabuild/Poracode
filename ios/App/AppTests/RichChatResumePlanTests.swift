import Foundation
import XCTest

@testable import App

/// The empty composer's resume action for a cut-off turn, held to the desktop
/// `threadResumeState.ts` rules: an unanswered plain-text message is sent
/// again, a turn the agent had started (or one that was more than typed text)
/// is asked to continue, a Stop leaves no action, and a failed send keeps it to
/// retry. The host-owned marker rides the thread row: `thread-state` folds it
/// the way the host persists it and older hosts simply omit it.
@MainActor
final class RichChatResumePlanTests: XCTestCase {
  override func setUp() {
    super.setUp()
    BoundedCatalogURLProtocol.reset()
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  // MARK: - Plan

  func testResendsTheLatestMessageWhenTheAgentNeverAnsweredIt() {
    let plan = RichChatResumePlanner.plan(items: [
      typed("u1", "First"),
      item("a1", RichItemType.assistantMessage, streams: ["assistant_text": "Hi"]),
      typed("u2", "Fix the build"),
      item("e1", RichItemType.error),
    ])

    XCTAssertEqual(plan, .resend(prompt: "Fix the build"))
  }

  func testContinuesOnceTheAgentHadStartedAnswering() {
    let plan = RichChatResumePlanner.plan(items: [
      typed("u1", "Fix the build"),
      item("r1", RichItemType.reasoning, payload: .object(["summary": .string("Looking")])),
      item("t1", "tool_call"),
    ])

    XCTAssertEqual(plan, .continueResponse)
  }

  func testContinuesInsteadOfRebuildingAMessageThatWasMoreThanTypedText() {
    let payloads: [[String: RichJSON]] = [
      [
        "content": .array([
          text("Look"),
          .object([
            "kind": .string("image"), "mimeType": .string("image/png"),
            "dataUrl": .string(""), "path": .string("/tmp/a.png"),
          ]),
        ])
      ],
      [
        "content": .array([
          .object([
            "kind": .string("skill"), "name": .string("review"),
            "invocation": .string("/review"),
          ])
        ])
      ],
      [
        "content": .array([
          text("Use"),
          .object([
            "kind": .string("thread"), "threadId": .string("t2"), "title": .string("Other"),
          ]),
        ])
      ],
      ["content": .array([text("Scope")]), "questionAnswer": .object(["answers": .array([])])],
      ["content": .array([text("Pick")]), "replyForm": .object(["questions": .array([])])],
    ]

    for payload in payloads {
      XCTAssertEqual(
        RichChatResumePlanner.plan(items: [user("u1", payload)]),
        .continueResponse,
        "\(payload)"
      )
    }
  }

  func testSkipsVoiceTranscriptsAndSubAgentPromptsToFindTheUsersOwnMessage() {
    XCTAssertEqual(
      RichChatResumePlanner.plan(items: [
        typed("u1", "Fix the build"),
        user("v1", ["content": .array([text("um")]), "turnIndependent": .bool(true)]),
      ]),
      .resend(prompt: "Fix the build")
    )
    XCTAssertEqual(
      RichChatResumePlanner.plan(items: [
        typed("u1", "Fix the build"),
        item("t1", "tool_call"),
        typed("c1", "Inspect the renderer", parentItemID: "t1"),
      ]),
      .continueResponse
    )
  }

  func testAnOpenedButEmptyReplyIsNotOutputUntilTextStreamsIn() {
    let emptyReply = item(
      "a1",
      RichItemType.assistantMessage,
      payload: .object(["content": .array([text("  ")])])
    )
    var items = [typed("u1", "Fix the build"), emptyReply, item("r1", RichItemType.reasoning)]

    XCTAssertEqual(RichChatResumePlanner.plan(items: items), .resend(prompt: "Fix the build"))
    items[1].streams = ["assistant_text": "Looking"]
    XCTAssertEqual(RichChatResumePlanner.plan(items: items), .continueResponse)
  }

  func testALongReplyWithoutItsMessageContinuesAndAnEmptyHistoryOffersNothing() {
    XCTAssertEqual(
      RichChatResumePlanner.plan(items: [item("t1", "command_execution")]),
      .continueResponse
    )
    XCTAssertNil(RichChatResumePlanner.plan(items: []))
  }

  // MARK: - Offer

  func testOnlyAnErrorOrRestartMarkerOffersTheAction() {
    let items = [typed("u1", "Fix the build")]
    for marker in ["error", "restart"] {
      XCTAssertEqual(offer(thread(marker: marker), items), .resend(prompt: "Fix the build"))
    }
    // Stop clears the marker on the host, so an intentionally stopped turn (no
    // marker), an older host (no field), and an unknown future marker never
    // offer the action.
    XCTAssertNil(offer(thread(marker: nil), items))
    XCTAssertNil(offer(thread(marker: "something-else"), items))
  }

  func testActiveTurnsUnavailableSessionsAndTerminalThreadsKeepTheNormalComposer() {
    let items = [typed("u1", "Fix the build")]
    let row = thread(marker: "error")

    XCTAssertNil(offer(row, items, canSubmit: false))
    XCTAssertNil(offer(row, items, isTurnActive: true))
    for status in ["launching", "working", "needs_approval", "needs_reply"] {
      var active = row
      active.status = status
      XCTAssertNil(offer(active, items), status)
    }
    var terminal = row
    terminal.presentationMode = "terminal"
    XCTAssertNil(offer(terminal, items))
    var failed = row
    failed.status = "error"
    XCTAssertEqual(offer(failed, items), .resend(prompt: "Fix the build"))
  }

  func testTypingRestoresTheSendButtonAndTheLabelNamesTheAction() {
    XCTAssertEqual(
      RichChatResumePlanner.label(for: .resend(prompt: "Fix"), composerHasContent: false),
      RichChatStrings.resendLastMessage
    )
    XCTAssertEqual(
      RichChatResumePlanner.label(for: .continueResponse, composerHasContent: false),
      RichChatStrings.resumeResponse
    )
    XCTAssertNil(RichChatResumePlanner.label(for: .continueResponse, composerHasContent: true))
    XCTAssertNil(RichChatResumePlanner.label(for: nil, composerHasContent: false))
  }

  func testResumeSendsThePlainTextShapeOfATypedMessage() {
    let config: [String: RichJSON] = ["model": .string("model-a")]

    let resend = RichChatResumePlanner.sendInput(
      for: .resend(prompt: " Fix the build\n"), config: config
    )
    XCTAssertEqual(resend.prompt, "Fix the build")
    XCTAssertEqual(resend.segments, [.text(content: " Fix the build\n")])
    XCTAssertEqual(resend.config, config)
    XCTAssertTrue(resend.userMessageItemID?.hasPrefix("user-") == true)

    let resumed = RichChatResumePlanner.sendInput(for: .continueResponse, config: config)
    XCTAssertEqual(resumed.prompt, RichChatStrings.resumeContinuePrompt)
    XCTAssertEqual(resumed.segments, [.text(content: RichChatStrings.resumeContinuePrompt)])
  }

  func testAFailedResumeKeepsTheActionAndASuccessfulSendWaitsForTheHost() async {
    let items = [typed("u1", "Fix the build")]
    let row = thread(marker: "error")
    let input = RichChatResumePlanner.sendInput(for: .resend(prompt: "Fix the build"), config: [:])

    let failedGateway = RichChatControllerGatewayFake()
    await failedGateway.configureMutation(.failure(.transport))
    let failedController = RichChatConversationController(gateway: failedGateway)
    failedController.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let failed = await failedController.send(input)
    XCTAssertFalse(failed)
    XCTAssertEqual(failedController.state.failure, .transport, "the failure is shown")
    let afterFailure = RichChatResumePlanner.suppression(
      afterSubmitSucceeded: failed, rowAtSubmit: row, previous: nil
    )
    XCTAssertNil(afterFailure)
    XCTAssertEqual(offer(row, items, suppressedRow: afterFailure), .resend(prompt: "Fix the build"))

    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let sent = await controller.send(input)
    XCTAssertTrue(sent)
    let sentInputs = await gateway.sentInputs
    XCTAssertEqual(sentInputs, [input], "the conversation's own send operation carries it")
    let afterSend = RichChatResumePlanner.suppression(
      afterSubmitSucceeded: sent, rowAtSubmit: row, previous: afterFailure
    )
    XCTAssertEqual(afterSend, row)
    XCTAssertNil(offer(row, items, suppressedRow: afterSend))
    // The host's next statement replaces the row (a turn that failed again
    // re-arms the marker), which lifts the suppression.
    var restated = row
    restated.updatedAt = "2026-08-12T00:05:00.000Z"
    XCTAssertEqual(
      offer(restated, items, suppressedRow: afterSend), .resend(prompt: "Fix the build")
    )
  }

  // MARK: - Catalog marker

  /// Folded like the host's `persistThreadStateEvent`: a stated value wins and
  /// `null` (Stop) clears it, a starting turn retires it, absence (an older
  /// host) preserves it, and a thread exit leaves it for the host to state.
  func testThreadStateFoldsTheMarkerLikeTheHost() async throws {
    let harness = try await catalogHarness()
    func state(_ seq: Int, _ status: String, _ extra: [String: JSONValue] = [:]) {
      deliverThreadState(harness, seq: seq, status: status, extra: extra)
    }
    func marker() -> String? {
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.interruptedTurn
    }

    state(10, "error", ["interruptedTurn": .string("error")])
    XCTAssertEqual(marker(), "error")
    state(11, "error")
    XCTAssertEqual(marker(), "error", "an older-host frame without the field keeps it")
    state(12, "idle", ["interruptedTurn": .null])
    XCTAssertNil(marker(), "Stop's explicit null clears it")

    state(13, "inactive", ["interruptedTurn": .string("restart")])
    XCTAssertEqual(marker(), "restart")
    state(14, "working")
    XCTAssertNil(marker(), "a starting turn retires it even when the emitter never stated it")

    state(15, "working", ["interruptedTurn": .string("error")])
    state(16, "working")
    XCTAssertEqual(marker(), "error", "a working rebroadcast is not a new turn")

    harness.session.handleServerMessageForTests(
      .event(
        seq: 17,
        event: .object([
          "type": .string("thread-exited"),
          "threadId": .string("t00000"),
          "exitCode": .null,
        ])
      )
    )
    XCTAssertEqual(marker(), "error")
  }

  func testAForeignProviderStragglerNeverTouchesTheMarker() async throws {
    let harness = try await catalogHarness()
    deliverThreadState(
      harness, seq: 20, status: "error", extra: ["interruptedTurn": .string("error")]
    )
    deliverThreadState(
      harness,
      seq: 21,
      status: "idle",
      extra: ["agentKind": .string("other-provider"), "interruptedTurn": .null]
    )

    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.interruptedTurn,
      "error"
    )
  }

  func testRemoteThreadDecodesTheMarkerAndOlderHostsOmitIt() throws {
    var payload: [String: Any] = [
      "id": "thread-1",
      "projectId": "project-1",
      "title": "Thread",
      "agentKind": "provider",
      "config": ["model": "model-a"],
      "status": "inactive",
      "attention": "none",
      "presentationMode": "gui",
      "createdAt": "2026-10-29T00:00:00Z",
      "updatedAt": "2026-10-29T00:00:00Z",
      "interruptedTurn": "restart",
    ]
    let restored = try JSONDecoder().decode(
      RemoteThread.self, from: JSONSerialization.data(withJSONObject: payload)
    )
    XCTAssertEqual(restored.interruptedTurn, "restart")
    XCTAssertEqual(
      offer(restored, [typed("u1", "Fix the build")]), .resend(prompt: "Fix the build"),
      "a row restored after a restart still offers the action"
    )

    payload.removeValue(forKey: "interruptedTurn")
    let older = try JSONDecoder().decode(
      RemoteThread.self, from: JSONSerialization.data(withJSONObject: payload)
    )
    XCTAssertNil(older.interruptedTurn)
    XCTAssertNil(offer(older, [typed("u1", "Fix the build")]))
  }

  // MARK: - Localization

  func testResumeStringsAreLocalizedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Localizable.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    for key in [
      "rich_chat_resend_last_message", "rich_chat_resume_response",
      "rich_chat_resume_continue_prompt",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], "\(key):\(locale)")
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  // MARK: - Fixtures

  private func offer(
    _ thread: RemoteThread,
    _ items: [RichRuntimeItem],
    canSubmit: Bool = true,
    isTurnActive: Bool = false,
    suppressedRow: RemoteThread? = nil
  ) -> RichChatResumePlan? {
    RichChatResumePlanner.offer(
      thread: thread,
      items: items,
      canSubmit: canSubmit,
      isTurnActive: isTurnActive,
      suppressedRow: suppressedRow
    )
  }

  private func thread(marker: String?) -> RemoteThread {
    var row = RichChatControllerTestValues.thread()
    row.status = "inactive"
    row.interruptedTurn = marker
    return row
  }

  private func text(_ value: String) -> RichJSON {
    .object(["kind": .string("text"), "text": .string(value)])
  }

  private func typed(_ id: String, _ value: String, parentItemID: String? = nil) -> RichRuntimeItem {
    user(id, ["content": .array([text(value)])], parentItemID: parentItemID)
  }

  private func user(
    _ id: String,
    _ payload: [String: RichJSON],
    parentItemID: String? = nil
  ) -> RichRuntimeItem {
    item(id, RichItemType.userMessage, payload: .object(payload), parentItemID: parentItemID)
  }

  private func item(
    _ id: String,
    _ type: String,
    payload: RichJSON? = nil,
    streams: [String: String] = [:],
    parentItemID: String? = nil
  ) -> RichRuntimeItem {
    RichRuntimeItem(
      id: id,
      type: type,
      state: .completed,
      payload: payload,
      streams: streams,
      parentItemID: parentItemID
    )
  }

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
            "type": .string("thread-state"),
            "threadId": .string("t00000"),
            "status": .string(status),
            "attention": .string("none"),
          ].merging(extra) { _, new in new }
        )
      )
    )
  }
}
