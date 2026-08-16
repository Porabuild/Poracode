import Foundation
import Observation

@MainActor
@Observable
final class BrowserMirrorController {
  private(set) var access: BrowserMirrorHostAccess?
  private(set) var browserState: BrowserMirrorState = .empty
  private(set) var loadState: BrowserMirrorLoadState = .idle
  private(set) var mirrorStatus: BrowserMirrorStatus = .starting(tabId: nil)
  private(set) var frame: BrowserMirrorFrame?
  private(set) var watchIntent = false
  private(set) var isMutating = false
  private(set) var lastMutationOutcome: BrowserMirrorMutationOutcome = .none

  private let gateway: any BrowserMirrorGateway
  private let socket: any BrowserMirrorSocketGateway
  private var subscription: Subscription = .none
  private var startedLease: BrowserMirrorHostLease?

  init(
    access: BrowserMirrorHostAccess?,
    gateway: any BrowserMirrorGateway,
    socket: any BrowserMirrorSocketGateway
  ) {
    self.access = access
    self.gateway = gateway
    self.socket = socket
  }

  /// Host lease the controller is currently bound to, if any.
  var currentLease: BrowserMirrorHostLease? { access?.lease }

  /// True when the selected host currently permits mutating browser commands.
  var isOperable: Bool { allowedLease(for: .operate) != nil }

  /// True when a live subscription for the selected host accepts pointer/key input.
  var isStreamingInputAccepted: Bool {
    guard let key = subscription.activeKey else { return false }
    return allowedLease(for: .operate) == key.lease
  }

  func updateAccess(_ next: BrowserMirrorHostAccess?) async {
    let previous = access
    let previousKey = subscription.key
    let shouldUnwind = previous?.lease != next?.lease || !Self.canStream(next)
    access = next

    if shouldUnwind, let lease = previous?.lease {
      subscription = .none
      startedLease = nil
      frame = nil
      if let previousKey { await socket.unwatch(key: previousKey) }
      await socket.stop(lease: lease)
    }

    guard watchIntent, Self.canStream(next) else {
      if next?.isForeground == false { loadState = .unavailable }
      return
    }
    if startedLease != next?.lease { await startSocketIfAllowed() }
  }

  /// Synchronous send gate for backgrounding. Access is downgraded and the subscription
  /// and frame bytes are dropped before returning, so nothing can be enqueued afterwards.
  /// The unwatch/stop that follows is best effort and harmless if it lands late.
  func suspendForBackground() {
    guard let current = access, current.isForeground else { return }
    let key = subscription.key
    let lease = startedLease ?? current.lease
    access = Self.access(current, isForeground: false)
    subscription = .none
    startedLease = nil
    frame = nil
    loadState = .unavailable
    let socket = socket
    Task {
      if let key { await socket.unwatch(key: key) }
      await socket.stop(lease: lease)
    }
  }

  /// Foreground restores access and, when the watch intent survived, performs one
  /// authoritative state read before re-establishing the subscription.
  func resumeFromForeground() async {
    guard let current = access, !current.isForeground else { return }
    access = Self.access(current, isForeground: true)
    guard watchIntent else {
      loadState = .idle
      return
    }
    await refresh()
    await startSocketIfAllowed()
  }

  func beginWatching() async {
    watchIntent = true
    await refresh()
    await startSocketIfAllowed()
  }

  func endWatching() async {
    watchIntent = false
    let key = subscription.key
    let lease = startedLease ?? access?.lease
    subscription = .none
    startedLease = nil
    frame = nil
    if let key { await socket.unwatch(key: key) }
    if let lease { await socket.stop(lease: lease) }
  }

  func refresh() async {
    guard let captured = allowedLease(for: .read) else {
      loadState = .unavailable
      return
    }
    loadState = .loading
    do {
      let value = try await gateway.state(lease: captured)
      guard allowedLease(for: .read) == captured else { return }
      apply(value)
      loadState = .ready
    } catch is CancellationError {
      guard access?.lease == captured else { return }
      loadState = browserState == .empty ? .idle : .ready
    } catch {
      guard access?.lease == captured else { return }
      loadState = .failed(Self.map(error))
    }
  }

  func perform(_ action: BrowserMirrorUIAction) async {
    guard let command = action.command(in: browserState) else { return }
    await perform(command)
  }

