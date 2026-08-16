import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

@MainActor
final class BrowserMirrorControllerTests: XCTestCase {
  func testBackgroundUnwatchesStopsAndForegroundResumesExistingIntent() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)

    await controller.beginWatching()
    await controller.socketReady(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 1
    )
    let key1 = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 1
    )
    controller.receive(.frame(BrowserMirrorTestValues.frame()), key: key1)
    XCTAssertNotNil(controller.frame)

    await controller.updateAccess(
      BrowserMirrorTestValues.access(foreground: false))
    XCTAssertTrue(controller.watchIntent)
    XCTAssertNil(controller.frame)

    controller.receive(.frame(BrowserMirrorTestValues.frame(marker: 2)), key: key1)
    XCTAssertNil(controller.frame)

    await controller.updateAccess(BrowserMirrorTestValues.access())
    await controller.socketReady(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 2
    )
    await controller.socketReady(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 2
    )

    let calls = await socket.recordedCalls()
    XCTAssertEqual(
      calls.filter {
        if case .start = $0 { return true }
        return false
      }.count, 2)
    XCTAssertEqual(
      calls.filter {
        if case .unwatch(key1) = $0 { return true }
        return false
      }.count, 1)
    XCTAssertEqual(
      calls.filter {
        if case .stop = $0 { return true }
        return false
      }.count, 1)
    XCTAssertEqual(
      calls.filter {
        if case .watch = $0 { return true }
        return false
      }.count, 2)
  }

  func testBackgroundDuringWatchAwaitUnwindsExactlyOnceAndLateCompletionIsStale() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    await socket.setBlockWatch(true)
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()

    let ready = Task {
      await controller.socketReady(
        lease: BrowserMirrorTestValues.lease,
        socketGeneration: 4
      )
    }
    await socket.waitUntilWatchStarted()
    await controller.updateAccess(
      BrowserMirrorTestValues.access(foreground: false))
    await socket.releaseWatch()
    await ready.value

    let key = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 4
    )
    let calls = await socket.recordedCalls()
    XCTAssertEqual(
      calls.filter {
        if case .unwatch(key) = $0 { return true }
        return false
      }.count, 1)
    XCTAssertNil(controller.frame)
  }

  func testReconnectResubscribesOncePerReadyGenerationAndIgnoresOldGeneration() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 1)
    controller.socketClosed(lease: BrowserMirrorTestValues.lease, socketGeneration: 1)
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 2)
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 2)

    let oldKey = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 1
    )
    controller.receive(.frame(BrowserMirrorTestValues.frame()), key: oldKey)
    XCTAssertNil(controller.frame)

    let calls = await socket.recordedCalls()
    XCTAssertEqual(
      calls.filter {
        if case .watch = $0 { return true }
        return false
      }.count, 2)
  }

  func testHostAndConnectionGenerationMustMatchExactly() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 3)

    let otherKey = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.otherLease,
      socketGeneration: 3
    )
    controller.receive(.state(.empty), key: otherKey)
    XCTAssertEqual(controller.browserState, BrowserMirrorTestValues.state)

    await controller.updateAccess(
      BrowserMirrorTestValues.access(lease: BrowserMirrorTestValues.otherLease))
    let oldKey = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 3
    )
    controller.receive(.state(.empty), key: oldKey)
    XCTAssertEqual(controller.browserState, BrowserMirrorTestValues.state)
  }

  func testAmbiguousMutationTriggersAuthoritativeRefreshWithoutRetry() async {
    let gateway = BrowserMirrorGatewaySpy()
    await gateway.setCommandOutcome(.failure(.ambiguousMutation))
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)

    await controller.perform(.createTab(url: nil))

    let commandCount = await gateway.recordedCommandCount()
    let stateCalls = await gateway.recordedStateCalls()
    XCTAssertEqual(commandCount, 1)
    XCTAssertEqual(stateCalls, [BrowserMirrorTestValues.lease])
    XCTAssertEqual(controller.browserState, BrowserMirrorTestValues.state)
    XCTAssertEqual(controller.loadState, .ready)
  }

  func testOnlyNewestActiveTabFrameIsRetained() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 9)
    let key = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 9
    )

    controller.receive(.frame(BrowserMirrorTestValues.frame(marker: 1)), key: key)
    controller.receive(.frame(BrowserMirrorTestValues.frame(marker: 2)), key: key)
    XCTAssertEqual(controller.frame?.jpegData, BrowserMirrorTestValues.frame(marker: 2).jpegData)

    controller.receive(
      .frame(BrowserMirrorTestValues.frame(tabId: "inactive", marker: 3)),
      key: key
    )
    XCTAssertEqual(controller.frame?.jpegData, BrowserMirrorTestValues.frame(marker: 2).jpegData)

    controller.receive(.state(.empty), key: key)
    XCTAssertNil(controller.frame)
  }

  func testInputIsSuppressedUntilTheSubscriptionIsActiveAndAfterItCloses() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    let rect = BrowserMirrorRect(left: 0, top: 0, width: 390, height: 844)
    let key = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 3
    )

    // No subscription yet: pointer, text, and key input must not reach the socket.
    await controller.sendTap(at: BrowserMirrorPoint(x: 195, y: 422), in: rect)
    await controller.sendText("hello")
    await controller.sendKey(.enter)
    XCTAssertFalse(controller.isStreamingInputAccepted)
    let beforeWatch = await socket.recordedCalls()
    XCTAssertTrue(
      beforeWatch.allSatisfy {
        if case .input = $0 { return false }
        return true
      })

    await controller.beginWatching()
    await controller.socketReady(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 3
    )
    controller.receive(.frame(BrowserMirrorTestValues.frame()), key: key)
    XCTAssertTrue(controller.isStreamingInputAccepted)
    await controller.sendKey(.enter)
    let afterWatch = await socket.recordedCalls()
    XCTAssertTrue(afterWatch.contains(.input(.key(.enter), key)))

    // The socket generation ends: input stops and the retained frame bytes are dropped.
    controller.socketClosed(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 3
    )
    XCTAssertNil(controller.frame)
    XCTAssertFalse(controller.isStreamingInputAccepted)
    await controller.sendKey(.escape)
    let afterClose = await socket.recordedCalls()
    XCTAssertFalse(afterClose.contains(.input(.key(.escape), key)))
  }

  func testSynchronousBackgroundGateBlocksSendsAndForegroundReadsBeforeRewatch() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()
    await controller.socketReady(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 6
    )
    let key = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 6
    )
    controller.receive(.frame(BrowserMirrorTestValues.frame()), key: key)
    XCTAssertNotNil(controller.frame)
    let readsBeforeBackground = await gateway.recordedStateCalls().count

    // Synchronous: the gate closes before any awaited teardown runs.
    controller.suspendForBackground()
    XCTAssertNil(controller.frame)
    XCTAssertFalse(controller.isStreamingInputAccepted)
    XCTAssertTrue(controller.watchIntent)
    XCTAssertEqual(controller.loadState, .unavailable)
    await controller.sendKey(.enter)
    let backgroundCalls = await socket.recordedCalls()
    XCTAssertFalse(backgroundCalls.contains(.input(.key(.enter), key)))

    // Late frames from the superseded generation are harmless.
    controller.receive(.frame(BrowserMirrorTestValues.frame(marker: 7)), key: key)
    XCTAssertNil(controller.frame)

    await controller.resumeFromForeground()
    let readsAfterForeground = await gateway.recordedStateCalls().count
    XCTAssertEqual(readsAfterForeground, readsBeforeBackground + 1)
    XCTAssertEqual(controller.loadState, .ready)
  }

  func testTapAndDragMapThroughCurrentFrameMetadata() async {
    let gateway = BrowserMirrorGatewaySpy()
    let socket = BrowserMirrorSocketSpy()
    let controller = makeController(gateway: gateway, socket: socket)
    await controller.beginWatching()
    await controller.socketReady(lease: BrowserMirrorTestValues.lease, socketGeneration: 5)
    let key = BrowserMirrorSocketKey(
      lease: BrowserMirrorTestValues.lease,
      socketGeneration: 5
    )
    controller.receive(.frame(BrowserMirrorTestValues.frame()), key: key)
    let rect = BrowserMirrorRect(left: 0, top: 0, width: 390, height: 844)

    await controller.sendTap(at: BrowserMirrorPoint(x: 195, y: 422), in: rect)
    await controller.sendScroll(
      from: BrowserMirrorPoint(x: 195, y: 422),
      to: BrowserMirrorPoint(x: 185, y: 402),
      in: rect
    )

    let calls = await socket.recordedCalls()
    XCTAssertTrue(calls.contains(.input(.tap(x: 640, y: 360), key)))
    guard
      let scroll = calls.compactMap({ call -> BrowserMirrorInput? in
        if case .input(let input, _) = call, case .scroll = input { return input }
        return nil
      }).first
    else { return XCTFail() }
    guard case .scroll(let x, let y, let deltaX, let deltaY) = scroll else {
      return XCTFail()
    }
    XCTAssertEqual(x, 640, accuracy: 0.000_001)
    XCTAssertEqual(y, 360, accuracy: 0.000_001)
    XCTAssertGreaterThan(deltaX, 0)
    XCTAssertGreaterThan(deltaY, 0)
  }

  private func makeController(
    gateway: BrowserMirrorGatewaySpy,
    socket: BrowserMirrorSocketSpy
  ) -> BrowserMirrorController {
    BrowserMirrorController(
      access: BrowserMirrorTestValues.access(),
      gateway: gateway,
      socket: socket
    )
  }
}
