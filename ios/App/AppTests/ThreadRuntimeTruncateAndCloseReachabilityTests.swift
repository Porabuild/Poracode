import Foundation
import XCTest

@testable import App

/// `thread-runtime-truncate` (`POST /api/threads/{threadId}/runtime/truncate`)
/// and `thread-close` (`POST /api/threads/{threadId}/close`) as the user can
/// actually reach them: a per-item timeline action and a thread-level toolbar
/// action, both behind confirmation.
@MainActor
final class ThreadRuntimeTruncateAndCloseReachabilityTests: XCTestCase {
  // MARK: - Route contracts

  func testBothRoutesAreTheGeneratedOnesWithTheirExactScopes() throws {
    let expected: [(id: String, method: String, path: String)] = [
      ("thread-runtime-truncate", "POST", "/api/threads/{threadId}/runtime/truncate"),
      ("thread-close", "POST", "/api/threads/{threadId}/close"),
    ]
    for expectation in expected {
      let route = try XCTUnwrap(
        RemoteContractMetadata.routes.first { $0.id == expectation.id },
        expectation.id
      )
      XCTAssertEqual(route.method, expectation.method, expectation.id)
      XCTAssertEqual(route.path, expectation.path, expectation.id)
      XCTAssertEqual(route.scopes, ["session:operate"], expectation.id)
      XCTAssertEqual(route.auth, "bearer", expectation.id)
      XCTAssertEqual(route.status, 200, expectation.id)
    }
  }

  func testTruncateProjectsTheItemIDThroughTheGeneratedCodec() throws {
    let route = try GeneratedRemoteV3Contract.richTruncate(
      threadID: "thread-1",
      after: "item-7"
    )
    let body = try XCTUnwrap(RichJSON.decode(route.body).objectValue)
    XCTAssertEqual(body["itemId"]?.stringValue, "item-7")
  }

  // MARK: - Eligibility

  func testOnlyItemsWithSomethingAfterThemAndARealIDAreEligible() {
    XCTAssertTrue(
      RichChatTruncateEligibility.isEligible(itemID: "item-1", lastVisibleItemID: "item-9")
    )
    XCTAssertFalse(
      RichChatTruncateEligibility.isEligible(itemID: "item-9", lastVisibleItemID: "item-9"),
      "Truncating after the last item would remove nothing"
    )
    for blank in ["", " ", "\n", "\t "] {
      XCTAssertFalse(
        RichChatTruncateEligibility.isEligible(itemID: blank, lastVisibleItemID: "item-9"),
        "A blank id can never be addressed on the wire"
      )
    }
  }

  func testTheActionIsStructurallyAbsentWhenTheHostCannotAcceptIt() {
    let unavailable = RichChatTimelineActions.none
    XCTAssertNil(unavailable.requestTruncate)
    XCTAssertFalse(unavailable.canTruncate(itemID: "item-1"))

    let available = RichChatTimelineActions(lastVisibleItemID: "item-9") { _ in }
    XCTAssertTrue(available.canTruncate(itemID: "item-1"))
    XCTAssertFalse(available.canTruncate(itemID: "item-9"))
    XCTAssertFalse(available.canTruncate(itemID: "  "))
  }

  // MARK: - Truncate dispatch

