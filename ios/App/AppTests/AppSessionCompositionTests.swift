import SwiftUI
import XCTest

@testable import App

// MARK: - Controllable fakes (not production expression copies)

@MainActor
final class FakeRemoteAPI: SessionRemoteAPI {
  let endpointValue: String
  var httpEndpoint: String { get async { endpointValue } }
  var accessToken: String?

  var environmentResult: Result<RemoteEnvironmentDescriptor, Error> = .failure(
    RemoteClientError.invalidResponse("unset")
  )
  /// Holds `environment()` until released (deterministic capability-refresh
  /// tests). FIFO `environmentResults` entries are returned before
  /// `environmentResult` so consecutive epochs can see different hosts.
  /// `environmentGates` gates requests one-by-one in call order (per-request
  /// release order control); `environmentGate` is the fallback for every
  /// request. `environmentCompletions` counts waiters that passed a gate,
  /// giving tests an observable for "a suspended request has settled".
  var environmentGate: AsyncGate?
  var environmentGates: [AsyncGate?] = []
  var environmentResults: [Result<RemoteEnvironmentDescriptor, Error>] = []
  private(set) var environmentCompletions = 0
  var tokenResult: Result<RemoteAccessTokenResult, Error> = .failure(
    RemoteClientError.invalidResponse("unset")
  )
  var snapshotResult: Result<RemoteShellSnapshot, Error> = .failure(
    RemoteClientError.invalidResponse("unset")
  )
  var historyResults: [String: Result<RemoteThreadSnapshot, Error>] = [:]
  var pageResult: Result<RemoteRuntimeItemsPage, Error> = .success(
    RemoteRuntimeItemsPage(items: [], nextCursor: nil)
  )
  var sendError: Error?
  var interruptError: Error?
  var sendGate: AsyncGate?
  var interruptGate: AsyncGate?

  /// Failure by default so unrelated tests skip hydration without touching
  /// replay state (hydration treats a failed fetch as absent, not empty).
  var agentStatusesResult: Result<SessionAgentStatuses, Error> = .failure(
    RemoteClientError.invalidResponse("unset")
  )
  var agentStatusesGate: AsyncGate?
  var describeHostResult: Result<HostServiceCapabilities, Error> = .success(.unknown)
  /// When set, `describeHost()` decodes this raw payload through the
  /// production generated-contract path instead of returning
  /// `describeHostResult` — exercises omitted-flag wire payloads end to end.
  var rawDescribePayload: Data?

  private(set) var snapshotCalls = 0
  private(set) var agentStatusesCalls = 0
  private(set) var describeHostCalls = 0
  private(set) var historyCalls: [String] = []
  private(set) var sendCalls = 0
  private(set) var interruptCalls = 0
  private(set) var pageCalls: [(String, Int?)] = []

  /// Gates snapshot() until resumed (deterministic resync tests).
  var snapshotGate: AsyncGate?
  /// Number of snapshot calls that bypass the gate (bootstrap + initial connect).
  var snapshotGateSkipCount: Int = 1

  /// Default endpoint matches `makeProfile()` / `makeEnvironment()` (`https://a.test`)
  /// so ownership identity checks do not spuriously reject history/paging.
  init(endpoint: String = "https://a.test", accessToken: String? = nil) {
    self.endpointValue = endpoint
    self.accessToken = accessToken
  }

  func setAccessToken(_ token: String?) async {
    accessToken = token
  }

  private(set) var environmentCalls = 0

  func environment() async throws -> RemoteEnvironmentDescriptor {
    environmentCalls += 1
    // Capture this request's response and gate before waiting: concurrent
    // waiters released by one gate resume in arbitrary order, so the FIFO
    // queues must be consumed at call-entry (which callers sequence) to stay
    // deterministic.
    let captured: Result<RemoteEnvironmentDescriptor, Error>? =
      environmentResults.isEmpty ? nil : environmentResults.removeFirst()
    let gate: AsyncGate? =
      environmentGates.isEmpty ? environmentGate : environmentGates.removeFirst()
    if let gate { await gate.wait() }
    environmentCompletions += 1
    if let captured {
      return try captured.get()
    }
    return try environmentResult.get()
  }

  func exchangePairingCredential(
    credential: String,
    scopes: [String]
  ) async throws -> RemoteAccessTokenResult {
    _ = credential
    _ = scopes
    return try tokenResult.get()
  }

  func snapshot() async throws -> RemoteShellSnapshot {
    if snapshotGateSkipCount > 0 {
      snapshotGateSkipCount -= 1
    } else if let snapshotGate {
      await snapshotGate.wait()
    }
    snapshotCalls += 1
    return try snapshotResult.get()
  }

  func agentStatuses() async throws -> SessionAgentStatuses {
    agentStatusesCalls += 1
    if let agentStatusesGate { await agentStatusesGate.wait() }
    return try agentStatusesResult.get()
  }

  func describeHost() async throws -> HostServiceCapabilities {
    describeHostCalls += 1
    if let rawDescribePayload {
      let canonical = try GeneratedRemoteV3Contract.hostDescribeResponse(rawDescribePayload)
      return try JSONDecoding.decode(HostDescribeResponse.self, from: canonical).capabilities
    }
    return try describeHostResult.get()
  }

  /// Strict connect-time capability read (C1 F2). Unlike `describeHost()` the
  /// default here fails, matching the production seam's fail-closed default.
  var hostCapabilitiesResult: Result<HostServiceCapabilities, Error> = .failure(
    SessionRemoteAPIFailure.capabilityReadUnavailable
  )
  /// Runs after the (captured) result is chosen and before it is returned, so
  /// a test can mutate durable state while the response is "in flight".
  var hostCapabilitiesHook: (@Sendable () async -> Void)?
  /// Holds `fetchHostCapabilities()` until resumed (deterministic delayed-
  /// describe tests); the test performs its mutation before releasing it.
  var hostCapabilitiesGate: AsyncGate?
  private(set) var hostCapabilitiesCalls = 0

  func fetchHostCapabilities() async throws -> HostServiceCapabilities {
    hostCapabilitiesCalls += 1
    let result = hostCapabilitiesResult
    if let hostCapabilitiesGate { await hostCapabilitiesGate.wait() }
    if let hostCapabilitiesHook { await hostCapabilitiesHook() }
    return try result.get()
  }

  func threadHistory(
    threadId: String,
    targetTimelineEntryCount: Int?
  ) async throws -> RemoteThreadSnapshot {
    _ = targetTimelineEntryCount
    historyCalls.append(threadId)
    if let result = historyResults[threadId] {
      return try result.get()
    }
    throw RemoteClientError.invalidResponse("no history for \(threadId)")
  }

  func threadRuntimeItemsPage(
    threadId: String,
    beforePosition: Int?,
    limit: Int,
    targetTimelineEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    _ = limit
    _ = targetTimelineEntryCount
    pageCalls.append((threadId, beforePosition))
    return try pageResult.get()
  }

  func sendThreadInput(
    threadId: String,
    prompt: String,
    config: ThreadConfig
  ) async throws {
    _ = threadId
    _ = prompt
    _ = config
    sendCalls += 1
    if let sendGate { await sendGate.wait() }
    try Task.checkCancellation()
    if let sendError { throw sendError }
  }

  func interruptThread(threadId: String) async throws {
    _ = threadId
    interruptCalls += 1
    if let interruptGate { await interruptGate.wait() }
    try Task.checkCancellation()
    if let interruptError { throw interruptError }
  }

}

@MainActor
final class FakeLiveSocket: SessionLiveSocket {
  weak var delegate: RemoteWebSocketClientDelegate?
  private(set) var interests: [String] = []
  private(set) var interestUpdates: [[String]] = []
  private(set) var startedWithSeq: Int?
  private(set) var stopCount = 0
  private(set) var resumeAfterResyncSeqs: [Int] = []
  private(set) var recoverFromResyncAbortCount = 0
  private(set) var noteAuthoritativeSeqs: [Int] = []
  private(set) var suspended = false
  private(set) var resyncSuspended = false
  var attachGate: AsyncGate?
  var startGate: AsyncGate?
  /// The declaration snapshot this fake reports for the actual upgrade. nil
  /// models a socket installed before any capability machinery observed the
  /// host (undeclared reconciliation path).
  var upgradeDeclarationSnapshot: RemoteSocketUpgradeDeclarations?

  func attachSession(_ session: AppSession) async {
    if let attachGate { await attachGate.wait() }
    self.delegate = session
  }

  private(set) var gitInterests: [GitStateInterest] = []
  private(set) var gitInterestUpdates: [[GitStateInterest]] = []

  func setThreadItemInterests(_ threadIds: [String]) async {
    let normalized = ThreadItemInterestsWire.normalized(threadIds)
    interests = normalized
    interestUpdates.append(normalized)
  }

  func setGitStateInterests(_ interests: [GitStateInterest]) async {
    gitInterests = interests
    gitInterestUpdates.append(interests)
  }

  func start(lastSeenSeq: Int?) async {
    if let startGate { await startGate.wait() }
    startedWithSeq = lastSeenSeq
    resyncSuspended = false
  }

  func stop() async {
    stopCount += 1
    resyncSuspended = false
  }

  func suspendForBackground() async {
    suspended = true
  }

  func resumeFromForeground() async {
    suspended = false
  }

  func noteAuthoritativeSnapshot(_ seq: Int) async {
    noteAuthoritativeSeqs.append(seq)
  }

  func resumeAfterResync(fromSeq seq: Int) async {
    resumeAfterResyncSeqs.append(seq)
    resyncSuspended = false
  }

  func recoverFromResyncAbort() async {
    recoverFromResyncAbortCount += 1
    resyncSuspended = false
  }

  func matchesIdentity(_ other: any SessionLiveSocket) -> Bool {
    guard let other = other as? FakeLiveSocket else { return false }
    return self === other
  }

  func upgradeDeclarations() async -> RemoteSocketUpgradeDeclarations? {
    upgradeDeclarationSnapshot
  }

  func markResyncSuspendedForTests() {
    resyncSuspended = true
  }
}

// MARK: - Helpers

@MainActor
func makeProfile(
  desktopId: String = "desk-a",
  label: String = "Desktop A",
  endpoint: String = "https://a.test",
  scopes: [String] = ["session:read", "session:operate"]
) -> ConnectionProfile {
  ConnectionProfile(
    desktopId: desktopId,
    label: label,
    httpBaseURL: endpoint,
    wsBaseURL: endpoint.replacingOccurrences(of: "https://", with: "wss://"),
    appVersion: "1.0.0",
    hostMode: nil,
    platform: "macOS",
    scopes: scopes,
    tokenExpiresAt: nil,
    pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
  )
}

