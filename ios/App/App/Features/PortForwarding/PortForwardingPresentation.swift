import Foundation

struct PortForwardingDetectedRow: Equatable, Identifiable, Sendable {
  let id: Int
  let title: String
  let subtitle: String?
  let canStart: Bool
  let isBusy: Bool
}

struct PortForwardingActiveRow: Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  let value: String
  let canOpen: Bool
  let canStop: Bool
  let isBusy: Bool
}

enum PortForwardingGate: Equatable, Sendable {
  case none
  case noDesktop
  case notEnabled
  case loadFailed(String)
  case looking
  case ready
}

struct PortForwardingViewProjection: Equatable, Sendable {
  let detected: [PortForwardingDetectedRow]
  let active: [PortForwardingActiveRow]
  let isScanning: Bool
  let failureMessage: String?
  let gate: PortForwardingGate

  @MainActor
  init(controller: PortForwardingController, access: PortForwardingHostAccess? = nil) {
    let operation = controller.operation
    let forwardedPorts = Set(controller.snapshot.forwards.map(\.targetPort))
    detected = controller.snapshot.detected.map { port in
      PortForwardingDetectedRow(
        id: port.port,
        title: PortForwardingStrings.localhost(port.port),
        subtitle: port.label ?? (port.protocolValue == .http ? PortForwardingStrings.webServer : nil),
        canStart: operation == .none && !forwardedPorts.contains(port.port),
        isBusy: operation == .starting(port: port.port)
      )
    }
    active = controller.snapshot.forwards.map { forward in
      let busy: Bool
      switch operation {
      case .opening(let id), .stopping(let id): busy = id == forward.id
      default: busy = false
      }
      return PortForwardingActiveRow(
        id: forward.id,
        title: PortForwardingStrings.port(forward.targetPort),
        value: PortForwardingStrings.forwardingValue(
          target: forward.targetPort, listener: forward.listenPort),
        canOpen: operation == .none,
        canStop: operation == .none,
        isBusy: busy
      )
    }
    isScanning = controller.loadState == .scanning
    if case .failed(let failure) = controller.loadState {
      failureMessage = PortForwardingStrings.failure(failure)
    } else {
      failureMessage = nil
    }

    let visibleDetected = detected.filter { $0.canStart || $0.isBusy }
    if access == nil {
      gate = .noDesktop
    } else if !(access?.capabilities.contains(.forward) ?? false) {
      gate = .notEnabled
    } else if let failureMessage {
      gate = .loadFailed(failureMessage)
    } else if controller.loadState == .idle || isScanning, visibleDetected.isEmpty, active.isEmpty {
      gate = .looking
    } else {
      gate = .ready
    }
  }
}
