import Foundation
import XCTest

@testable import App

@MainActor
final class RichChatTerminalControllerTests: XCTestCase {
  func testGapInstallsFreshWatchBaselineWithNewWatchIdentity() async {
    let gateway = TerminalControllerGateway()
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: TerminalSequenceWatchIDGenerator(["watch-1", "watch-2"])
    )
    let access = Self.access()
    let target = RichChatThreadTarget(lease: access.lease, threadID: "thread-1")
    controller.activate(access: access, threadID: target.threadID)
    await controller.watch(terminalID: target.threadID)
    await controller.receive(
      .cursor(
        TerminalCursorFrame(
          kind: .baseline,
          terminalID: target.threadID,
          watchID: "watch-1",
          generation: "generation-1",
          fromCursor: 0,
          toCursor: 3,
          data: "abc"
        )
      ),
      target: target
    )
    await controller.receive(
      .cursor(
        TerminalCursorFrame(
          kind: .output,
          terminalID: target.threadID,
          watchID: "watch-1",
          generation: "generation-1",
          fromCursor: 4,
          toCursor: 5,
          data: "x"
        )
      ),
      target: target
    )

    try? await Task.sleep(for: .milliseconds(350))
    let watches = await gateway.watchIDs()
    XCTAssertEqual(watches, ["watch-1", "watch-2"])
    XCTAssertEqual(controller.state.watchID, "watch-2")
    XCTAssertFalse(controller.state.cursor?.baselineReceived == true)
  }

  func testBackgroundStopsTransportAndLateFramesCannotPublish() async {
    let gateway = TerminalControllerGateway()
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: TerminalSequenceWatchIDGenerator(["watch-1"])
    )
    let access = Self.access()
    let target = RichChatThreadTarget(lease: access.lease, threadID: "thread-1")
    controller.activate(access: access, threadID: target.threadID)
    await controller.watch(terminalID: target.threadID)

    controller.enterBackground()
    await controller.suspendTransport()
    await controller.receive(
      .cursor(
        TerminalCursorFrame(
          kind: .baseline,
          terminalID: target.threadID,
          watchID: "watch-1",
          generation: "generation-1",
          fromCursor: 0,
          toCursor: 4,
          data: "late"
        )
      ),
      target: target
    )

    let stops = await gateway.stopCount()
    XCTAssertGreaterThanOrEqual(stops, 1)
    XCTAssertNil(controller.state.cursor)
    XCTAssertEqual(controller.state.lifecycle, .inactive)
  }

  func testInputTransportFailureIsAttemptedExactlyOnce() async {
    let gateway = TerminalControllerGateway(writeFailure: .transport)
    let controller = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: TerminalSequenceWatchIDGenerator(["watch-1"])
    )
    controller.activate(access: Self.access(), threadID: "thread-1")
    // Input is only accepted by a watching terminal, so establish the watch first.
    await controller.watch(terminalID: "thread-1")
    XCTAssertEqual(controller.state.lifecycle, .watching)

    await controller.write("pwd\n")

    let writes = await gateway.writeCount()
    XCTAssertEqual(writes, 1)
    XCTAssertEqual(controller.state.failure, .transport)
  }

  func testInputIsRefusedWithoutAWatchingTerminal() async {
    let gateway = TerminalControllerGateway()
    let controller = RichChatTerminalController(gateway: gateway)
    controller.activate(access: Self.access(), threadID: "thread-1")

    await controller.write("pwd\n")

    let writes = await gateway.writeCount()
    XCTAssertEqual(writes, 0)
    XCTAssertEqual(controller.state.failure, .unavailable)
  }

  private static func access() -> RichChatSessionAccess {
    RichChatSessionAccess(
      lease: RichChatHostLease(
        connectionID: ClientConnectionID(
          UUID(uuidString: "88888888-8888-4888-8888-888888888888")!
        ),
        generation: 2
      ),
      isOnline: true,
      isReady: true,
      capabilities: [.terminalRead, .terminalOperate]
    )
  }
}

final class TerminalSequenceWatchIDGenerator: RichChatWatchIDGenerating, @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String]

  init(_ values: [String]) { self.values = values }

  func makeRichChatWatchID() -> String {
    lock.withLock { values.isEmpty ? "fallback-watch" : values.removeFirst() }
  }
}

actor TerminalControllerGateway: RichChatTerminalGateway {
  private var watches: [String] = []
  private var writes = 0
  private var stops = 0
  private let writeFailure: RichChatGatewayError?

  init(writeFailure: RichChatGatewayError? = nil) {
    self.writeFailure = writeFailure
  }

  func watchRichTerminal(
    target _: RichChatThreadTarget,
    terminalID _: String,
    watchID: String
  ) {
    watches.append(watchID)
  }

  func unwatchRichTerminal(target _: RichChatThreadTarget, terminalID _: String) {}
  func startRichTerminal(target _: RichChatThreadTarget, input _: RichChatTerminalStartInput) {}

  func writeRichTerminal(target _: RichChatThreadTarget, data _: String) throws {
    writes += 1
    if let writeFailure { throw writeFailure }
  }

  func resizeRichTerminal(target _: RichChatThreadTarget, size _: RichChatTerminalSize) {}
  func closeRichTerminal(target _: RichChatThreadTarget) {}

  func stopRichTerminalTransport(target _: RichChatThreadTarget) {
    stops += 1
  }

  func watchIDs() -> [String] { watches }
  func writeCount() -> Int { writes }
  func stopCount() -> Int { stops }
}
