import Foundation
import XCTest

@testable import App

enum ThreadLifecycleTestValues {
  static let connectionID = ClientConnectionID(
    UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!)

  static func lease(generation: UInt64 = 1, host: String = "host.example") -> ThreadHostLease {
    ThreadHostLease(
      identity: ThreadHostIdentity(
        clientConnectionID: connectionID,
        desktopID: "desktop-exact",
        host: host
      ),
      generation: generation
    )
  }

  static func target(
    threadID: String = "thread-1",
    generation: UInt64 = 1,
    host: String = "host.example"
  ) -> ThreadLifecycleTarget {
    ThreadLifecycleTarget(
      lease: lease(generation: generation, host: host),
      threadID: threadID
    )
  }

  static func startExisting(threadID: String = "thread-1") -> ThreadStartExistingRequest {
    ThreadStartExistingRequest(
      threadID: threadID,
      projectLocation: .posix(path: "/project"),
      agentKind: "agent",
      config: ThreadLaunchConfiguration(model: "model"),
      initialSize: ThreadTerminalSize(cols: 120, rows: 30),
      prompt: "continue"
    )
  }

  static func relaunch() -> ThreadRelaunchRequest {
    ThreadRelaunchRequest(
      projectID: "project-1",
      agentKind: "agent",
      config: ThreadLaunchConfiguration(model: "model"),
      prompt: "continue"
    )
  }

  static func access(
    lease: ThreadHostLease = lease(),
    online: Bool = true,
    ready: Bool = true,
    foreground: Bool = true,
    scopes: Set<String> = ["session:operate"]
  ) -> ThreadSessionAccess {
    ThreadSessionAccess(
      lease: lease,
      isOnline: online,
      isReady: ready,
      isForeground: foreground,
      scopes: scopes
    )
  }
}

@MainActor
final class ThreadLifecycleSelectionBox {
  var selection: ThreadLifecycleTransportSelection?

  init(selection: ThreadLifecycleTransportSelection?) {
    self.selection = selection
  }
}

actor RecordingThreadLifecycleHTTP: ThreadLifecycleRawHTTPExecuting {
  enum Outcome: Sendable {
    case automaticSuccess
    case response(Data)
    case rawError(ThreadLifecycleRawHTTPError)
    case sleepUntilCancelled
  }

  private var recorded: [ThreadLifecycleHTTPRequest] = []
  private var outcome: Outcome = .automaticSuccess
  private var shouldBlockNext = false
  private var blocked = false
  private var blockedWaiters: [CheckedContinuation<Void, Never>] = []
  private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

  func setOutcome(_ outcome: Outcome) {
    self.outcome = outcome
  }

  func blockNextRequest() {
    shouldBlockNext = true
  }

  func executeThreadLifecycleRequest(_ request: ThreadLifecycleHTTPRequest) async throws -> Data {
    recorded.append(request)
    if shouldBlockNext {
      shouldBlockNext = false
      blocked = true
      let waiters = blockedWaiters
      blockedWaiters.removeAll()
      for waiter in waiters {
        waiter.resume()
      }
      await withCheckedContinuation { releaseWaiters.append($0) }
      try Task.checkCancellation()
    }
    switch outcome {
    case .automaticSuccess:
      if request.path == "/api/threads/start" {
        let body = try JSONSerialization.jsonObject(with: request.body) as? [String: Any]
        let threadID = body?["threadId"] as? String ?? "thread-1"
        return try JSONSerialization.data(withJSONObject: ["threadId": threadID])
      }
      return Data(#"{"ok":true}"#.utf8)
    case .response(let data):
      return data
    case .rawError(let error):
      throw error
    case .sleepUntilCancelled:
      try await Task.sleep(for: .seconds(60))
      return Data(#"{"ok":true}"#.utf8)
    }
  }

  func requests() -> [ThreadLifecycleHTTPRequest] {
    recorded
  }

  func waitUntilBlocked() async {
    if blocked { return }
    await withCheckedContinuation { blockedWaiters.append($0) }
  }

  func releaseBlockedRequest() {
    blocked = false
    let waiters = releaseWaiters
    releaseWaiters.removeAll()
    for waiter in waiters {
      waiter.resume()
    }
  }
}

actor ThreadLifecycleRemoteAPIFake: ThreadLifecycleRemoteAPI {
  enum Outcome: Sendable {
    case success
    case transport(ThreadLifecycleTransportError)
  }

  private var recordedCommands: [ThreadRemoteCommand] = []
  private var recordedThreadIDs: [String] = []
  private var recordedStarts: [ThreadStartExistingRequest] = []
  private var outcome: Outcome = .success
  private var shouldBlockNext = false
  private var blocked = false
  private var blockedWaiters: [CheckedContinuation<Void, Never>] = []
  private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

  func setOutcome(_ outcome: Outcome) {
    self.outcome = outcome
  }

  func blockNextCall() {
    shouldBlockNext = true
  }

  func remoteStartExistingThread(
    _ request: ThreadStartExistingRequest,
    commandID: String
  ) async throws -> String {
    recordedStarts.append(request)
    try await pauseIfNeeded()
    try finish()
    return request.threadID
  }

  func remoteRunThreadCommand(
    threadID: String,
    command: ThreadRemoteCommand,
    commandID: String?
  ) async throws {
    recordedThreadIDs.append(threadID)
    recordedCommands.append(command)
    try await pauseIfNeeded()
    try finish()
  }

  func commands() -> [ThreadRemoteCommand] { recordedCommands }
  func threadIDs() -> [String] { recordedThreadIDs }
  func starts() -> [ThreadStartExistingRequest] { recordedStarts }

  func waitUntilBlocked() async {
    if blocked { return }
    await withCheckedContinuation { blockedWaiters.append($0) }
  }

  func releaseBlockedCall() {
    blocked = false
    let waiters = releaseWaiters
    releaseWaiters.removeAll()
    for waiter in waiters {
      waiter.resume()
    }
  }

  private func pauseIfNeeded() async throws {
    guard shouldBlockNext else { return }
    shouldBlockNext = false
    blocked = true
    let waiters = blockedWaiters
    blockedWaiters.removeAll()
    for waiter in waiters {
      waiter.resume()
    }
    await withCheckedContinuation { releaseWaiters.append($0) }
    try Task.checkCancellation()
  }

  private func finish() throws {
    if case .transport(let error) = outcome { throw error }
  }
}

@MainActor
final class ThreadLifecycleRefreshSpy {
  private(set) var leases: [ThreadHostLease] = []

  func refresh(_ lease: ThreadHostLease) async {
    leases.append(lease)
  }
}

func threadLifecycleJSONObject(_ data: Data) throws -> [String: Any] {
  try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}