@MainActor
func makeEnvironment(
  desktopId: String = "desk-a",
  label: String = "Desktop A",
  scopes: [String] = ProtocolConstants.standardScopes
) -> RemoteEnvironmentDescriptor {
  RemoteEnvironmentDescriptor(
    protocolVersion: ProtocolConstants.remoteProtocolVersion,
    hostMode: nil,
    desktopId: desktopId,
    label: label,
    appVersion: "1.0.0",
    platform: "macOS",
    auth: .init(
      policy: ProtocolConstants.authPolicy,
      bootstrapMethods: [ProtocolConstants.bootstrapMethod],
      sessionMethods: [ProtocolConstants.sessionMethod],
      scopes: scopes
    ),
    endpoints: .init(httpBaseUrl: "https://a.test", wsBaseUrl: "wss://a.test")
  )
}

@MainActor
func makeShell(
  seq: Int,
  threads: [RemoteThread] = []
) -> RemoteShellSnapshot {
  RemoteShellSnapshot(
    snapshotSeq: seq,
    projects: [
      RemoteProject(
        id: "p1",
        remoteServerId: nil,
        remoteId: nil,
        name: "Project",
        location: .posix(path: "/tmp"),
        workspaceId: nil,
        disabled: false,
        createdAt: "2020-01-01T00:00:00.000Z"
      )
    ],
    threads: threads,
    runtimeSummariesByThread: [:],
    updatedAt: "2020-01-01T00:00:00.000Z"
  )
}

@MainActor
func makeThread(
  id: String,
  presentationMode: String? = "gui"
) -> RemoteThread {
  RemoteThread(
    id: id,
    remoteServerId: nil,
    remoteId: nil,
    projectId: "p1",
    title: id,
    agentKind: "claude",
    agentInstanceId: nil,
    config: .empty,
    status: "idle",
    attention: "none",
    canResumeWithConfig: nil,
    worktreePath: nil,
    worktreeBranch: nil,
    archived: false,
    done: false,
    starred: false,
    presentationMode: presentationMode,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-02T00:00:00.000Z",
    activeTurnStartedAt: nil,
    lastTurnStartedAt: nil,
    lastTurnEndedAt: nil,
    errorMessage: nil,
    parentThreadId: nil
  )
}

@MainActor
func makeHistory(
  threadId: String,
  seq: Int,
  items: [PersistedRuntimeItem] = [],
  presentationMode: String? = "gui"
) -> RemoteThreadSnapshot {
  RemoteThreadSnapshot(
    snapshotSeq: seq,
    thread: makeThread(id: threadId, presentationMode: presentationMode),
    runtimeItems: items,
    runtimeNextCursor: items.isEmpty ? nil : 1,
    completedTurns: [],
    contextUsage: nil,
    terminalScrollback: nil,
    updatedAt: "2020-01-01T00:00:00.000Z"
  )
}

@MainActor
private func seedCredentials(
  _ repo: SessionCredentialRepository,
  profile: ConnectionProfile,
  token: String,
  id: UInt64 = 1
) async throws {
  let creds = SessionCredentials(profile: profile, accessToken: token)
  let activatedPairID = try await repo.activate(id: id, kind: .pair)
  XCTAssertTrue(activatedPairID)
  let _assertVal0 = try await repo.commit(creds, owning: id)
  XCTAssertEqual(_assertVal0, .applied)
}

@MainActor
func makeSession(
  suite: String = UUID().uuidString,
  keychain: InMemoryKeychainIO = InMemoryKeychainIO(),
  seedProfile: ConnectionProfile? = nil,
  seedToken: String? = nil,
  apiFactory: @escaping @MainActor (String, String?) -> any SessionRemoteAPI,
  socketFactory: (@MainActor (any SessionRemoteAPI) -> FakeLiveSocket)? = nil
) async throws -> (AppSession, SessionCredentialRepository, InMemoryKeychainIO) {
  let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
  if let seedProfile, let seedToken {
    try await seedCredentials(repo, profile: seedProfile, token: seedToken)
  }
  let sockets = socketFactory ?? { _ in FakeLiveSocket() }
  let deps = SessionDependencies.testing(
    credentialStore: repo,
    hostCatalog: makeTestHostCatalog(suite: suite, keychain: keychain),
    makeAPI: { endpoint, token in apiFactory(endpoint, token) },
    makeSocket: { api in sockets(api) }
  )
  return (AppSession(dependencies: deps), repo, keychain)
}

@MainActor
private func testingDeps(
  repo: SessionCredentialRepository,
  suite: String,
  keychain: InMemoryKeychainIO,
  makeAPI: @escaping @Sendable @MainActor (String, String?) -> any SessionRemoteAPI,
  makeSocket: @escaping @Sendable @MainActor (any SessionRemoteAPI) -> any SessionLiveSocket = {
    _ in
    FakeLiveSocket()
  }
) -> SessionDependencies {
  SessionDependencies.testing(
    credentialStore: repo,
    hostCatalog: makeTestHostCatalog(suite: suite, keychain: keychain),
    makeAPI: makeAPI,
    makeSocket: makeSocket
  )
}

private func makeTestHostCatalog(
  suite: String,
  keychain: InMemoryKeychainIO
) -> HostCatalog {
  let directory = FileManager.default.temporaryDirectory
    .appendingPathComponent("poracode-composition-hosts-\(suite)", isDirectory: true)
  return HostCatalog(
    directory: directory,
    vaultIO: keychain,
    sourceKeychain: keychain,
    defaults: HostSourceDefaults(value: UserDefaults(suiteName: suite) ?? .standard),
    suiteName: suite
  )
}

// MARK: - Composition tests

/// Test-lifetime monotonic probe for checkpoint-gated composition tests.
/// Lock-guarded so the mutation checkpoint closure (which runs off the
/// MainActor) can record arrival while the @MainActor test reads it.
/// Records flags only — never credential payloads.
private final class MutationCheckpointProbe: @unchecked Sendable {
  private let lock = NSLock()
  private var arrived = false
  private var pairFinished = false

  func markArrived() {
    lock.withLock { arrived = true }
  }

  func markPairFinished() {
    lock.withLock { pairFinished = true }
  }

  /// Single lock-consistent read for the timeout diagnostic.
  func snapshotAtTimeout() -> (arrived: Bool, pairFinished: Bool) {
    lock.withLock { (arrived, pairFinished) }
  }

  var didArrive: Bool {
    lock.withLock { arrived }
  }

  var didPairFinish: Bool {
    lock.withLock { pairFinished }
  }
}

@MainActor
final class AppSessionCompositionTests: XCTestCase {
  func testRootPresentationKeepsStoredSessionOnHomeWhileConnecting() {
    XCTAssertEqual(
      RootPresentation.resolve(phase: .connecting, hasProfile: true),
      .home
    )
    XCTAssertEqual(
      RootPresentation.resolve(phase: .connecting, hasProfile: false),
      .onboarding
    )
    XCTAssertEqual(
      RootPresentation.resolve(phase: .launching, hasProfile: false),
      .splash
    )
  }

  func testRefreshSnapshotDoesNotSupersedeConnectingBootstrap() async throws {
    let remote = FakeRemoteAPI()
    remote.snapshotResult = .success(makeShell(seq: 1))
    let (session, repo, _) = try await makeSession { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    session.state.profile = makeProfile()
    session.state.api = remote
    session.state.phase = .connecting
    session.state.projectsLoadState = .loading

    await session.refreshSnapshot()

    XCTAssertEqual(remote.snapshotCalls, 0)
    XCTAssertNil(session.snapshot)
    XCTAssertEqual(session.projectsLoadState, .loading)
  }

  func testPerHostSocketStatusKeepsSecondaryStateSeparateFromSelectedState() async throws {
    let (session, repo, _) = try await makeSession { endpoint, token in
      FakeRemoteAPI(endpoint: endpoint, accessToken: token)
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    let selected = ClientConnectionID()
    let secondary = ClientConnectionID()
    session.state.selectedConnectionId = selected

    session.recordSocketState(.online, for: .host(secondary))

    XCTAssertEqual(session.state.hostSocketStates[secondary], .online)
    XCTAssertEqual(session.socketState, .idle)

    session.recordSocketState(.connecting, for: .host(selected))

    XCTAssertEqual(session.state.hostSocketStates[selected], .connecting)
    XCTAssertEqual(session.socketState, .connecting)
  }

  func testNativeThemeCatalogMatchesRendererCatalogOrder() {
    XCTAssertEqual(
      PoracodeThemePreset.all.map(\.id),
      [
        "default",
        "poracode-legacy",
        "catppuccin",
        "github",
        "one",
        "dracula",
        "nord",
        "tokyo-night",
        "gruvbox",
        "solarized",
        "rose-pine",
        "everforest",
        "monokai",
      ]
    )
  }

  func testEveryNativeThemeShipsDistinctCompleteLightAndDarkVariants() {
    let hex = /^#[0-9a-fA-F]{6}$/

    for preset in PoracodeThemePreset.all {
      let light = [
        preset.light.backgroundHex, preset.light.surfaceHex, preset.light.foregroundHex,
        preset.light.accentHex, preset.light.borderHex, preset.light.sidebarHex,
        preset.light.contentHex,
      ]
      let dark = [
        preset.dark.backgroundHex, preset.dark.surfaceHex, preset.dark.foregroundHex,
        preset.dark.accentHex, preset.dark.borderHex, preset.dark.sidebarHex,
        preset.dark.contentHex,
      ]

      XCTAssertTrue(light.allSatisfy { $0.wholeMatch(of: hex) != nil }, preset.id)
      XCTAssertTrue(dark.allSatisfy { $0.wholeMatch(of: hex) != nil }, preset.id)
      XCTAssertNotEqual(light, dark, "\(preset.id) must not reuse one palette for both modes")
      XCTAssertEqual(preset.variant(for: .light).backgroundHex, preset.light.backgroundHex)
      XCTAssertEqual(preset.variant(for: .dark).backgroundHex, preset.dark.backgroundHex)
    }
  }

  func testNativeThemePreferencesTolerateLegacyAndUnknownStoredValues() {
    XCTAssertEqual(PoracodeThemePreset.resolve("lightcode-legacy").id, "poracode-legacy")
    XCTAssertEqual(PoracodeThemePreset.resolve("unknown-theme").id, "default")
    XCTAssertEqual(PoracodeAppearanceMode.resolve("unknown-mode"), .system)
    XCTAssertEqual(PoracodeChatTextSize.resolve(7), 8)
    XCTAssertEqual(PoracodeChatTextSize.resolve(13), 13)
    XCTAssertEqual(PoracodeChatTextSize.resolve(21), 20)
    XCTAssertEqual(PoracodeChatTextRole.heading1.pointSize(for: 13), 17.5)
    XCTAssertEqual(PoracodeChatTextRole.body.pointSize(for: 13), 13)
    XCTAssertEqual(PoracodeChatTextRole.command.pointSize(for: 13), 12)
    XCTAssertEqual(PoracodeChatTextRole.metadata.pointSize(for: 13), 11)
    XCTAssertTrue(PoracodeChatTextSize.storageKey.hasSuffix(".v1"))
  }

  func testRepairDisconnectClearsCorruptCatalogAndLegacyCredentials() async throws {
    let suite = "poracode.tests.comp.repair.\(UUID().uuidString)"
    let credentialKeychain = InMemoryKeychainIO()
    let hostKeychain = InMemoryKeychainIO()
    let repo = SessionCredentialRepository(
      suiteName: suite,
      keychain: credentialKeychain
    )
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("poracode-composition-hosts-\(suite)", isDirectory: true)
    let catalog = HostCatalog(
      directory: directory,
      vaultIO: hostKeychain,
      sourceKeychain: credentialKeychain,
      defaults: HostSourceDefaults(
        value: UserDefaults(suiteName: suite) ?? .standard
      ),
      suiteName: suite
    )
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await catalog.wipeForTests()
      }
    }

    try await seedCredentials(repo, profile: makeProfile(), token: "legacy-token")
    try hostKeychain.save(
      account: HostTransactionJournal.account,
      data: Data("corrupt-journal".utf8)
    )
    let orphanConnectionId = ClientConnectionID()
    try hostKeychain.save(
      account: HostVault.account(for: orphanConnectionId),
      data: Data("orphan-host-token".utf8)
    )
    let session = AppSession(
      dependencies: SessionDependencies.testing(
        credentialStore: repo,
        hostCatalog: catalog,
        makeAPI: { endpoint, token in
          FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        },
        makeSocket: { _ in FakeLiveSocket() }
      )
    )

    await session.bootstrap()
    XCTAssertEqual(session.phase, .localStoreInconsistent)

    await session.unpair()

    XCTAssertEqual(session.phase, .needsPairing)
    XCTAssertNil(session.globalError)
    let legacyCredentials = try await repo.v2RawData()
    XCTAssertNil(legacyCredentials)
    XCTAssertNil(hostKeychain.rawBytes(account: HostTransactionJournal.account))
    XCTAssertNil(
      hostKeychain.rawBytes(account: HostVault.account(for: orphanConnectionId))
    )
    let repairedCatalog = try await catalog.snapshot()
    XCTAssertTrue(repairedCatalog.isEmpty)
  }