  func testAnEmptyItemIDNeverReachesTheTransport() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.truncate(after: "")

    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
    XCTAssertEqual(controller.state.failure, .invalidRequest)
  }

  func testTruncateMakesExactlyOneAttemptAndRefreshesAfterSuccess() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    let controller = RichChatConversationController(
      gateway: gateway,
      refreshRequester: refresh
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.truncate(after: "item-3")

    let calls = await gateway.calls.filter { $0 == "truncate" }
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(controller.state.lastCompletedOperation, .truncate)
    XCTAssertNil(controller.state.failure)
    let reasons = await refresh.requests.map(\.1)
    XCTAssertEqual(reasons, [.conversationChanged])
  }

  func testAnAmbiguousTruncateAsksForAnAuthoritativeReadAndIsNeverRetried() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    let controller = RichChatConversationController(
      gateway: gateway,
      refreshRequester: refresh
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.truncate(after: "item-3")

    let calls = await gateway.calls.filter { $0 == "truncate" }
    XCTAssertEqual(calls.count, 1)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    let reasons = await refresh.requests.map(\.1)
    XCTAssertEqual(reasons, [.ambiguousMutation])
  }

  func testTruncateIsRefusedWhileTheSessionIsReadOnly() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(
      access: RichChatControllerTestValues.access(capabilities: [.sessionRead]),
      threadID: "thread-rich"
    )

    await controller.truncate(after: "item-3")

    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
    XCTAssertEqual(controller.state.failure, .capabilityMissing(.sessionOperate))
  }

  func testTruncateIsRefusedWhileAnotherMutationIsAlreadyRunning() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.value(()), barrier: barrier)
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let first = Task { await controller.truncate(after: "item-3") }
    await barrier.waitUntilReached()
    await controller.truncate(after: "item-4")

    let calls = await gateway.calls.filter { $0 == "truncate" }
    XCTAssertEqual(calls.count, 1, "A busy surface must not queue a second mutation")
    XCTAssertEqual(controller.state.failure, .busy)
    await barrier.release()
    await first.value
  }

  // MARK: - Close dispatch and navigation

  func testCloseMakesExactlyOneAttemptAndReportsCompletionForTheCurrentLease() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.close()

    let calls = await gateway.calls.filter { $0 == "close-thread" }
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(
      controller.state.lastCompletedOperation,
      .close,
      "The view navigates back off exactly this signal"
    )
    XCTAssertNil(controller.state.failure)
  }

  func testACloseThatOutranItsLeaseCannotNavigateTheReplacementAway() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.value(()), barrier: barrier)
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let closing = Task { await controller.close() }
    await barrier.waitUntilReached()
    // The user switches host while the single close attempt is in flight.
    controller.activate(
      access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
      threadID: "other-thread"
    )
    await barrier.release()
    await closing.value

    XCTAssertNil(
      controller.state.lastCompletedOperation,
      "A stale close must not raise the signal the view navigates on"
    )
    XCTAssertEqual(controller.state.target?.threadID, "other-thread")
  }

  func testACloseThatFailsDoesNotRaiseTheNavigationSignal() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.close()

    XCTAssertNil(controller.state.lastCompletedOperation)
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
  }

  // MARK: - Visible reachability

  func testTheTimelineOffersTruncateBehindConfirmationAndRealGating() throws {
    let timeline = try Self.source("App/Features/RichChat/UI/RichChatTimelineView.swift")
    XCTAssertTrue(timeline.contains("conversation.truncate(after: intent.id)"))
    XCTAssertTrue(timeline.contains(".confirmationDialog("))
    XCTAssertTrue(timeline.contains("RichChatStrings.truncateConfirmationTitle"))
    XCTAssertTrue(timeline.contains("guard canOperate, !isRefreshing, !isBusy"))
    XCTAssertTrue(timeline.contains("RichChatTruncateEligibility.isEligible("))
  }

  func testTheThreadViewOffersCloseBehindConfirmationAndNavigatesOnlyOnSuccess() throws {
    let view = try Self.source("App/Features/RichChat/UI/RichChatThreadView.swift")
    XCTAssertTrue(view.contains("suite.conversation.close()"))
    XCTAssertTrue(view.contains("RichChatStrings.closeThreadConfirmationTitle"))
    XCTAssertTrue(
      view.contains("onChange(of: suite.conversation.state.lastCompletedOperation)")
    )
    XCTAssertTrue(view.contains("guard operation == .close else { return }"))
    XCTAssertTrue(view.contains("dismiss()"))
    XCTAssertTrue(view.contains(".disabled(!canCloseThread)"))
  }

  func testEveryNewStringIsPresentInAllThirteenLocales() throws {
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
      "rich_chat_truncate_action", "rich_chat_truncate_accessibility",
      "rich_chat_truncate_confirm_title", "rich_chat_truncate_confirm_message",
      "rich_chat_truncate_confirm_button", "rich_chat_close_thread",
      "rich_chat_close_thread_confirm_title", "rich_chat_close_thread_confirm_message",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let unit = try XCTUnwrap(
          (raw as? [String: Any])?["stringUnit"] as? [String: Any],
          "\(key)/\(locale)"
        )
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale)")
        let value = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
        XCTAssertFalse(
          value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          "\(key)/\(locale)"
        )
      }
    }
  }

  private static func source(_ relative: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
    return try String(contentsOf: url, encoding: .utf8)
  }
}
