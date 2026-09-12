import Foundation
import Observation
import UIKit

enum SettingsMCPOAuthLifecycle: Equatable, Sendable, CustomStringConvertible {
  case idle
  case checking
  case ready(authenticatedCount: Int)
  case starting
  case openingBrowser
  case waiting
  case authorized
  case paused
  case cancelled
  case timedOut
  case failed(SettingsIntegrationsFailure)

  var description: String {
    switch self {
    case .idle: return "idle"
    case .checking: return "checking"
    case .ready(let count): return "ready(count: \(count))"
    case .starting: return "starting"
    case .openingBrowser: return "openingBrowser(redacted)"
    case .waiting: return "waiting(redacted)"
    case .authorized: return "authorized"
    case .paused: return "paused(redacted)"
    case .cancelled: return "cancelled"
    case .timedOut: return "timedOut"
    case .failed(let failure): return "failed(\(failure))"
    }
  }
}

@MainActor
protocol SettingsIntegrationsBrowserOpening: Sendable {
  func openAuthorizationURL(_ url: URL) async -> Bool
}

@MainActor
struct SettingsIntegrationsSystemBrowser: SettingsIntegrationsBrowserOpening {
  func openAuthorizationURL(_ url: URL) async -> Bool {
    guard SettingsIntegrationsAuthorizationURLPolicy.accepts(url) else { return false }
    return await UIApplication.shared.open(url, options: [:])
  }
}

enum SettingsIntegrationsAuthorizationURLPolicy {
  static func validatedURL(_ raw: String) throws -> URL {
    guard let components = URLComponents(string: raw),
      components.scheme?.lowercased() == "https",
      let host = components.host,
      !host.isEmpty,
      components.user == nil,
      components.password == nil,
      let url = components.url
    else { throw SettingsIntegrationsGatewayError.invalidResponse }
    return url
  }

  static func accepts(_ url: URL) -> Bool {
    (try? validatedURL(url.absoluteString)) != nil
  }
}

@MainActor
@Observable
final class SettingsIntegrationsOAuthController {
  typealias Sleep = @Sendable (Duration) async throws -> Void

  private(set) var access: SettingsIntegrationsAccess?
  private(set) var lifecycle: SettingsMCPOAuthLifecycle = .idle
  private(set) var authenticatedURLs: Set<String> = []

  @ObservationIgnored private let gateway: any SettingsIntegrationsGateway
  @ObservationIgnored private let browser: any SettingsIntegrationsBrowserOpening
  @ObservationIgnored private let waitLimit: Duration
  @ObservationIgnored private let sleep: Sleep
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var flowID: String?

  init(
    gateway: any SettingsIntegrationsGateway,
    browser: any SettingsIntegrationsBrowserOpening = SettingsIntegrationsSystemBrowser(),
    waitLimit: Duration = .seconds(120),
    sleep: @escaping Sleep = { try await Task.sleep(for: $0) }
  ) {
    self.gateway = gateway
    self.browser = browser
    self.waitLimit = waitLimit
    self.sleep = sleep
  }

  func activate(_ access: SettingsIntegrationsAccess?) {
    guard self.access != access else { return }
    replaceTask()
    self.access = access
    lifecycle = .idle
    authenticatedURLs = []
    flowID = nil
  }

