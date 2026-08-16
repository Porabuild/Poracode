import Foundation
import Observation

@MainActor
@Observable
final class PortForwardingController {
  private(set) var lease: PortForwardingHostLease
  private(set) var snapshot: PortForwardingSnapshot = .empty
  private(set) var loadState: PortForwardingLoadState = .idle
  private(set) var operation: PortForwardingOperation = .none
  private let gateway: any PortForwardingGateway

  init(lease: PortForwardingHostLease, gateway: any PortForwardingGateway) {
    self.lease = lease
    self.gateway = gateway
  }

  func rebind(to lease: PortForwardingHostLease) {
    guard self.lease != lease else { return }
    self.lease = lease
    snapshot = .empty
    loadState = .idle
    operation = .none
  }

  func scan() async {
    let captured = lease
    loadState = .scanning
    do {
      let value = try await gateway.scan(lease: captured)
      try Task.checkCancellation()
      guard lease == captured else { return }
      snapshot = value
      loadState = .ready
    } catch is CancellationError {
      if lease == captured { loadState = snapshot == .empty ? .idle : .ready }
    } catch {
      guard lease == captured else { return }
      loadState = .failed(.map(error))
    }
  }

  func start(port: Int) async {
    guard operation == .none else { return }
    let captured = lease
    operation = .starting(port: port)
    var startedForward: PortForward?
    do {
      let forward = try await gateway.start(port: port, lease: captured)
      try Task.checkCancellation()
      guard lease == captured else { return }
      startedForward = forward
      snapshot = PortForwardingSnapshot(
        detected: snapshot.detected,
        forwards: replacing(forward, in: snapshot.forwards)
      )
      loadState = .ready
    } catch is CancellationError {
    } catch {
      guard lease == captured else { return }
      loadState = .failed(.map(error))
    }
    // A newly started forward opens immediately, mirroring the mobile web list.
    if lease == captured, let forward = startedForward {
      await openForward(forwardID: forward.id, markOperation: false)
    }
    if lease == captured { operation = .none }
  }

  func open(forwardID: String) async {
    guard operation == .none else { return }
    await openForward(forwardID: forwardID, markOperation: true)
  }

  private func openForward(forwardID: String, markOperation: Bool) async {
    let captured = lease
    if markOperation { operation = .opening(forwardID: forwardID) }
    do {
      try await gateway.open(forwardID: forwardID, lease: captured)
      try Task.checkCancellation()
    } catch is CancellationError {
    } catch {
      guard lease == captured else { return }
      loadState = .failed(.map(error))
    }
    if lease == captured, markOperation { operation = .none }
  }

  func stop(forwardID: String) async {
    guard operation == .none else { return }
    let captured = lease
    operation = .stopping(forwardID: forwardID)
    do {
      try await gateway.stop(forwardID: forwardID, lease: captured)
      try Task.checkCancellation()
      guard lease == captured else { return }
      snapshot = PortForwardingSnapshot(
        detected: snapshot.detected,
        forwards: snapshot.forwards.filter { $0.id != forwardID }
      )
      loadState = .ready
    } catch is CancellationError {
    } catch {
      guard lease == captured else { return }
      loadState = .failed(.map(error))
    }
    if lease == captured { operation = .none }
  }

  private func replacing(_ forward: PortForward, in values: [PortForward]) -> [PortForward] {
    (values.filter { $0.id != forward.id && $0.targetPort != forward.targetPort } + [forward])
      .sorted { $0.targetPort < $1.targetPort }
  }
}
