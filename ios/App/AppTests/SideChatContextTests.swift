import XCTest
@testable import App

@MainActor
final class SideChatContextTests: XCTestCase {
  func testEveryInputCodecKeepsContextPrivateAndDoesNotChangeTheQuestion() throws {
    let context = TurnClientContext(conversationSnapshot: .init(text: "Private parent answer"))
    let input = RichChatSendInput(prompt: "Side question", config: ["model": .string("gpt-5")], clientContext: context)
    let send = try GeneratedRemoteV3Contract.richSend(threadID: "child", input: input)
    let steerInput = RichSetPendingSteerInput(prompt: input.prompt, segments: nil, config: input.config, clientContext: context)
    let steer = try GeneratedRemoteV3Contract.richSetSteer(threadID: "child", input: steerInput)
    let queue = try GeneratedRemoteV3Contract.richQueueFollowUpRequest(threadID: "child", input: steerInput)
    let request = ThreadRelaunchRequest(projectID: "project", agentKind: "codex",
      config: .init(model: "gpt-5"), prompt: input.prompt, parentThreadID: "parent", presentationMode: .gui,
      worktreePath: "/fixture/worktree", clientContext: context)
    let start = try GeneratedRemoteV3Contract.threadCommandRequest(threadID: "child", command: .start(request), commandID: "one-question")
    for data in [send.body, steer.body, start.body] {
      let body = try JSONDecoding.decode(RichJSON.self, from: data)
      XCTAssertEqual(body.objectValue?["prompt"], .string("Side question"))
      XCTAssertEqual(body.objectValue?["clientContext"], context.richChatWireValue)
    }
    let queued = try JSONDecoding.decode(RichJSON.self, from: queue)
    XCTAssertEqual(queued.objectValue?["payload"]?.objectValue?["prompt"], .string("Side question"))
    XCTAssertEqual(queued.objectValue?["payload"]?.objectValue?["clientContext"], context.richChatWireValue)
    XCTAssertFalse(String(reflecting: context).contains("Private parent answer"))
    let ordinary = try GeneratedRemoteV3Contract.richSend(threadID: "ordinary", input: .init(prompt: "Hello", config: ["model": .string("gpt-5")]))
    XCTAssertNil(try JSONDecoding.decode(RichJSON.self, from: ordinary.body).objectValue?["clientContext"])
  }

