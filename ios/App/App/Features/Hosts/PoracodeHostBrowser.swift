import Foundation
import Network

/// One discovered desktop, as the Add-host sheet consumes it.
struct DiscoveredPoracodeHost: Identifiable, Equatable {
  let id: String
  let name: String
  let desktopId: String?
  let tlsFingerprint: String?
  var endpoint: String?
}

/**
 * mDNS pairing discovery (V5 plan item P4). The desktop advertises
 * `_poracode._tcp.local` only for TLS-configured lan/tailnet binds.
 * The TXT fingerprint is unauthenticated multicast — discovery rows stay
 * labelled unverified until the user pins via the QR `#fp=` value.
 * Discovery only ever FINDS an endpoint — the one-time pairing credential is
 * still required, and manual entry stays beside it.
 */
@MainActor
final class PoracodeHostBrowser: ObservableObject {
  /// `_poracode._tcp` (DNS-SD drops the trailing `.local` in browse types).
  static let serviceType = "_poracode._tcp."

  @Published private(set) var hosts: [DiscoveredPoracodeHost] = []
  @Published private(set) var isBrowsing = false

  private var browser: NWBrowser?

  func start() {
    guard browser == nil else { return }
    let parameters = NWParameters()
    parameters.includePeerToPeer = true
    let browser = NWBrowser(
      for: .bonjour(type: Self.serviceType, domain: nil),
      using: parameters
    )
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      Task { @MainActor [weak self] in
        self?.apply(results: results)
      }
    }
    browser.stateUpdateHandler = { [weak self] state in
      Task { @MainActor [weak self] in
        if case .failed = state {
          self?.isBrowsing = false
        }
      }
    }
    self.browser = browser
    browser.start(queue: .main)
    isBrowsing = true
  }

  func stop() {
    browser?.cancel()
    browser = nil
    isBrowsing = false
    hosts = []
  }

  /**
   * Resolves the service endpoint to a base URL. The one-time credential is
   * never carried by discovery — the user still pairs with a fresh token.
   */
  func resolveEndpoint(_ host: DiscoveredPoracodeHost) async -> String? {
    guard let serviceEndpoint = serviceEndpoints[host.id] else { return nil }
    return await withCheckedContinuation { continuation in
      let once = ResumeOnce(continuation)
      let connection = NWConnection(to: serviceEndpoint, using: .tcp)
      connection.stateUpdateHandler = { state in
        switch state {
        case .ready:
          var resolved: String?
          if case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint {
            resolved = "https://\(host):\(port)"
          }
          connection.cancel()
          once.resume(returning: resolved)
        case .failed, .cancelled:
          once.resume(returning: nil)
        default:
          break
        }
      }
      connection.start(queue: .global())
      DispatchQueue.global().asyncAfter(deadline: .now() + 4) {
        once.resume(returning: nil)
        connection.cancel()
      }
    }
  }

  /// Service endpoints by host id, kept from the last browse snapshot so
  /// resolution can connect to the exact advertised instance.
  private var serviceEndpoints: [String: NWEndpoint] = [:]

  private func apply(results: Set<NWBrowser.Result>) {
    var resolved: [DiscoveredPoracodeHost] = []
    var endpoints: [String: NWEndpoint] = [:]
    for result in results.sorted(by: { metadataName($0) < metadataName($1) }) {
      guard case let .service(name, _, _, _) = result.endpoint else { continue }
      let txt = bonjourTxtRecords(result)
      let host = DiscoveredPoracodeHost(
        id: name,
        name: name,
        desktopId: txt["id"],
        tlsFingerprint: Self.fingerprint(fromTxt: txt),
        endpoint: nil
      )
      endpoints[name] = result.endpoint
      resolved.append(host)
    }
    serviceEndpoints = endpoints
    hosts = resolved
  }

  private func metadataName(_ result: NWBrowser.Result) -> String {
    if case let .service(name, _, _, _) = result.endpoint {
      return name
    }
    return ""
  }

  private func bonjourTxtRecords(_ result: NWBrowser.Result) -> [String: String] {
    if case let .bonjour(txt) = result.metadata {
      return txt.dictionary
    }
    return [:]
  }

  /// The TXT fingerprint rides as `fp=sha256:<hex>` (matching the pairing link).
  static func fingerprint(fromTxt txt: [String: String]) -> String? {
    guard let raw = txt["fp"]?.trimmingCharacters(in: .whitespacesAndNewlines),
      raw.hasPrefix("sha256:")
    else { return nil }
    let hex = raw.dropFirst("sha256:".count)
    return hex.isEmpty ? nil : String(hex)
  }
}

/// Resume-once guard so the timeout race cannot double-resume the checked
/// continuation in `resolveEndpoint`.
private final class ResumeOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var resumed = false
  private let continuation: CheckedContinuation<String?, Never>

  init(_ continuation: CheckedContinuation<String?, Never>) {
    self.continuation = continuation
  }

  func resume(returning value: String?) {
    lock.lock()
    defer { lock.unlock() }
    guard !resumed else { return }
    resumed = true
    continuation.resume(returning: value)
  }
}