  func refreshStatus() async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    lifecycle = .checking
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await gateway.oauthStatus(
          .init(projectLocation: access.context.projectLocation), context: access.context
        )
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        self.authenticatedURLs = Set(result.authenticatedURLs)
        self.lifecycle = .ready(authenticatedCount: result.authenticatedURLs.count)
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        self.lifecycle = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func start(server: SettingsMCPServer) async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    lifecycle = .starting
    flowID = nil
    let gateway = self.gateway
    let browser = self.browser
    let pending = Task {
      do {
        let request = SettingsMCPServerRequest(
          projectLocation: access.context.projectLocation,
          server: server
        )
        let result = try await gateway.beginOAuth(request, context: access.context)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        switch result {
        case .authorized:
          self.lifecycle = .authorized
          await self.reconcileStatusOnce(captured: captured, access: access)
        case .error:
          self.lifecycle = .failed(.rejected)
        case .redirect(let newFlowID, let authorizationURL):
          self.flowID = newFlowID
          self.lifecycle = .openingBrowser
          let url = try SettingsIntegrationsAuthorizationURLPolicy.validatedURL(authorizationURL)
          guard self.owns(captured, access) else { return }
          guard await browser.openAuthorizationURL(url) else {
            self.lifecycle = .failed(.unavailable)
            return
          }
          try Task.checkCancellation()
          guard self.owns(captured, access) else { return }
          try await self.wait(flowID: newFlowID, captured: captured, access: access)
        }
      } catch is CancellationError {
      } catch is SettingsIntegrationsTimeoutError {
        guard self.owns(captured, access) else { return }
        self.lifecycle = .timedOut
      } catch {
        guard self.owns(captured, access) else { return }
        let failure = SettingsIntegrationsFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.reconcileAmbiguous(captured: captured, access: access)
        } else {
          self.lifecycle = .failed(failure)
        }
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func cancel() {
    replaceTask()
    flowID = nil
    lifecycle = .cancelled
  }

  func suspendForBackground() {
    guard lifecycle == .waiting || lifecycle == .starting || lifecycle == .openingBrowser else {
      return
    }
    task?.cancel()
    task = nil
    ordinal &+= 1
    lifecycle = .paused
  }

  func resumeAfterForeground() async {
    guard lifecycle == .paused, let access, let flowID else {
      await refreshStatus()
      return
    }
    replaceTask()
    let captured = ordinal
    let pending = Task {
      do {
        try await self.wait(flowID: flowID, captured: captured, access: access)
      } catch is CancellationError {
      } catch is SettingsIntegrationsTimeoutError {
        guard self.owns(captured, access) else { return }
        self.lifecycle = .timedOut
      } catch {
        guard self.owns(captured, access) else { return }
        self.lifecycle = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func clear(server: SettingsMCPServer) async {
    guard let access, let endpoint = server.transport.endpointURL else { return }
    replaceTask()
    let captured = ordinal
    lifecycle = .starting
    let gateway = self.gateway
    let pending = Task {
      do {
        try await gateway.clearOAuth(
          .init(projectLocation: access.context.projectLocation, url: endpoint),
          context: access.context
        )
        await self.reconcileStatusOnce(captured: captured, access: access)
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        let failure = SettingsIntegrationsFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.reconcileAmbiguous(captured: captured, access: access)
        } else {
          self.lifecycle = .failed(failure)
        }
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func isAuthenticated(_ server: SettingsMCPServer) -> Bool {
    guard let endpoint = server.transport.endpointURL else { return false }
    return authenticatedURLs.contains(endpoint)
  }

  private func wait(
    flowID: String, captured: UInt64, access: SettingsIntegrationsAccess
  ) async throws {
    lifecycle = .waiting
    let gateway = self.gateway
    let request = SettingsMCPOAuthWaitRequest(
      projectLocation: access.context.projectLocation,
      flowID: flowID
    )
    let limit = waitLimit
    let sleep = self.sleep
    let result = try await withThrowingTaskGroup(of: SettingsMCPOAuthWaitResult.self) { group in
      group.addTask { try await gateway.waitOAuth(request, context: access.context) }
      group.addTask {
        try await sleep(limit)
        throw SettingsIntegrationsTimeoutError()
      }
      defer { group.cancelAll() }
      guard let first = try await group.next() else { throw CancellationError() }
      return first
    }
    try Task.checkCancellation()
    guard owns(captured, access), self.flowID == flowID else { throw CancellationError() }
    switch result {
    case .authorized:
      lifecycle = .authorized
      self.flowID = nil
      await reconcileStatusOnce(captured: captured, access: access)
    case .error:
      lifecycle = .failed(.rejected)
    }
  }

  private func reconcileAmbiguous(
    captured: UInt64, access: SettingsIntegrationsAccess
  ) async {
    await reconcileStatusOnce(captured: captured, access: access)
    guard owns(captured, access) else { return }
    if case .ready = lifecycle { return }
    lifecycle = .failed(.ambiguousOutcome)
  }

  private func reconcileStatusOnce(
    captured: UInt64, access: SettingsIntegrationsAccess
  ) async {
    do {
      let result = try await gateway.oauthStatus(
        .init(projectLocation: access.context.projectLocation), context: access.context
      )
      try Task.checkCancellation()
      guard owns(captured, access) else { return }
      authenticatedURLs = Set(result.authenticatedURLs)
      lifecycle = .ready(authenticatedCount: result.authenticatedURLs.count)
    } catch is CancellationError {
    } catch {
      guard owns(captured, access) else { return }
      lifecycle = .failed(SettingsIntegrationsFailure.map(error))
    }
  }

  private func owns(_ captured: UInt64, _ access: SettingsIntegrationsAccess) -> Bool {
    ordinal == captured && self.access == access
  }

  private func finish(_ captured: UInt64) {
    if ordinal == captured { task = nil }
  }

  private func replaceTask() {
    ordinal &+= 1
    task?.cancel()
    task = nil
  }
}