  func perform(_ command: BrowserMirrorCommand) async {
    guard !isMutating, let captured = allowedLease(for: .operate) else {
      return
    }
    isMutating = true
    lastMutationOutcome = .none
    defer {
      if access?.lease == captured { isMutating = false }
    }

    do {
      let value = try await gateway.command(command, lease: captured)
      guard allowedLease(for: .operate) == captured else { return }
      apply(value)
      loadState = .ready
    } catch BrowserMirrorFailure.ambiguousMutation {
      guard access?.lease == captured else { return }
      await refreshAfterAmbiguousMutation(lease: captured)
    } catch is CancellationError {
      guard access?.lease == captured else { return }
    } catch {
      guard access?.lease == captured else { return }
      loadState = .failed(Self.map(error))
    }
  }

  func socketReady(lease: BrowserMirrorHostLease, socketGeneration: UInt64) async {
    let key = BrowserMirrorSocketKey(
      lease: lease,
      socketGeneration: socketGeneration
    )
    guard watchIntent, startedLease == lease, allowedLease(for: .read) == lease,
      subscription.key != key
    else { return }

    subscription = .subscribing(key)
    do {
      try await socket.watch(key: key)
      guard watchIntent, startedLease == lease, allowedLease(for: .read) == lease,
        subscription == .subscribing(key)
      else { return }
      subscription = .active(key)
    } catch {
      guard subscription == .subscribing(key) else { return }
      subscription = .none
      if !(error is CancellationError) { loadState = .failed(Self.map(error)) }
    }
  }

  func socketClosed(lease: BrowserMirrorHostLease, socketGeneration: UInt64) {
    let key = BrowserMirrorSocketKey(
      lease: lease,
      socketGeneration: socketGeneration
    )
    guard subscription.key == key else { return }
    subscription = .none
    frame = nil
  }

  func receive(
    data: Data,
    lease: BrowserMirrorHostLease,
    socketGeneration: UInt64
  ) async {
    let key = BrowserMirrorSocketKey(
      lease: lease,
      socketGeneration: socketGeneration
    )
    guard accepts(key) else { return }
    do {
      let event = try await socket.event(from: data, key: key)
      guard accepts(key) else { return }
      receive(event, key: key)
    } catch {
      // Invalid and oversized messages are deliberately dropped without retaining payloads.
    }
  }

  func receive(_ event: BrowserMirrorSocketEvent, key: BrowserMirrorSocketKey) {
    guard accepts(key) else { return }
    switch event {
    case .state(let value):
      apply(value)
      loadState = .ready
    case .frame(let value):
      guard value.tabId == browserState.activeTabId else { return }
      frame = value
    case .status(let value):
      guard statusMatchesActiveTab(value) else { return }
      mirrorStatus = value
      if value == .unavailable {
        frame = nil
        loadState = .unavailable
      }
    }
  }

  func send(_ input: BrowserMirrorInput) async {
    guard let key = subscription.activeKey,
      allowedLease(for: .operate) == key.lease
    else { return }
    do {
      try await socket.input(input, key: key)
    } catch {
      guard accepts(key), !(error is CancellationError) else { return }
      loadState = .failed(Self.map(error))
    }
  }

  func sendText(_ text: String) async {
    for chunk in BrowserMirrorTextChunks.split(text) {
      guard let input = try? BrowserMirrorInput.validatedText(chunk) else { continue }
      await send(input)
    }
  }

  func sendKey(_ key: BrowserMirrorSafeKey) async {
    await send(.key(key))
  }

  func sendTap(at point: BrowserMirrorPoint, in imageRect: BrowserMirrorRect) async {
    guard let mapping = coordinateMapping(point: point, imageRect: imageRect) else { return }
    await send(.tap(x: mapping.pagePoint.x, y: mapping.pagePoint.y))
  }

  func sendScroll(
    from start: BrowserMirrorPoint,
    to end: BrowserMirrorPoint,
    in imageRect: BrowserMirrorRect
  ) async {
    guard let mapping = coordinateMapping(point: start, imageRect: imageRect) else { return }
    await send(
      .scroll(
        x: mapping.pagePoint.x,
        y: mapping.pagePoint.y,
        deltaX: (start.x - end.x) * mapping.pointsToDeviceScale,
        deltaY: (start.y - end.y) * mapping.pointsToDeviceScale
      ))
  }

