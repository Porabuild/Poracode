import Foundation

struct PortForwardingBrowserOpener: Sendable {
  let open: @MainActor @Sendable (URL) async -> Bool

  init(open: @escaping @MainActor @Sendable (URL) async -> Bool) {
    self.open = open
  }
}

enum PortForwardingTransportError: Error, Equatable, Sendable {
  case invalidRequest
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case transport
  case ambiguousMutation
  case unsafeEntry
  case browserUnavailable
}

protocol PortForwardingRemoteAPI: Sendable {
  func remoteScan() async throws -> PortForwardingSnapshot
  func remoteStart(port: Int) async throws -> PortForward
  func remoteOpen(forwardID: String) async throws
  func remoteEntryURL(forwardID: String) async throws -> URL
  func remoteStop(forwardID: String) async throws
}

struct GeneratedPortForwardingRemoteAPI: PortForwardingRemoteAPI, Sendable {
  private let http: any PortForwardingHTTPExecuting
  private let browser: PortForwardingBrowserOpener

  init(http: any PortForwardingHTTPExecuting, browser: PortForwardingBrowserOpener) {
    self.http = http
    self.browser = browser
  }

  func remoteScan() async throws -> PortForwardingSnapshot {
    let data = try await dispatch(.init(route: .portsRead, body: nil))
    do {
      return try PortForwardingRemoteV3Contract.portsResponse(data)
    } catch {
      throw PortForwardingTransportError.invalidResponse
    }
  }

  func remoteStart(port: Int) async throws -> PortForward {
    let body: Data
    do {
      body = try PortForwardingRemoteV3Contract.forwardRequest(port: port)
    } catch {
      throw PortForwardingTransportError.invalidRequest
    }
    let data = try await dispatchMutation(.init(route: .portForward, body: body))
    do {
      return try PortForwardingRemoteV3Contract.forwardResponse(data)
    } catch {
      throw PortForwardingTransportError.ambiguousMutation
    }
  }

  func remoteOpen(forwardID: String) async throws {
    let url = try await remoteEntryURL(forwardID: forwardID)
    try Task.checkCancellation()
    guard await browser.open(url) else {
      throw PortForwardingTransportError.browserUnavailable
    }
  }

  func remoteEntryURL(forwardID: String) async throws -> URL {
    let body: Data
    do {
      body = try PortForwardingRemoteV3Contract.enterRequest(forwardID: forwardID)
    } catch {
      throw PortForwardingTransportError.invalidRequest
    }
    let data = try await dispatchMutation(.init(route: .portEnter, body: body))
    let enterPath: String
    do {
      enterPath = try PortForwardingRemoteV3Contract.enterResponse(data)
    } catch {
      throw PortForwardingTransportError.ambiguousMutation
    }
    do {
      return try PortForwardingEntryURL.build(
        endpoint: http.endpoint, enterPath: enterPath, expectedForwardID: forwardID)
    } catch {
      throw PortForwardingTransportError.unsafeEntry
    }
  }

  func remoteStop(forwardID: String) async throws {
    let body: Data
    do {
      body = try PortForwardingRemoteV3Contract.unforwardRequest(forwardID: forwardID)
    } catch {
      throw PortForwardingTransportError.invalidRequest
    }
    let data = try await dispatchMutation(.init(route: .portUnforward, body: body))
    do {
      try PortForwardingRemoteV3Contract.unforwardResponse(data)
    } catch {
      throw PortForwardingTransportError.ambiguousMutation
    }
  }

  private func dispatch(_ request: PortForwardingHTTPRequest) async throws -> Data {
    try Task.checkCancellation()
    do {
      return try await http.execute(request)
    } catch is CancellationError {
      throw CancellationError()
    } catch let PortForwardingHTTPError.rejected(statusCode, code) {
      throw PortForwardingTransportError.rejected(statusCode: statusCode, code: code)
    } catch PortForwardingHTTPError.invalidResponse, PortForwardingHTTPError.responseTooLarge {
      throw PortForwardingTransportError.invalidResponse
    } catch {
      throw PortForwardingTransportError.transport
    }
  }

  private func dispatchMutation(_ request: PortForwardingHTTPRequest) async throws -> Data {
    do {
      return try await dispatch(request)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as PortForwardingTransportError {
      switch error {
      case .rejected(let statusCode, _):
        if RemoteMutationClassification.classify(statusCode: statusCode)
          == .requestMayHaveCommitted
        {
          throw PortForwardingTransportError.ambiguousMutation
        }
        throw error
      case .invalidRequest: throw error
      default: throw PortForwardingTransportError.ambiguousMutation
      }
    } catch {
      throw PortForwardingTransportError.ambiguousMutation
    }
  }
}