  // MARK: Pair races

  func testPairBFailureLeavesPairACoherent() async throws {
    var apis: [FakeRemoteAPI] = []
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      apis.append(api)
      if endpoint.contains("b.test") {
        api.environmentResult = .failure(
          RemoteClientError(message: "down", status: 502, code: "network")
        )
      } else {
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(makeShell(seq: 10, threads: [makeThread(id: "t1")]))
      }
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.bootstrap()
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    let before = try await repo.v2RawData()

    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    let after = try await repo.v2RawData()
    XCTAssertEqual(after, before, "pair B network failure leaves A bytes identical")
    XCTAssertTrue(session.phase == .ready || session.phase == .connecting)
  }

  /// Pair A then pair B: distinct endpoint/environment/token/snapshot/socket; no mixed host.
  func testPairAThenPairBInstallsDistinctCoherentHost() async throws {
    var sockets: [FakeLiveSocket] = []
    let (session, repo, _) = try await makeSession(
      apiFactory: { endpoint, token in
        let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
        if endpoint.contains("b.test") {
          api.environmentResult = .success(
            makeEnvironment(desktopId: "desk-b", label: "Desktop B")
          )
          api.tokenResult = .success(
            RemoteAccessTokenResult(
              accessToken: "token-desk-b",
              tokenType: "Bearer",
              expiresAt: "2099-01-01T00:00:00.000Z",
              scopes: ["session:read", "session:operate"]
            )
          )
          api.snapshotResult = .success(
            makeShell(seq: 20, threads: [makeThread(id: "tb")])
          )
        } else {
          api.environmentResult = .success(
            makeEnvironment(desktopId: "desk-a", label: "Desktop A")
          )
          api.tokenResult = .success(
            RemoteAccessTokenResult(
              accessToken: "token-desk-a",
              tokenType: "Bearer",
              expiresAt: "2099-01-01T00:00:00.000Z",
              scopes: ["session:read", "session:operate"]
            )
          )
          api.snapshotResult = .success(
            makeShell(seq: 10, threads: [makeThread(id: "ta")])
          )
        }
        return api
      },
      socketFactory: { _ in
        let socket = FakeLiveSocket()
        sockets.append(socket)
        return socket
      }
    )
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: "pair-a"))
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.profile?.httpBaseURL, "https://a.test")
    XCTAssertEqual(session.state.accessToken, "token-desk-a")
    XCTAssertEqual(sockets.count, 1, "exactly one A socket after pair A")
    let socketA = try XCTUnwrap(sockets.first)
    XCTAssertEqual(socketA.stopCount, 0)
    XCTAssertNotNil(socketA.startedWithSeq)

    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))

    // UI + live host are B only — no mixed A token/profile.
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-b")
    XCTAssertEqual(session.profile?.label, "Desktop B")
    XCTAssertEqual(session.profile?.httpBaseURL, "https://b.test")
    XCTAssertEqual(session.state.accessToken, "token-desk-b")
    XCTAssertNotEqual(session.state.accessToken, "token-desk-a")
    XCTAssertEqual(session.snapshot?.snapshotSeq, 20)
    XCTAssertEqual(session.snapshot?.threads.map(\.id), ["tb"])

    let liveAPI = try XCTUnwrap(session.state.api as? FakeRemoteAPI)
    XCTAssertEqual(liveAPI.endpointValue, "https://b.test")
    XCTAssertEqual(liveAPI.accessToken, "token-desk-b")

    // Both hosts are durable and B is selected; A remains the one warm LRU host.
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.hosts.count, 2)
    XCTAssertEqual(durable.selected?.desktopId, "desk-b")
    assertEqual(
      try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
      "token-desk-b")

    XCTAssertEqual(socketA.stopCount, 0, "A remains warm as the single LRU secondary")
    XCTAssertEqual(sockets.count, 2, "exactly one B socket after pair B")
    let socketB = try XCTUnwrap(sockets.last)
    XCTAssertTrue(socketA !== socketB)
    XCTAssertNotNil(socketB.startedWithSeq)
    XCTAssertEqual(socketB.stopCount, 0)

    let hostA = try XCTUnwrap(durable.hosts.first { $0.desktopId == "desk-a" })
    let hostB = try XCTUnwrap(durable.hosts.first { $0.desktopId == "desk-b" })
    await session.switchHost(hostA.connectionId)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.state.accessToken, "token-desk-a")
    XCTAssertTrue(session.state.webSocket === socketA)
    assertEqual(
      try await session.deps.hostCatalog.snapshot().selectedConnectionId,
      hostA.connectionId
    )

    // Removing the non-selected B leaves A coherent and tears down only B.
    await session.removeHost(hostB.connectionId)
    let afterRemoval = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(afterRemoval.hosts.map(\.connectionId), [hostA.connectionId])
    XCTAssertEqual(afterRemoval.selectedConnectionId, hostA.connectionId)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertTrue(session.state.webSocket === socketA)
    XCTAssertGreaterThanOrEqual(socketB.stopCount, 1)
  }

  /// Fresh pair success path must complete under a hard deadline (no self-join deadlock).
  func testFreshPairSuccessDoesNotDeadlock() async throws {
    let (session, repo, _) = try await makeSession { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(
        makeEnvironment(desktopId: "desk-fresh", label: "Fresh"))
      api.tokenResult = .success(
        RemoteAccessTokenResult(
          accessToken: "token-fresh",
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read", "session:operate"]
        )
      )
      api.snapshotResult = .success(makeShell(seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    // Race the pair against a hard deadline without region-isolation-sensitive @MainActor child tasks.
    let pairTask = Task { @MainActor in
      await session.pair(
        with: .init(manualBaseURL: "https://a.test", manualToken: "fresh-pair")
      )
    }
    let timeoutTask = Task {
      try await Task.sleep(nanoseconds: 5_000_000_000)
      throw TestAsyncTimeoutError.timedOut("testFreshPairSuccessDoesNotDeadlock")
    }
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask {
        await pairTask.value
      }
      group.addTask {
        try await timeoutTask.value
      }
      try await group.next()
      group.cancelAll()
      pairTask.cancel()
      timeoutTask.cancel()
    }

    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-fresh")
    XCTAssertEqual(session.state.accessToken, "token-fresh")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-fresh")
    assertEqual(
      try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
      "token-fresh")
  }

  func testUnpairPreventsEarlierPairResurrection() async throws {
    let work = Task { @MainActor in
      try await self.runUnpairPreventsEarlierPairResurrection()
    }
    let timeout = Task {
      try await Task.sleep(nanoseconds: 8_000_000_000)
      throw TestAsyncTimeoutError.timedOut("testUnpairPreventsEarlierPairResurrection")
    }
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { try await work.value }
      group.addTask { try await timeout.value }
      try await group.next()
      group.cancelAll()
      work.cancel()
      timeout.cancel()
    }
  }

  @MainActor
  private func runUnpairPreventsEarlierPairResurrection() async throws {
    let gate = AsyncGate()
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.unpair.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    // Hold the catalog commit while a newer disconnect invalidates the pair generation.

    let api = FakeRemoteAPI()
    api.environmentResult = .success(makeEnvironment())
    api.tokenResult = .success(
      RemoteAccessTokenResult(
        accessToken: "stale-token",
        tokenType: "Bearer",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["session:read", "session:operate"]
      )
    )
    api.snapshotResult = .success(makeShell(seq: 1))

    let session = AppSession(
      dependencies: testingDeps(
        repo: repo,
        suite: suite,
        keychain: keychain,
        makeAPI: { _, t in
          api.accessToken = t
          return api
        }
      )
    )

    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }

    async let pairDone: Void = session.pair(
      with: .init(manualBaseURL: "https://a.test", manualToken: "one-time")
    )
    try await gate.waitUntilWaiting()
    await session.unpair()
    await gate.resume()
    await pairDone

    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertTrue(durable.hosts.isEmpty)
    XCTAssertEqual(session.phase, .needsPairing)
  }

  /// A1 commits durable bytes, then B activates and fails before commit.
  /// Disk and UI must both identify A1 — never disk A1 / UI A0.
  func testPairA1CommittedThenPairBFailureReconcilesToA1() async throws {
    let work = Task { @MainActor in
      try await self.runPairA1CommittedThenPairBFailureReconcilesToA1()
    }
    let timeout = Task {
      try await Task.sleep(nanoseconds: 8_000_000_000)
      throw TestAsyncTimeoutError.timedOut(
        "testPairA1CommittedThenPairBFailureReconcilesToA1")
    }
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { try await work.value }
      group.addTask { try await timeout.value }
      try await group.next()
      group.cancelAll()
      work.cancel()
      timeout.cancel()
    }
  }

  @MainActor
  private func runPairA1CommittedThenPairBFailureReconcilesToA1() async throws {
    let gate = AsyncGate()
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.split.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    try await seedCredentials(repo, profile: makeProfile(), token: "token-a0")

    var apis: [FakeRemoteAPI] = []
    let session = AppSession(
      dependencies: testingDeps(
        repo: repo,
        suite: suite,
        keychain: keychain,
        makeAPI: { endpoint, token in
          let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
          apis.append(api)
          if endpoint.contains("b.test") {
            api.environmentResult = .failure(
              RemoteClientError(message: "down", status: 502, code: "network")
            )
          } else if endpoint.contains("a1.test") {
            api.environmentResult = .success(
              makeEnvironment(desktopId: "desk-a1", label: "A1")
            )
            api.tokenResult = .success(
              RemoteAccessTokenResult(
                accessToken: "token-a1",
                tokenType: "Bearer",
                expiresAt: "2099-01-01T00:00:00.000Z",
                scopes: ["session:read", "session:operate"]
              )
            )
            api.snapshotResult = .success(makeShell(seq: 11))
          } else {
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1))
          }
          return api
        }
      )
    )
    await session.bootstrap()
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.state.accessToken, "token-a0")

    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }
    async let pairA1: Void = session.pair(
      with: .init(manualBaseURL: "https://a1.test", manualToken: "pair-a1")
    )
    try await gate.waitUntilWaiting()

    // A1 has reached the durable boundary. A newer failing B owns the generation.
    async let pairB: Void = session.pair(
      with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b")
    )
    await pairB
    await gate.resume()
    await pairA1

    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.state.accessToken, "token-a0")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.hosts.count, 1)
    XCTAssertEqual(durable.selected?.desktopId, "desk-a")
    _ = apis
  }

  func testUnpairThenPairBFailureDoesNotResurrect() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      if endpoint.contains("b.test") {
        api.environmentResult = .failure(
          RemoteClientError(message: "down", status: 502, code: "network")
        )
      } else {
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(makeShell(seq: 1))
      }
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    XCTAssertEqual(session.profile?.desktopId, "desk-a")

    await session.unpair()
    XCTAssertEqual(session.phase, .needsPairing)
    let afterUnpair = try await repo.v2RawData()
    XCTAssertNil(afterUnpair)

    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    XCTAssertEqual(session.phase, .needsPairing)
    XCTAssertNil(session.profile)
    let afterFailedB = try await repo.v2RawData()
    XCTAssertNil(afterFailedB, "failed B must not resurrect unpaired A")
  }

  func testUnpairThenPairBSuccessInstallsB() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      if endpoint.contains("b.test") {
        api.environmentResult = .success(
          makeEnvironment(desktopId: "desk-b", label: "Desktop B")
        )
        api.tokenResult = .success(
          RemoteAccessTokenResult(
            accessToken: "token-desk-b",
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read", "session:operate"]
          )
        )
        api.snapshotResult = .success(makeShell(seq: 20))
      } else {
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(makeShell(seq: 1))
      }
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    await session.unpair()
    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    XCTAssertEqual(session.profile?.desktopId, "desk-b")
    XCTAssertEqual(session.state.accessToken, "token-desk-b")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-b")
    assertEqual(
      try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
      "token-desk-b")
  }

  func testUnpairGatedThenPairBFailureDoesNotResurrect() async throws {
    let work = Task { @MainActor in
      try await self.runUnpairGatedThenPairBFailureDoesNotResurrect()
    }
    let timeout = Task {
      try await Task.sleep(nanoseconds: 8_000_000_000)
      throw TestAsyncTimeoutError.timedOut("testUnpairGatedThenPairBFailureDoesNotResurrect")
    }
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { try await work.value }
      group.addTask { try await timeout.value }
      try await group.next()
      group.cancelAll()
      work.cancel()
      timeout.cancel()
    }
  }

  @MainActor
  private func runUnpairGatedThenPairBFailureDoesNotResurrect() async throws {
    let gate = AsyncGate()
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.unpair.race.fail.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    try await seedCredentials(repo, profile: makeProfile(), token: "token-a")

    var sockets: [FakeLiveSocket] = []
    let session = AppSession(
      dependencies: testingDeps(
        repo: repo,
        suite: suite,
        keychain: keychain,
        makeAPI: { endpoint, token in
          let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
          if endpoint.contains("b.test") {
            api.environmentResult = .failure(
              RemoteClientError(message: "down", status: 502, code: "network")
            )
          } else {
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1))
          }
          return api
        },
        makeSocket: { _ in
          let socket = FakeLiveSocket()
          sockets.append(socket)
          return socket
        }
      )
    )
    await session.bootstrap()
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    let socketsAfterBootstrap = sockets.count
    XCTAssertGreaterThanOrEqual(socketsAfterBootstrap, 1)

    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }
    async let unpairDone: Void = session.unpair()
    try await gate.waitUntilWaiting()
    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    await gate.resume()
    await unpairDone

    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.hosts.count, 1)
    XCTAssertEqual(durable.selected?.desktopId, "desk-a")
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.state.accessToken, "token-a")
    XCTAssertNotNil(session.state.webSocket)
    XCTAssertEqual(
      sockets.count,
      socketsAfterBootstrap,
      "failed B must not open a new socket back to A"
    )
  }

  func testUnpairGatedThenPairBSuccessWinsAndDelayedClearCannotEraseB() async throws {
    let work = Task { @MainActor in
      try await self.runUnpairGatedThenPairBSuccessWinsAndDelayedClearCannotEraseB()
    }
    let timeout = Task {
      try await Task.sleep(nanoseconds: 8_000_000_000)
      throw TestAsyncTimeoutError.timedOut(
        "testUnpairGatedThenPairBSuccessWinsAndDelayedClearCannotEraseB"
      )
    }
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { try await work.value }
      group.addTask { try await timeout.value }
      try await group.next()
      group.cancelAll()
      work.cancel()
      timeout.cancel()
    }
  }

  @MainActor
  private func runUnpairGatedThenPairBSuccessWinsAndDelayedClearCannotEraseB() async throws {
    let gate = AsyncGate()
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.unpair.race.ok.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    try await seedCredentials(repo, profile: makeProfile(), token: "token-a")

    var sockets: [FakeLiveSocket] = []
    let session = AppSession(
      dependencies: testingDeps(
        repo: repo,
        suite: suite,
        keychain: keychain,
        makeAPI: { endpoint, token in
          let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
          if endpoint.contains("b.test") {
            api.environmentResult = .success(
              makeEnvironment(desktopId: "desk-b", label: "Desktop B")
            )
            api.tokenResult = .success(
              RemoteAccessTokenResult(
                accessToken: "token-desk-b",
                tokenType: "Bearer",
                expiresAt: "2099-01-01T00:00:00.000Z",
                scopes: ["session:read", "session:operate"]
              )
            )
            api.snapshotResult = .success(makeShell(seq: 20))
          } else {
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1))
          }
          return api
        },
        makeSocket: { _ in
          let socket = FakeLiveSocket()
          sockets.append(socket)
          return socket
        }
      )
    )
    await session.bootstrap()
    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }
    async let unpairDone: Void = session.unpair()
    try await gate.waitUntilWaiting()
    await session.pair(with: .init(manualBaseURL: "https://b.test", manualToken: "pair-b"))
    await gate.resume()
    await unpairDone

    XCTAssertEqual(session.profile?.desktopId, "desk-b")
    XCTAssertEqual(session.state.accessToken, "token-desk-b")
    XCTAssertNotNil(session.state.webSocket)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-b")
    assertEqual(
      try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
      "token-desk-b")
    XCTAssertGreaterThanOrEqual(sockets.count, 2)
  }

  func testBackgroundDuringAfterCommitReconcilesOnForeground() async throws {
    try await runBackgroundDuringAfterCommitReconcilesOnForeground()
  }

  @MainActor
  private func runBackgroundDuringAfterCommitReconcilesOnForeground() async throws {
    let gate = AsyncGate()
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.bg.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    try await seedCredentials(repo, profile: makeProfile(), token: "token-a0")

    let session = AppSession(
      dependencies: testingDeps(
        repo: repo,
        suite: suite,
        keychain: keychain,
        makeAPI: { endpoint, token in
          let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
          if endpoint.contains("a1.test") {
            api.environmentResult = .success(
              makeEnvironment(desktopId: "desk-a1", label: "A1")
            )
            api.tokenResult = .success(
              RemoteAccessTokenResult(
                accessToken: "token-a1",
                tokenType: "Bearer",
                expiresAt: "2099-01-01T00:00:00.000Z",
                scopes: ["session:read", "session:operate"]
              )
            )
            api.snapshotResult = .success(makeShell(seq: 11))
          } else {
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1))
          }
          return api
        }
      )
    )
    await session.bootstrap()
    // Probe records checkpoint arrival and pair completion for the timeout diagnostic.
    let probe = MutationCheckpointProbe()
    let pairStartNs = DispatchTime.now().uptimeNanoseconds
    await session.deps.hostCatalog.setMutationCheckpoint {
      probe.markArrived()
      await gate.wait()
    }
    // Owned task so a timeout can release the gate and join promptly.
    // The bound is a liveness guard for the failure path, not a latency
    // assertion: on a loaded CI simulator the checkpoint closure can start
    // (probe arrived) while its hop into `gate.wait()` is still queued past
    // 2s, so allow 10s. The background race and end assertions are unchanged.
    let pairTask = Task { @MainActor in
      await session.pair(
        with: .init(manualBaseURL: "https://a1.test", manualToken: "pair-a1")
      )
      probe.markPairFinished()
    }
    do {
      try await gate.waitUntilWaiting(timeoutNanoseconds: 10_000_000_000)
    } catch {
      let waitElapsedMs =
        Double(DispatchTime.now().uptimeNanoseconds - pairStartNs) / 1_000_000
      // State at timeout, before cleanup can change it.
      let timeoutSnapshot = probe.snapshotAtTimeout()
      let phaseAtTimeout = session.phase
      let profileAtTimeout = session.profile?.desktopId ?? "nil"
      await gate.resume()
      pairTask.cancel()
      await pairTask.value
      let totalElapsedMs =
        Double(DispatchTime.now().uptimeNanoseconds - pairStartNs) / 1_000_000
      XCTFail(
        "pairing did not reach the mutation checkpoint within 10s "
          + "(waitElapsedMs=\(waitElapsedMs), "
          + "cleanupElapsedMs=\(totalElapsedMs - waitElapsedMs), "
          + "checkpointArrivedAtTimeout=\(timeoutSnapshot.arrived), "
          + "pairFinishedAtTimeout=\(timeoutSnapshot.pairFinished), "
          + "phaseAtTimeout=\(phaseAtTimeout), "
          + "profileAtTimeout=\(profileAtTimeout))"
      )
      throw error
    }
    session.handleScenePhase(.background)
    await gate.resume()
    await pairTask.value
    session.handleScenePhase(.active)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.profile?.desktopId == "desk-a1" && session.state.accessToken == "token-a1"
    }
    XCTAssertEqual(session.profile?.desktopId, "desk-a1")
    XCTAssertEqual(session.state.accessToken, "token-a1")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-a1")
  }

  func testPairCommitsMatchingTokenAndProfile() async throws {
    let (session, repo, _) = try await makeSession { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a", label: "A"))
      api.tokenResult = .success(
        RemoteAccessTokenResult(
          accessToken: "token-desk-a",
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read", "session:operate"]
        )
      )
      api.snapshotResult = .success(makeShell(seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: "pair-a"))
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(session.profile?.hostCapabilities, .unknown)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-a")
    XCTAssertEqual(durable.selected?.hostCapabilities, .unknown)
      assertEqual(
        try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
        "token-desk-a")
  }

  func testPairStoresHostDescribeCapabilities() async throws {
    let caps = HostServiceCapabilities(
      ssh: true,
      browserPanel: true,
      chromeBridge: true,
      computerUse: true,
      nativeSecrets: true,
      portForward: true,
      autoUpdate: true,
      osNotifications: true
    )
    let (session, repo, _) = try await makeSession { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a", label: "A"))
      api.tokenResult = .success(
        RemoteAccessTokenResult(
          accessToken: "token-desk-a",
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read", "session:operate"]
        )
      )
      api.describeHostResult = .success(caps)
      api.snapshotResult = .success(makeShell(seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: "pair-a"))
    XCTAssertEqual(session.profile?.hostCapabilities, caps)
    XCTAssertEqual(session.profile?.hostCapabilities?.autoUpdate, true)
    XCTAssertEqual(session.profile?.hostCapabilities?.osNotifications, true)
  }

  func testDeepLinkBecomesPendingNotPair() async throws {
    let (session, repo, _) = try await makeSession { e, t in
      FakeRemoteAPI(endpoint: e, accessToken: t)
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    let url = URL(string: "https://a.test/#token=secret-token-value")!
    await session.handleIncomingPairingURL(url)
    XCTAssertNotNil(session.pendingPairing)
    let _nil2 = try await repo.v2RawData()
    XCTAssertNil(_nil2)
    XCTAssertEqual(session.phase, .launching)
  }

  func testDeepLinkCancelLeavesSessionUntouched() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "live"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 3))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    let before = try await repo.v2RawData()
    await session.handleIncomingPairingURL(URL(string: "https://b.test/#token=other")!)
    session.cancelPendingPairing()
    XCTAssertNil(session.pendingPairing)
    let _eq3 = try await repo.v2RawData()
    XCTAssertEqual(_eq3, before)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
  }

  // The iOS analog of the Android recreate race (32299f2a4): transient
  // inactive states (app switcher, Notification Center, call banner) must
  // never read as "backgrounded", while a true background still drops the
  // memory-only pairing credential.
  func testTransientInactiveDoesNotClearPendingPairing() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "live"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 3))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()

    await session.handleIncomingPairingURL(URL(string: "https://b.test/#token=other")!)
    XCTAssertNotNil(session.pendingPairing)

    session.handleScenePhase(.inactive)
    XCTAssertFalse(session.state.liveLifecycle.isInBackground)
    XCTAssertNotNil(session.pendingPairing, "transient .inactive must not clear the pending pairing")

    session.handleScenePhase(.active)
    XCTAssertNotNil(session.pendingPairing, "returning to .active must not clear the pending pairing")
  }

  func testTrueBackgroundStillClearsPendingPairing() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "live"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 3))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()

    await session.handleIncomingPairingURL(URL(string: "https://b.test/#token=other")!)
    XCTAssertNotNil(session.pendingPairing)

    session.handleScenePhase(.background)
    XCTAssertTrue(session.state.liveLifecycle.isInBackground)
    XCTAssertNil(
      session.pendingPairing, "true background drops the memory-only pairing credential")
  }

  func testMalformedDeepLinkIsNoOp() async throws {
    let (session, repo, _) = try await makeSession { e, t in
      FakeRemoteAPI(endpoint: e, accessToken: t)
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.handleIncomingPairingURL(URL(string: "https://example.com/not-pairing")!)
    XCTAssertNil(session.pendingPairing)
    let _nil4 = try await repo.v2RawData()
    XCTAssertNil(_nil4)
  }

  // MARK: Thread / hydration

  func testInterestUpdatesAreOrderedLatestWins() async throws {
    var sockets: [FakeLiveSocket] = []
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t",
      apiFactory: { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(
          makeShell(seq: 1, threads: [makeThread(id: "t1"), makeThread(id: "t2")])
        )
        return api
      },
      socketFactory: { _ in
        let s = FakeLiveSocket()
        sockets.append(s)
        return s
      }
    )
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online

    // The real RichChat page lifecycle owns the item-interest set: attaching a
    // page for t1 flushes t1, replacing it with t2 flushes t2 (latest wins),
    // and dismissal clears it.
    let first = try await attachRichChatPage(session, threadID: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      sockets.last?.interests == ["t1"]
    }
    let second = try await attachRichChatPage(session, threadID: "t2")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      sockets.last?.interests == ["t2"]
    }
    XCTAssertEqual(sockets.last?.interests, ["t2"])
    session.detachRichChatSuite(second)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      sockets.last?.interests == []
    }
    _ = first
  }

  /// Attaches the real RichChat page lifecycle for one thread.
  @MainActor
  private func attachRichChatPage(
    _ session: AppSession,
    threadID: String
  ) throws -> RichChatControllerSuite {
    let suite = session.makeRichChatControllerSuite()
    let access = try XCTUnwrap(session.currentRichChatAccess)
    suite.select(access: access, threadID: threadID)
    session.attachRichChatSuite(suite)
    return suite
  }

  // MARK: Resync terminal state

  func testResync401ResetsGateAndRetainsCredentials() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .failure(
        RemoteClientError(message: "expired", status: 401, code: "unauthorized")
      )
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    // Bootstrap needs a successful first snapshot path — seed via temporary success then fail resync.
    // Direct connect with unauthorized snapshot after ready:
    // Start with success for bootstrap:
    // Re-create with staged API.
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.comp.401.\(UUID().uuidString)"
    let repo2 = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo2.wipeSuiteForTests() } }
    try await seedCredentials(repo2, profile: makeProfile(), token: "t")
    let session2 = AppSession(
      dependencies: testingDeps(
        repo: repo2,
        suite: suite,
        keychain: keychain,
        makeAPI: { e, t in
          let api = FakeRemoteAPI(endpoint: e, accessToken: t)
          api.environmentResult = .success(makeEnvironment())
          api.snapshotResult = .success(makeShell(seq: 1))
          return api
        }
      )
    )
    await session2.bootstrap()
    XCTAssertEqual(session2.phase, .ready)
    // Force resync failure 401 via replacing api behavior on trigger is hard with factory;
    // use handleAuthenticatedFailure path through resync by injecting failing api:
    session2.state.api = {
      let api = FakeRemoteAPI()
      api.snapshotResult = .failure(
        RemoteClientError(message: "expired", status: 401, code: "unauthorized")
      )
      return api
    }()
    session2.triggerResyncForTests(reason: "gap")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session2.phase == .sessionExpired
    }
    XCTAssertEqual(session2.phase, .sessionExpired)
    XCTAssertFalse(session2.state.resyncCoordinator.pending)
    XCTAssertFalse(session2.state.resyncCoordinator.inFlight)
    let raw = try await repo2.v2RawData()
    XCTAssertNotNil(raw, "credentials retained")
    _ = session
    _ = repo
  }

  func testMissingReadScopeBlocksBootstrapLive() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(scopes: ["session:operate"]),
      seedToken: "t"
    ) { e, t in FakeRemoteAPI(endpoint: e, accessToken: t) }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    XCTAssertEqual(session.phase, .sessionExpired)
  }

  func testNilPresentationModeIsNotGUI() {
    XCTAssertFalse(ThreadPresentationFilter.isGUIPresentation(nil))
    XCTAssertTrue(ThreadPresentationFilter.isGUIPresentation("gui"))
  }

  func testBackgroundSlowBootstrapDoesNotCreateSocket() async throws {
    let box = ContinuationBox()
    var sockets: [FakeLiveSocket] = []
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t",
      apiFactory: { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(makeShell(seq: 1))
        return GatedSnapshotAPI(inner: api, box: box)
      },
      socketFactory: { _ in
        let s = FakeLiveSocket()
        sockets.append(s)
        return s
      }
    )
    defer { Task { await repo.wipeSuiteForTests() } }

    async let boot: Void = session.bootstrap()
    try await box.waitUntilWaiting()
    session.handleScenePhase(.background)
    await box.resume()
    await boot
    XCTAssertTrue(
      sockets.isEmpty || sockets.allSatisfy { $0.startedWithSeq == nil || $0.suspended })
    // Foreground must start deferred socket
    session.handleScenePhase(.active)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      !sockets.isEmpty
    }
    XCTAssertFalse(sockets.isEmpty, "foreground must start deferred socket")
  }

  func testUnsupportedEnvironmentIsTerminalIncompatible() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .failure(
        RemoteClientError.unsupportedEnvironment(
          "The server advertised an unsupported auth policy.")
      )
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    XCTAssertEqual(session.phase, .protocolIncompatible)
    let _nn6 = try await repo.v2RawData()
    XCTAssertNotNil(_nn6)
  }

  func testCancellationDoesNotMapToNetworkError() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
      api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.handleScenePhase(.background)
    // Cancellation paths must not flip to transport network error UI.
    XCTAssertNotEqual(session.state.projectsLoadState, .failed("Network request failed."))
  }

  // MARK: Preserved-pairing upgrade (reviewed disk bindings → current live protocol)

  @MainActor
  private func makeProfileV9(
    desktopId: String = "desk-a",
    endpoint: String = "https://a.test"
  ) -> ConnectionProfile {
    ConnectionProfile(
      desktopId: desktopId,
      label: "Desktop A",
      httpBaseURL: endpoint,
      wsBaseURL: endpoint.replacingOccurrences(of: "https://", with: "wss://"),
      appVersion: "1.0.0",
      hostMode: nil,
      platform: "macOS",
      scopes: ["session:read", "session:operate"],
      tokenExpiresAt: nil,
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000),
      protocolVersion: PreservedPairingUpgrade.previousReleasedProtocolVersion
    )
  }

  @MainActor
  private func seedRegistryV9(
    _ catalog: HostCatalog,
    profile: ConnectionProfile,
    token: String,
    id: UInt64 = 1
  ) async throws -> HostRecord {
    let record = HostRecord(connectionId: ClientConnectionID(), profile: profile)
    let activated = try await catalog.activate(id: id, kind: .add)
    XCTAssertTrue(activated)
    let result = try await catalog.pairAdd(record: record, token: token, owning: id)
    XCTAssertEqual(result, .applied)
    return record
  }

  func testReviewedStoredBindingsUpgradeOnlyAfterVerifiedRead() async throws {
    for version in [9, 10, 11] {
      let gate = AsyncGate()
      let (session, repo, _) = try await makeSession { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
        api.snapshotResult = .success(makeShell(seq: 7))
        api.snapshotGateSkipCount = 0
        api.snapshotGate = gate
        return api
      }
      defer {
        Task {
          await repo.wipeSuiteForTests()
          await session.deps.hostCatalog.wipeForTests()
        }
      }
      var profile9 = makeProfileV9()
      profile9.protocolVersion = version
      let seeded = try await seedRegistryV9(
        session.deps.hostCatalog, profile: profile9, token: "tok-9")
      async let boot: Void = session.bootstrap()
      try await gate.waitUntilWaiting()
      let pending = try await session.deps.hostCatalog.snapshot()
      XCTAssertEqual(pending.selected?.protocolVersion, version)
      XCTAssertNil(session.state.api)
      XCTAssertNil(session.state.accessToken)
      await gate.resume()
      await boot
      XCTAssertEqual(session.phase, .ready)
      XCTAssertEqual(session.profile?.desktopId, "desk-a")
      XCTAssertEqual(
        session.profile?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
      XCTAssertEqual(session.state.accessToken, "tok-9")
      XCTAssertNotNil(session.state.api, "authority installed only after verified handshake")
      let durable = try await session.deps.hostCatalog.snapshot()
      XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
      XCTAssertEqual(
        durable.selected?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
      let persistedToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
      XCTAssertEqual(persistedToken, "tok-9")
    }
  }

  func testPreservedV9SourceV2ImportThenVerifiedUpgrade() async throws {
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
      api.snapshotResult = .success(makeShell(seq: 3))
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    // Disk: single-host v2 doc at protocol 9, empty multi-host registry.
    let profile9 = makeProfileV9()
    let doc9 = SessionCredentialDocument(
      version: SessionCredentialDocument.currentVersion,
      protocolVersion: PreservedPairingUpgrade.previousReleasedProtocolVersion,
      profile: profile9,
      accessToken: "tok-v2-9"
    )
    try await repo.seedV2Document(try JSONDecoding.encoder.encode(doc9))
    await session.bootstrap()
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(
      session.profile?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(session.state.accessToken, "tok-v2-9")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(
      durable.selected?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(durable.selected?.desktopId, "desk-a")
  }

  func testPreservedV9SplitV1ImportThenVerifiedUpgrade() async throws {
    let keychain = InMemoryKeychainIO()
    let suite = "poracode.tests.upgrade.splitv1.\(UUID().uuidString)"
    let repo = SessionCredentialRepository(suiteName: suite, keychain: keychain)
    defer { Task { await repo.wipeSuiteForTests() } }
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("poracode-upgrade-splitv1-\(suite)", isDirectory: true)
    let catalog = HostCatalog(
      directory: directory,
      vaultIO: keychain,
      sourceKeychain: keychain,
      defaults: HostSourceDefaults(
        value: UserDefaults(suiteName: suite) ?? .standard),
      suiteName: suite
    )
    defer { Task { await catalog.wipeForTests() } }
    // Disk: split-v1 profile at 9 + legacy token.
    let profile9 = makeProfileV9()
    let legacyDoc = ConnectionStoreDocument(version: 1, profile: profile9)
    await repo.seedLegacyProfileDocument(try JSONDecoding.encoder.encode(legacyDoc))
    try await repo.seedLegacyToken("tok-split-9")
    // Legacy single-host load must surface mismatch (not corrupt) for upgrade.
    let bootId: UInt64 = 1
    let activated = try await repo.activate(id: bootId, kind: .bootstrapLoad)
    XCTAssertTrue(activated)
    guard case .protocolMismatch(let creds) = try await repo.loadOutcome(owning: bootId) else {
      return XCTFail("split-v1 9 must load as protocolMismatch for verified upgrade")
    }
    XCTAssertEqual(creds.accessToken, "tok-split-9")
    XCTAssertEqual(
      creds.profile.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion)
    // Production bootstrap via the same catalog: import then verified upgrade.
    let session = AppSession(
      dependencies: SessionDependencies.testing(
        credentialStore: repo,
        hostCatalog: catalog,
        makeAPI: { e, t in
          let api = FakeRemoteAPI(endpoint: e, accessToken: t)
          api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
          api.snapshotResult = .success(makeShell(seq: 5))
          return api
        },
        makeSocket: { _ in FakeLiveSocket() }
      )
    )
    await session.bootstrap()
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.state.accessToken, "tok-split-9")
    let durable = try await catalog.snapshot()
    XCTAssertEqual(
      durable.selected?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
  }

  func testPreservedV9Live9RemainsIncompatiblePreservingBytes() async throws {
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .failure(RemoteClientError.protocolMismatch(found: 9))
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let profile9 = makeProfileV9()
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: profile9, token: "tok-9")
    await session.bootstrap()
    XCTAssertEqual(session.phase, .protocolIncompatible)
    XCTAssertEqual(
      session.profile?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion)
    XCTAssertNil(session.state.accessToken, "authority stays blocked without verified handshake")
    XCTAssertNil(session.state.api)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
    XCTAssertEqual(
      durable.selected?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion,
      "live 9 must never trigger a durable rebind")
    let live9Token = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(live9Token, "tok-9")
  }

  func testPreservedV9OfflineParksRetryableWithoutWrite() async throws {
    let online = false
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      if online {
        api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
        api.snapshotResult = .success(makeShell(seq: 7))
      } else {
        api.environmentResult = .failure(
          RemoteClientError(message: "Network request failed.", status: 0, code: "network"))
      }
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let profile9 = makeProfileV9()
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: profile9, token: "tok-9")
    let bytesBefore = try await session.deps.hostCatalog.registryRawData()
    await session.bootstrap()
    // Retryable park: no terminal phase, no authority, bootstrap stays open.
    XCTAssertEqual(session.phase, .connecting)
    XCTAssertFalse(session.state.bootstrapCompleted)
    XCTAssertNil(session.state.accessToken)
    XCTAssertNil(session.state.api)
    XCTAssertEqual(
      session.profile?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(
      durable.selected?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion)
    let offlineToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(
      offlineToken, "tok-9",
      "pre-commit offline must preserve stored token bytes")
    let bytesAfterOffline = try await session.deps.hostCatalog.registryRawData()
    XCTAssertEqual(
      bytesAfterOffline, bytesBefore,
      "parked retry must not rewrite durable bytes")
  }

  @MainActor
  private final class PreservedUpgradeProbeState {
    var online = false
    var gateSnapshots = true
    var apis: [FakeRemoteAPI] = []
  }

  func testPreservedV9OfflineForegroundOnlineUpgrades() async throws {
    let probe = PreservedUpgradeProbeState()
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      if probe.online {
        api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
        api.snapshotResult = .success(makeShell(seq: 7))
      } else {
        api.environmentResult = .failure(
          RemoteClientError(message: "Network request failed.", status: 0, code: "network"))
      }
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
    let bytesBefore = try await session.deps.hostCatalog.registryRawData()
    await session.bootstrap()
    XCTAssertEqual(session.phase, .connecting)
    XCTAssertFalse(session.state.bootstrapCompleted)
    let bytesParked = try await session.deps.hostCatalog.registryRawData()
    XCTAssertEqual(bytesParked, bytesBefore, "offline park must not rewrite durable bytes")
    // Foreground with the current-10 authenticated server retries verified.
    probe.online = true
    session.handleScenePhase(.background)
    session.handleScenePhase(.active)
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.phase == .ready
        && session.profile?.protocolVersion == ProtocolConstants.remoteProtocolVersion
    }
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertEqual(
      session.profile?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(session.state.accessToken, "tok-9")
    XCTAssertNotNil(session.state.api, "authority installed only after verified handshake")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
    XCTAssertEqual(
      durable.selected?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    let upgradedToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(upgradedToken, "tok-9")
  }

  func testPreservedV9BackgroundDuringSnapshotForegroundRetriesWithoutStaleInstall() async throws {
    let gate = AsyncGate()
    let probe = PreservedUpgradeProbeState()
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
      api.snapshotResult = .success(makeShell(seq: 9))
      if probe.gateSnapshots {
        api.snapshotGateSkipCount = 0
        api.snapshotGate = gate
      }
      probe.apis.append(api)
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
    async let boot: Void = session.bootstrap()
    try await gate.waitUntilWaiting()
    session.handleScenePhase(.background)
    session.handleScenePhase(.active)
    probe.gateSnapshots = false
    for api in probe.apis { api.snapshotGate = nil }
    await gate.resume()
    await boot
    // The background-stalled proof must not install stale state; the
    // foreground retry upgrades verified with the same stored token.
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.phase == .ready
        && session.profile?.protocolVersion == ProtocolConstants.remoteProtocolVersion
    }
    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(
      session.profile?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(session.state.accessToken, "tok-9")
    XCTAssertGreaterThanOrEqual(probe.apis.count, 2, "foreground must retry with a fresh handshake")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
    XCTAssertEqual(
      durable.selected?.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    let finalToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(finalToken, "tok-9")
  }

  func testPreservedV9SameIdTokenReplacementAbandonsWithoutOverwrite() async throws {
    let gate = AsyncGate()
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentGate = gate
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
      api.snapshotResult = .success(makeShell(seq: 9))
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
    async let boot: Void = session.bootstrap()
    try await gate.waitUntilWaiting()
    // Same-id re-pair rotates the vault token and renames the record while the
    // upgrade handshake is suspended precommit, under newer catalog ownership.
    // Seeded with id 1 and the upgrade began with the next id, so 100+
    // is unambiguously newer regardless of the bootstrap allocation.
    var rotated = makeProfileV9()
    rotated.label = "Desktop A Renamed"
    let rotatedRecord = HostRecord(connectionId: seeded.connectionId, profile: rotated)
    let rotationActivated = try await session.deps.hostCatalog.activate(id: 100, kind: .add)
    XCTAssertTrue(rotationActivated)
    let rotationResult = try await session.deps.hostCatalog.pairAdd(
      record: rotatedRecord, token: "tok-rotated", owning: 100)
    XCTAssertEqual(rotationResult, .applied)
    await gate.resume()
    await boot
    // The stale handshake must not clobber the newer token or metadata, and
    // must not rebind the rotated v9 binding to v10.
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
    XCTAssertEqual(durable.selected?.label, "Desktop A Renamed")
    XCTAssertEqual(
      durable.selected?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion)
    let preservedRotation = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(
      preservedRotation, "tok-rotated",
      "same-id token replacement must survive a stale precommit handshake")
  }

  func testPreservedV9FailureNeverWritesWrongProfile() async throws {
    // Expired token: public environment still 200 (proves nothing about the
    // token), but the authenticated snapshot 401 must block the durable rebind.
    // `environment()` is auth:"public" — a fake environment 401 alone would
    // not prove revocation handling.
    do {
      let (session, repo, _) = try await makeSession { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
        api.snapshotResult = .failure(
          RemoteClientError(message: "expired", status: 401, code: "unauthorized"))
        return api
      }
      defer {
        Task {
          await repo.wipeSuiteForTests()
          await session.deps.hostCatalog.wipeForTests()
        }
      }
      let seeded = try await seedRegistryV9(
        session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
      await session.bootstrap()
      XCTAssertEqual(session.phase, .sessionExpired)
      XCTAssertNil(session.state.api)
      XCTAssertNil(
        session.state.accessToken, "revoked token must not install authority")
      let durable = try await session.deps.hostCatalog.snapshot()
      XCTAssertEqual(
        durable.selected?.protocolVersion,
        PreservedPairingUpgrade.previousReleasedProtocolVersion)
      let revokedToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
      XCTAssertEqual(revokedToken, "tok-9")
    }
    // Identity mismatch: endpoint now serves a different desktop → no write.
    do {
      let (session, repo, _) = try await makeSession { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment(desktopId: "desk-other"))
        api.snapshotResult = .success(makeShell(seq: 1))
        return api
      }
      defer {
        Task {
          await repo.wipeSuiteForTests()
          await session.deps.hostCatalog.wipeForTests()
        }
      }
      let seeded = try await seedRegistryV9(
        session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
      await session.bootstrap()
      XCTAssertEqual(session.phase, .protocolIncompatible)
      XCTAssertNil(session.state.accessToken)
      let durable = try await session.deps.hostCatalog.snapshot()
      XCTAssertEqual(durable.selected?.connectionId, seeded.connectionId)
      XCTAssertEqual(durable.selected?.desktopId, "desk-a")
      XCTAssertEqual(
        durable.selected?.protocolVersion,
        PreservedPairingUpgrade.previousReleasedProtocolVersion,
        "desktopId mismatch must never rebind the wrong profile")
    }
  }

  func testPreservedV9CancelNeverWritesWrongProfile() async throws {
    let gate = AsyncGate()
    var envAPIs: [FakeRemoteAPI] = []
    let (session, repo, _) = try await makeSession { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentGate = gate
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-a"))
      api.snapshotResult = .success(makeShell(seq: 9))
      envAPIs.append(api)
      return api
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-9")
    async let boot: Void = session.bootstrap()
    try await gate.waitUntilWaiting()
    // Host switch wins while the upgrade handshake is suspended pre-commit:
    // bump the session generation so the suspended handshake becomes stale.
    // Boundary: this proves pre-commit cancel never writes. Once pairAdd
    // commits, durable bytes stay upgraded even when the install is abandoned.
    _ = session.state.operationOwner.begin(.switchHost)
    await gate.resume()
    await boot
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(
      durable.selected?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion,
      "pre-commit superseded handshake must never persist a rebind")
    let cancelledToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(cancelledToken, "tok-9")
    XCTAssertTrue(envAPIs.count >= 1)
    _ = seeded
  }

  func testPreservedUpgradeTransportEnvironmentPublicSnapshotProtected() async throws {
    // Actual transport proof: environment is public (200 even with a bad
    // token; `auth:"public"`, `httpRouter.ts`), snapshot is bearer-protected
    // (401 with the same bad token; `auth:"bearer"`, `session:read`).
    let envJSON = """
      {
        "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
        "desktopId": "desk-a",
        "label": "Desktop A",
        "appVersion": "1.0.0",
        "auth": {
          "policy": "remote-reachable",
          "bootstrapMethods": ["one-time-token"],
          "sessionMethods": ["bearer-access-token"],
          "scopes": ["session:read", "session:operate"]
        },
        "endpoints": {
          "httpBaseUrl": "https://a.test/",
          "wsBaseUrl": "wss://a.test/"
        }
      }
      """
    PreservedUpgradeRouteURLProtocol.reset(
      environmentBody: Data(envJSON.utf8),
      snapshotStatus: 401,
      snapshotBody: Data(#"{"error":{"code":"unauthorized","message":"expired"}}"#.utf8)
    )
    defer { PreservedUpgradeRouteURLProtocol.resetEmpty() }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [PreservedUpgradeRouteURLProtocol.self]
    let session = URLSession(configuration: config)
    // Same expired token for both routes: public succeeds, protected rejects.
    let client = RemoteAPIClient(
      endpoint: "https://a.test", accessToken: "tok-expired", session: session)
    let environment = try await client.environment()
    XCTAssertEqual(environment.protocolVersion, ProtocolConstants.remoteProtocolVersion)
    XCTAssertEqual(environment.desktopId, "desk-a")
    do {
      _ = try await client.snapshot()
      XCTFail("expired token must fail the protected snapshot read")
    } catch let error as RemoteClientError {
      XCTAssertTrue(error.isUnauthorized, "snapshot 401 must read as unauthorized")
      XCTAssertEqual(error.status, 401)
    }
    let paths = PreservedUpgradeRouteURLProtocol.requests.compactMap(\.url?.path)
    XCTAssertTrue(paths.contains(where: { $0.contains("environment") }))
    XCTAssertTrue(paths.contains("/api/snapshot"))
    // The protected read carried the bad bearer token and was rejected —
    // the public descriptor succeeding with the same token proves nothing
    // about the token.
    let snapshotRequest = try XCTUnwrap(
      PreservedUpgradeRouteURLProtocol.requests.first(where: {
        $0.url?.path == "/api/snapshot"
      }))
    XCTAssertEqual(
      snapshotRequest.value(forHTTPHeaderField: "Authorization"), "Bearer tok-expired")
    // Public route needs no token at all.
    PreservedUpgradeRouteURLProtocol.requests = []
    let anonClient = RemoteAPIClient(endpoint: "https://a.test", session: session)
    let anonEnv = try await anonClient.environment()
    XCTAssertEqual(anonEnv.desktopId, "desk-a")
  }

  func testPreservedV9ExpiredTokenViaTransportBlocksDurableWrite() async throws {
    // End-to-end on real transport: live v10 env 200 (public) + snapshot 401
    // (protected) with the stored token must expire without a durable rebind.
    let envJSON = """
      {
        "protocolVersion": \(ProtocolConstants.remoteProtocolVersion),
        "desktopId": "desk-a",
        "label": "Desktop A",
        "appVersion": "1.0.0",
        "auth": {
          "policy": "remote-reachable",
          "bootstrapMethods": ["one-time-token"],
          "sessionMethods": ["bearer-access-token"],
          "scopes": ["session:read", "session:operate"]
        },
        "endpoints": {
          "httpBaseUrl": "https://a.test/",
          "wsBaseUrl": "wss://a.test/"
        }
      }
      """
    PreservedUpgradeRouteURLProtocol.reset(
      environmentBody: Data(envJSON.utf8),
      snapshotStatus: 401,
      snapshotBody: Data(#"{"error":{"code":"unauthorized","message":"expired"}}"#.utf8)
    )
    defer { PreservedUpgradeRouteURLProtocol.resetEmpty() }
    let (session, repo, _) = try await makeSession { endpoint, token in
      let config = URLSessionConfiguration.ephemeral
      config.protocolClasses = [PreservedUpgradeRouteURLProtocol.self]
      let client = RemoteAPIClient(
        endpoint: endpoint, accessToken: token,
        session: URLSession(configuration: config))
      return RemoteAPIClientBox(client, richChatEndpoint: nil, accessToken: token)
    }
    defer {
      Task {
        await repo.wipeSuiteForTests()
        await session.deps.hostCatalog.wipeForTests()
      }
    }
    let seeded = try await seedRegistryV9(
      session.deps.hostCatalog, profile: makeProfileV9(), token: "tok-expired")
    await session.bootstrap()
    XCTAssertEqual(session.phase, .sessionExpired)
    XCTAssertNil(session.state.api, "no authority installs before the authenticated proof")
    XCTAssertNil(session.state.accessToken)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(
      durable.selected?.protocolVersion,
      PreservedPairingUpgrade.previousReleasedProtocolVersion,
      "expired token must not rebind to v10")
    let expiredToken = try await session.deps.hostCatalog.token(for: seeded.connectionId)
    XCTAssertEqual(expiredToken, "tok-expired")
    XCTAssertTrue(
      PreservedUpgradeRouteURLProtocol.requests.contains(where: {
        $0.url?.path == "/api/snapshot"
      }),
      "upgrade must attempt the authenticated read before any write")
  }

  func testPreservedPairingUpgradeVerifyGates() {
    let stored9 = ConnectionProfile(
      desktopId: "desk-a",
      label: "A",
      httpBaseURL: "https://a.test",
      wsBaseURL: "wss://a.test",
      appVersion: "1.0.0",
      scopes: ["session:read"],
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000),
      protocolVersion: PreservedPairingUpgrade.previousReleasedProtocolVersion
    )
    let live10 = RemoteEnvironmentDescriptor(
      protocolVersion: ProtocolConstants.remoteProtocolVersion,
      hostMode: nil,
      desktopId: "desk-a",
      label: "A",
      appVersion: "2.0.0",
      platform: "macOS",
      auth: .init(
        policy: ProtocolConstants.authPolicy,
        bootstrapMethods: [ProtocolConstants.bootstrapMethod],
        sessionMethods: [ProtocolConstants.sessionMethod],
        scopes: ProtocolConstants.standardScopes
      ),
      endpoints: .init(httpBaseUrl: "https://a.test", wsBaseUrl: "wss://a.test")
    )
    XCTAssertTrue(PreservedPairingUpgrade.verify(stored: stored9, environment: live10))
    for version in [9, 10, 11] {
      var oldEnvironment = live10
      oldEnvironment.protocolVersion = version
      XCTAssertFalse(PreservedPairingUpgrade.verify(stored: stored9, environment: oldEnvironment))
    }
    // Wrong host never verifies (host-switch guard).
    var otherDesk = live10
    otherDesk.desktopId = "desk-other"
    XCTAssertFalse(PreservedPairingUpgrade.verify(stored: stored9, environment: otherDesk))
    // Stored without read never verifies (scope guard, no old cache adoption).
    var noRead = stored9
    noRead.scopes = ["session:operate"]
    XCTAssertFalse(PreservedPairingUpgrade.verify(stored: noRead, environment: live10))
    // Stored current protocol is not an upgrade candidate.
    var stored10 = stored9
    stored10.protocolVersion = ProtocolConstants.remoteProtocolVersion
    XCTAssertFalse(PreservedPairingUpgrade.verify(stored: stored10, environment: live10))
  }
}

// MARK: - Deterministic wait helpers

/// Poll a MainActor condition with a hard deadline (no ownership sleeps).
@MainActor
func waitUntil(
  timeoutNanoseconds: UInt64,
  pollNanoseconds: UInt64 = 5_000_000,
  _ condition: @MainActor () -> Bool
) async throws {
  let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
  while !condition() {
    if DispatchTime.now().uptimeNanoseconds >= deadline {
      throw TestAsyncTimeoutError.timedOut("waitUntil")
    }
    try await Task.sleep(nanoseconds: pollNanoseconds)
    try Task.checkCancellation()
  }
}

/// Single-waiter gate with real timeout and cancellation-aware wait.
actor ContinuationBox {
  private var continuation: CheckedContinuation<Void, Never>?
  private var isWaiting = false
  private var pendingResume = false
  private var waitObservers: [CheckedContinuation<Void, any Error>] = []

  func wait() async {
    if pendingResume {
      pendingResume = false
      return
    }
    isWaiting = true
    let observers = waitObservers
    waitObservers = []
    for o in observers { o.resume() }
    await withTaskCancellationHandler {
      await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
        continuation = cont
        // Hard timeout so a forgotten resume cannot hang xcodebuild.
        Task { [weak self] in
          try? await Task.sleep(nanoseconds: 6_000_000_000)
          await self?.resume()
        }
      }
    } onCancel: {
      Task { await self.resume() }
    }
  }

  /// Wait until a caller is blocked in `wait()`, or throw on timeout.
  func waitUntilWaiting(timeoutNanoseconds: UInt64 = 2_000_000_000) async throws {
    if isWaiting || pendingResume { return }
    try await withThrowingTaskGroup(of: Bool.self) { group in
      group.addTask {
        try await self.observeWaiting()
        return true
      }
      group.addTask {
        try await Task.sleep(nanoseconds: timeoutNanoseconds)
        return false
      }
      guard let first = try await group.next() else {
        throw TestAsyncTimeoutError.timedOut("ContinuationBox.waitUntilWaiting")
      }
      group.cancelAll()
      if !first {
        throw TestAsyncTimeoutError.timedOut("ContinuationBox.waitUntilWaiting")
      }
    }
  }

  func resume() {
    isWaiting = false
    if let cont = continuation {
      continuation = nil
      cont.resume()
    } else {
      pendingResume = true
    }
  }

  private func observeWaiting() async throws {
    if isWaiting || pendingResume { return }
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation {
        (cont: CheckedContinuation<Void, any Error>) in
        if isWaiting || pendingResume {
          cont.resume()
          return
        }
        if Task.isCancelled {
          cont.resume(throwing: CancellationError())
          return
        }
        waitObservers.append(cont)
      }
    } onCancel: {
      Task { await self.failObservers() }
    }
  }

  private func failObservers() {
    let observers = waitObservers
    waitObservers = []
    for o in observers {
      o.resume(throwing: CancellationError())
    }
  }
}

@MainActor
final class GatedHistoryAPI: SessionRemoteAPI {
  let inner: FakeRemoteAPI
  var box: ContinuationBox
  var accessToken: String? {
    get { inner.accessToken }
    set { inner.accessToken = newValue }
  }
  var httpEndpoint: String { get async { await inner.httpEndpoint } }
  init(inner: FakeRemoteAPI, box: ContinuationBox) {
    self.inner = inner
    self.box = box
  }
  func setAccessToken(_ token: String?) async { await inner.setAccessToken(token) }
  func environment() async throws -> RemoteEnvironmentDescriptor { try await inner.environment() }
  func exchangePairingCredential(credential: String, scopes: [String]) async throws
    -> RemoteAccessTokenResult
  {
    try await inner.exchangePairingCredential(credential: credential, scopes: scopes)
  }
  func snapshot() async throws -> RemoteShellSnapshot { try await inner.snapshot() }
  func agentStatuses() async throws -> SessionAgentStatuses { try await inner.agentStatuses() }
  func describeHost() async throws -> HostServiceCapabilities { try await inner.describeHost() }
  func threadHistory(threadId: String, targetTimelineEntryCount: Int?) async throws
    -> RemoteThreadSnapshot
  {
    await box.wait()
    return try await inner.threadHistory(
      threadId: threadId, targetTimelineEntryCount: targetTimelineEntryCount)
  }
  func threadRuntimeItemsPage(
    threadId: String, beforePosition: Int?, limit: Int, targetTimelineEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    try await inner.threadRuntimeItemsPage(
      threadId: threadId, beforePosition: beforePosition, limit: limit,
      targetTimelineEntryCount: targetTimelineEntryCount)
  }
  func sendThreadInput(threadId: String, prompt: String, config: ThreadConfig) async throws {
    try await inner.sendThreadInput(threadId: threadId, prompt: prompt, config: config)
  }
  func interruptThread(threadId: String) async throws {
    try await inner.interruptThread(threadId: threadId)
  }
}

@MainActor
final class GatedPageAPI: SessionRemoteAPI {
  let inner: FakeRemoteAPI
  let box: ContinuationBox
  var pageItems: [PersistedRuntimeItem] = []
  var accessToken: String? {
    get { inner.accessToken }
    set { inner.accessToken = newValue }
  }
  var httpEndpoint: String { get async { await inner.httpEndpoint } }
  init(inner: FakeRemoteAPI, box: ContinuationBox) {
    self.inner = inner
    self.box = box
  }
  func setAccessToken(_ token: String?) async { await inner.setAccessToken(token) }
  func environment() async throws -> RemoteEnvironmentDescriptor { try await inner.environment() }
  func exchangePairingCredential(credential: String, scopes: [String]) async throws
    -> RemoteAccessTokenResult
  {
    try await inner.exchangePairingCredential(credential: credential, scopes: scopes)
  }
  func snapshot() async throws -> RemoteShellSnapshot { try await inner.snapshot() }
  func agentStatuses() async throws -> SessionAgentStatuses { try await inner.agentStatuses() }
  func describeHost() async throws -> HostServiceCapabilities { try await inner.describeHost() }
  func threadHistory(threadId: String, targetTimelineEntryCount: Int?) async throws
    -> RemoteThreadSnapshot
  {
    try await inner.threadHistory(
      threadId: threadId, targetTimelineEntryCount: targetTimelineEntryCount)
  }
  func threadRuntimeItemsPage(
    threadId: String, beforePosition: Int?, limit: Int, targetTimelineEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    await box.wait()
    return RemoteRuntimeItemsPage(items: pageItems, nextCursor: nil)
  }
  func sendThreadInput(threadId: String, prompt: String, config: ThreadConfig) async throws {
    try await inner.sendThreadInput(threadId: threadId, prompt: prompt, config: config)
  }
  func interruptThread(threadId: String) async throws {
    try await inner.interruptThread(threadId: threadId)
  }
}

@MainActor
final class GatedSnapshotAPI: SessionRemoteAPI {
  let inner: FakeRemoteAPI
  let box: ContinuationBox
  var accessToken: String? {
    get { inner.accessToken }
    set { inner.accessToken = newValue }
  }
  var httpEndpoint: String { get async { await inner.httpEndpoint } }
  init(inner: FakeRemoteAPI, box: ContinuationBox) {
    self.inner = inner
    self.box = box
  }
  func setAccessToken(_ token: String?) async { await inner.setAccessToken(token) }
  func environment() async throws -> RemoteEnvironmentDescriptor { try await inner.environment() }
  func exchangePairingCredential(credential: String, scopes: [String]) async throws
    -> RemoteAccessTokenResult
  {
    try await inner.exchangePairingCredential(credential: credential, scopes: scopes)
  }
  func snapshot() async throws -> RemoteShellSnapshot {
    await box.wait()
    return try await inner.snapshot()
  }
  func agentStatuses() async throws -> SessionAgentStatuses { try await inner.agentStatuses() }
  func describeHost() async throws -> HostServiceCapabilities { try await inner.describeHost() }
  func threadHistory(threadId: String, targetTimelineEntryCount: Int?) async throws
    -> RemoteThreadSnapshot
  {
    try await inner.threadHistory(
      threadId: threadId, targetTimelineEntryCount: targetTimelineEntryCount)
  }
  func threadRuntimeItemsPage(
    threadId: String, beforePosition: Int?, limit: Int, targetTimelineEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    try await inner.threadRuntimeItemsPage(
      threadId: threadId, beforePosition: beforePosition, limit: limit,
      targetTimelineEntryCount: targetTimelineEntryCount)
  }
  func sendThreadInput(threadId: String, prompt: String, config: ThreadConfig) async throws {
    try await inner.sendThreadInput(threadId: threadId, prompt: prompt, config: config)
  }
  func interruptThread(threadId: String) async throws {
    try await inner.interruptThread(threadId: threadId)
  }
}

// MARK: - Preserved-upgrade transport routing (actual URLProtocol)

/// Routes by path so one stub proves the auth boundary on real transport:
/// environment is public (200 regardless of Authorization), snapshot is
/// bearer-protected (configured status, 401 for an expired token).
final class PreservedUpgradeRouteURLProtocol: URLProtocol {
  nonisolated(unsafe) static var environmentBody: Data = Data()
  nonisolated(unsafe) static var snapshotStatus: Int = 401
  nonisolated(unsafe) static var snapshotBody: Data = Data()
  nonisolated(unsafe) static var requests: [URLRequest] = []

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.requests.append(request)
    let path = request.url?.path ?? ""
    if path.contains("environment") {
      let response = HTTPURLResponse(
        url: request.url!, statusCode: 200, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Self.environmentBody)
      client?.urlProtocolDidFinishLoading(self)
    } else if path == "/api/snapshot" {
      let response = HTTPURLResponse(
        url: request.url!, statusCode: Self.snapshotStatus, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Self.snapshotBody)
      client?.urlProtocolDidFinishLoading(self)
    } else {
      let response = HTTPURLResponse(
        url: request.url!, statusCode: 404, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Data(#"{"error":{"code":"x","message":"x"}}"#.utf8))
      client?.urlProtocolDidFinishLoading(self)
    }
  }

  override func stopLoading() {}

  static func reset(environmentBody: Data, snapshotStatus: Int, snapshotBody: Data) {
    self.environmentBody = environmentBody
    self.snapshotStatus = snapshotStatus
    self.snapshotBody = snapshotBody
    self.requests = []
  }

  static func resetEmpty() {
    self.environmentBody = Data()
    self.snapshotStatus = 401
    self.snapshotBody = Data()
    self.requests = []
  }
}