  /// A mutating command is attempted exactly once. When its outcome is ambiguous the
  /// controller performs one authoritative read and never replays the command.
  private func refreshAfterAmbiguousMutation(lease: BrowserMirrorHostLease) async {
    guard allowedLease(for: .read) == lease else {
      lastMutationOutcome = .ambiguousUnresolved
      loadState = .failed(.ambiguousMutation)
      return
    }
    loadState = .loading
    let refresh = Task { try await gateway.state(lease: lease) }
    do {
      let value = try await refresh.value
      guard allowedLease(for: .read) == lease else { return }
      apply(value)
      lastMutationOutcome = .ambiguousResolved
      loadState = .ready
    } catch {
      guard access?.lease == lease else { return }
      lastMutationOutcome = .ambiguousUnresolved
      loadState = .failed(.ambiguousMutation)
    }
  }

  func acknowledgeMutationOutcome() {
    lastMutationOutcome = .none
  }

  private func startSocketIfAllowed() async {
    guard watchIntent, let lease = allowedLease(for: .read), startedLease != lease else {
      return
    }
    startedLease = lease
    do {
      try await socket.start(lease: lease)
      guard watchIntent, allowedLease(for: .read) == lease else {
        startedLease = nil
        await socket.stop(lease: lease)
        return
      }
    } catch {
      guard access?.lease == lease else { return }
      startedLease = nil
      if !(error is CancellationError) { loadState = .failed(Self.map(error)) }
    }
  }

  private func allowedLease(
    for capability: BrowserMirrorCapability
  ) -> BrowserMirrorHostLease? {
    guard let access,
      (try? BrowserMirrorAccessPolicy.validate(
        access,
        lease: access.lease,
        capability: capability
      )) != nil
    else { return nil }
    return access.lease
  }

  private func accepts(_ key: BrowserMirrorSocketKey) -> Bool {
    subscription.key == key && allowedLease(for: .read) == key.lease
  }

  private func apply(_ value: BrowserMirrorState) {
    browserState = value
    if frame?.tabId != value.activeTabId { frame = nil }
  }

  private func coordinateMapping(
    point: BrowserMirrorPoint,
    imageRect: BrowserMirrorRect
  ) -> BrowserMirrorCoordinateMapping? {
    guard let metadata = frame?.metadata else { return nil }
    return BrowserMirrorCoordinateMapper.map(
      point: point,
      imageRect: imageRect,
      device: BrowserMirrorSize(
        width: metadata.deviceWidth,
        height: metadata.deviceHeight
      )
    )
  }

  private func statusMatchesActiveTab(_ status: BrowserMirrorStatus) -> Bool {
    switch status {
    case .starting(let tabId), .active(let tabId):
      return tabId == nil || tabId == browserState.activeTabId
    case .unavailable:
      return true
    }
  }

  private static func access(
    _ value: BrowserMirrorHostAccess,
    isForeground: Bool
  ) -> BrowserMirrorHostAccess {
    BrowserMirrorHostAccess(
      lease: value.lease,
      protocolVersion: value.protocolVersion,
      isOnline: value.isOnline,
      isReady: value.isReady,
      isForeground: isForeground,
      capabilities: value.capabilities,
      expectedDesktopID: value.expectedDesktopID
    )
  }

  private static func canStream(_ access: BrowserMirrorHostAccess?) -> Bool {
    guard let access else { return false }
    return
      (try? BrowserMirrorAccessPolicy.validate(
        access,
        lease: access.lease,
        capability: .read
      )) != nil
  }

  private static func map(_ error: any Error) -> BrowserMirrorFailure {
    if let failure = error as? BrowserMirrorFailure { return failure }
    return .transport
  }
}

private enum Subscription: Equatable {
  case none
  case subscribing(BrowserMirrorSocketKey)
  case active(BrowserMirrorSocketKey)

  var key: BrowserMirrorSocketKey? {
    switch self {
    case .none: nil
    case .subscribing(let key), .active(let key): key
    }
  }

  var activeKey: BrowserMirrorSocketKey? {
    guard case .active(let key) = self else { return nil }
    return key
  }
}