  func testExistingInputRejectsAnOversizedConversationSnapshotAtTheGeneratedBoundary() {
    let context = TurnClientContext(conversationSnapshot: .init(text: String(repeating: "x", count: 50_001)))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.richSend(threadID: "child",
      input: .init(prompt: "Question", config: [:], clientContext: context)))
  }

  func testAbsentAndUnknownCapabilitiesRejectBeforeReadingAnyParentHistory() async throws {
    let peer = SideChatContextPeer()
    let gateway = SelectedSideChatContextGateway { peer.selection }
    for versions: [Int]? in [nil, [], [99]] {
      peer.versions = versions
      do { _ = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000); XCTFail("Unsupported host accepted") }
      catch { XCTAssertEqual(error as? SideChatContextFailure, .hostUpdateRequired) }
    }
    XCTAssertEqual(peer.cursors.count, 0)
  }

  func testWalkIsIndependentChronologicalAndCapturesAgainForEveryQuestion() async throws {
    let peer = SideChatContextPeer()
    let gateway = SelectedSideChatContextGateway { peer.selection }
    peer.pages = [.init(items: [row("recent", RichItemType.assistantMessage, "Most recent")], nextCursor: 10),
      .init(items: [row("first", RichItemType.userMessage, "First question"), row("earlier", RichItemType.assistantMessage, "Earlier answer")], nextCursor: nil)]
    let captured = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000)
    let first = try XCTUnwrap(captured?.conversationSnapshot?.text)
    XCTAssertEqual(peer.cursors, [nil, 10])
    XCTAssertLessThan(try XCTUnwrap(first.range(of: "First question")?.lowerBound), try XCTUnwrap(first.range(of: "Earlier answer")?.lowerBound))
    XCTAssertLessThan(try XCTUnwrap(first.range(of: "Earlier answer")?.lowerBound), try XCTUnwrap(first.range(of: "Most recent")?.lowerBound))
    peer.pages = [.init(items: [row("new", RichItemType.assistantMessage, "Fresh parent update")], nextCursor: nil)]
    let next = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000)
    XCTAssertTrue(next?.conversationSnapshot?.text.contains("Fresh parent update") == true)
    XCTAssertFalse(next?.conversationSnapshot?.text.contains("Earlier answer") == true)
  }

  func testLeaseReplacementDiscardsTheSnapshotWithoutReadingAnotherHost() async throws {
    let peer = SideChatContextPeer(), source = RichChatControllerTestValues.access()
    peer.pages = [.init(items: [row("one", RichItemType.assistantMessage, "Do not deliver")], nextCursor: 20)]
    peer.afterPage = { peer.access = RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB) }
    let gateway = SelectedSideChatContextGateway { peer.selection }
    do { _ = try await gateway.capture(parent: .init(lease: source.lease, threadID: "parent"), maximumUTF16Count: 50_000); XCTFail("Replaced host accepted") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .staleHost) }
    XCTAssertEqual(peer.cursors, [nil])
  }

  func testLegacyHistoryAndNonAdvancingCursorsFailClosed() async throws {
    let peer = SideChatContextPeer(), gateway = SelectedSideChatContextGateway { peer.selection }
    peer.bounded = false
    do { _ = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000); XCTFail("Legacy history accepted") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .unboundedHistory) }
    peer.bounded = true
    peer.pages = [.init(items: [], nextCursor: 10), .init(items: [], nextCursor: 10)]
    do { _ = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000); XCTFail("Stalled cursor accepted") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .invalidCursor) }
  }

  func testDeadlineCancelsTheParentRead() async throws {
    let peer = SideChatContextPeer()
    peer.delayPage = true
    let gateway = SelectedSideChatContextGateway(timeout: .milliseconds(30)) { peer.selection }
    do { _ = try await gateway.capture(parent: peer.target, maximumUTF16Count: 50_000); XCTFail("Unbounded wait") }
    catch { XCTAssertEqual(error as? SideChatContextFailure, .timedOut) }
    XCTAssertTrue(peer.cancelled)
  }

  func testBoundedContextRetainsFirstQuestionRecentSuffixAndMarksOmissions() throws {
    var snapshot = SideChatContextAccumulator(maximumUTF16Count: 14_000)
    for index in (0..<15).reversed() {
      snapshot.prepend(row("r\(index)", RichItemType.assistantMessage, "Reply \(index) " + String(repeating: "🙂", count: 1_200)))
    }
    snapshot.prepend(row("first", RichItemType.userMessage, "Original question"))
    let text = try XCTUnwrap(snapshot.context?.conversationSnapshot?.text)
    XCTAssertLessThanOrEqual(text.utf16.count, 14_000)
    XCTAssertTrue(text.contains("Original question"))
    XCTAssertTrue(text.contains("Reply 14"))
    XCTAssertFalse(text.contains("Reply 1 "))
    XCTAssertTrue(text.contains("[earlier turns omitted]"))
  }

  func testSourceContextUsesDisplayTruthAndNeverResurrectsSuppressedAssistantText() throws {
    var item = row("answer", RichItemType.assistantMessage, "Old payload")
    item.streams = ["assistant_text": "Visible final stream"]
    XCTAssertTrue(try XCTUnwrap(SideChatContextRow.text(item)).contains("Visible final stream"))
    XCTAssertFalse(try XCTUnwrap(SideChatContextRow.text(item)).contains("Old payload"))
    item.payload = .object(["displayAuthoritative": .bool(true), "content": .array([
      .object(["kind": .string("text"), "text": .string("Hook replacement")])
    ])])
    XCTAssertTrue(try XCTUnwrap(SideChatContextRow.text(item)).contains("Hook replacement"))
    XCTAssertFalse(try XCTUnwrap(SideChatContextRow.text(item)).contains("Visible final stream"))
    item.payload = .object(["displayAuthoritative": .bool(true), "content": .array([
      .object(["kind": .string("text"), "text": .string("")])
    ])])
    XCTAssertNil(SideChatContextRow.text(item))
  }

  func testLongOriginalQuestionKeepsItsAskAndSmallBudgetsKeepTheOmissionMarker() throws {
    let item = row("ask", RichItemType.userMessage, "Original ask " + String(repeating: "x", count: 8_000) + " Tail")
    let text = try XCTUnwrap(SideChatContextRow.text(item))
    XCTAssertTrue(text.contains("Original ask"))
    XCTAssertFalse(text.contains("Tail"))
    var snapshot = SideChatContextAccumulator(maximumUTF16Count: 1_400)
    snapshot.prepend(item)
    let small = try XCTUnwrap(snapshot.context?.conversationSnapshot?.text)
    XCTAssertLessThanOrEqual(small.utf16.count, 1_400)
    XCTAssertTrue(small.contains("Original ask"))
    XCTAssertTrue(small.hasSuffix("[earlier turns omitted]"))
  }

  private func row(_ id: String, _ kind: String, _ text: String) -> PersistedRuntimeItem {
    .init(id: id, type: kind, state: "completed", payload: .object(["content": .array([
      .object(["kind": .string("text"), "text": .string(text)])
    ])]), streams: [:], parentItemId: nil)
  }
}

@MainActor private final class SideChatContextPeer {
  var access = RichChatControllerTestValues.access()
  var versions: [Int]? = [1]
  var bounded = true
  var pages: [RemoteRuntimeItemsPage] = []
  var cursors: [Int?] = []
  var afterPage: (() -> Void)?
  var delayPage = false
  var cancelled = false
  var target: RichChatThreadTarget { .init(lease: access.lease, threadID: "parent") }
  var selection: SideChatContextSelection {
    .init(access: access, environment: { try self.environment() }, page: { _, before in
      self.cursors.append(before)
      if self.delayPage {
        do { try await Task.sleep(for: .seconds(60)) }
        catch { self.cancelled = true; throw error }
      }
      let page = self.pages.isEmpty ? .init(items: [], nextCursor: nil) : self.pages.removeFirst()
      self.afterPage?()
      return self.bounded ? .bounded(.init(page: page)) : .legacy(page)
    })
  }
  private func environment() throws -> RemoteEnvironmentDescriptor {
    var raw: [String: Any] = ["protocolVersion": ProtocolConstants.remoteProtocolVersion,
      "desktopId": "fixture", "label": "Fixture", "appVersion": "test",
      "auth": ["bootstrapMethods": [], "sessionMethods": [], "scopes": []],
      "endpoints": ["httpBaseUrl": "https://fixture.invalid", "wsBaseUrl": "wss://fixture.invalid"]]
    if let versions { raw["capabilities"] = ["conversationSnapshots": ["versions": versions]] }
    return try JSONDecoding.decode(RemoteEnvironmentDescriptor.self, from: JSONSerialization.data(withJSONObject: raw))
  }
}
