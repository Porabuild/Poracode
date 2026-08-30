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

  private(set) var snapshotCalls = 0
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

  func environment() async throws -> RemoteEnvironmentDescriptor {
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
    protocolVersion: 8,
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
    let work = Task { @MainActor in
      try await self.runBackgroundDuringAfterCommitReconcilesOnForeground()
    }
    let timeout = Task {
      try await Task.sleep(nanoseconds: 8_000_000_000)
      throw TestAsyncTimeoutError.timedOut(
        "testBackgroundDuringAfterCommitReconcilesOnForeground")
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
    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }
    async let pairA1: Void = session.pair(
      with: .init(manualBaseURL: "https://a1.test", manualToken: "pair-a1")
    )
    try await gate.waitUntilWaiting()
    session.handleScenePhase(.background)
    await gate.resume()
    await pairA1
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
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-a")
    assertEqual(
      try await session.deps.hostCatalog.token(for: durable.selected!.connectionId),
      "token-desk-a")
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

  func testSameIdCloseReopenRejectsStaleHistory() async throws {
    let box = ContinuationBox()
    let inner = FakeRemoteAPI()
    inner.environmentResult = .success(makeEnvironment())
    inner.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "same")]))
    inner.historyResults["same"] = .success(
      makeHistory(
        threadId: "same",
        seq: 1,
        items: [
          PersistedRuntimeItem(
            id: "a", type: "user_message", state: "completed",
            payload: nil, streams: ["input_text": "A"], parentItemId: nil
          )
        ]
      )
    )
    let gated = GatedHistoryAPI(inner: inner, box: box)
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { _, t in
      gated.accessToken = t
      return gated
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()

    session.openThread(id: "same")
    let epoch1 = session.openThreadEpoch
    try await box.waitUntilWaiting()
    session.closeThread()
    session.openThread(id: "same")
    let epoch2 = session.openThreadEpoch
    XCTAssertNotEqual(epoch1, epoch2)
    // Stale history must not install after close/reopen.
    await box.resume()
    // Drain the cancelled/stale load without ownership sleeps: resume already unblocked it.
    // Second open installs via its own task; epoch must remain the reopen epoch.
    XCTAssertEqual(session.openThreadId, "same")
    XCTAssertNotEqual(session.openThreadEpoch, epoch1)
    XCTAssertEqual(session.openThreadEpoch, epoch2)
  }

  func testLoadOlderItemsNeverInjectsAcrossThreads() async throws {
    let box = ContinuationBox()
    let inner = FakeRemoteAPI()
    inner.environmentResult = .success(makeEnvironment())
    inner.snapshotResult = .success(
      makeShell(seq: 1, threads: [makeThread(id: "thread-a"), makeThread(id: "thread-b")])
    )
    inner.historyResults["thread-a"] = .success(
      makeHistory(
        threadId: "thread-a",
        seq: 2,
        items: [
          PersistedRuntimeItem(
            id: "a", type: "user_message", state: "completed",
            payload: nil, streams: ["input_text": "A"], parentItemId: nil
          )
        ]
      )
    )
    inner.historyResults["thread-b"] = .success(
      makeHistory(
        threadId: "thread-b",
        seq: 2,
        items: [
          PersistedRuntimeItem(
            id: "b", type: "user_message", state: "completed",
            payload: nil, streams: ["input_text": "B"], parentItemId: nil
          )
        ]
      )
    )
    let gated = GatedPageAPI(inner: inner, box: box)
    gated.pageItems = [
      PersistedRuntimeItem(
        id: "older-A", type: "user_message", state: "completed",
        payload: nil, streams: ["input_text": "older-A"], parentItemId: nil
      )
    ]
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { _, t in
      gated.accessToken = t
      return gated
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.openThread(id: "thread-a")
    // Wait for history install of thread-a before pagination (gate on page path only).
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadItems.map(\.id).contains("a")
    }
    async let older: Void = session.loadOlderItems()
    try await box.waitUntilWaiting()
    session.openThread(id: "thread-b")
    await box.resume()
    await older
    XCTAssertEqual(session.openThreadId, "thread-b")
    XCTAssertFalse(session.threadItems.map(\.id).contains("older-A"))
  }

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
        api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
        api.historyResults["t2"] = .success(makeHistory(threadId: "t2", seq: 1))
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
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      sockets.last?.interests == ["t1"]
    }
    session.openThread(id: "t2")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      sockets.last?.interests == ["t2"]
    }
    let last = sockets.last
    XCTAssertEqual(last?.interests, ["t2"])
  }

  // MARK: Resync terminal state

  func testResyncThreadSwitchAbortsWithoutPartialCommit() async throws {
    let gate = AsyncGate()
    var sockets: [FakeLiveSocket] = []
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t",
      apiFactory: { e, t in
        let api = FakeRemoteAPI(endpoint: e, accessToken: t)
        api.environmentResult = .success(makeEnvironment())
        api.snapshotResult = .success(
          makeShell(seq: 10, threads: [makeThread(id: "tA"), makeThread(id: "tB")])
        )
        api.historyResults["tA"] = .success(
          makeHistory(
            threadId: "tA",
            seq: 5,
            items: [
              PersistedRuntimeItem(
                id: "a", type: "user_message", state: "completed",
                payload: nil, streams: ["input_text": "A"], parentItemId: nil
              )
            ]
          )
        )
        api.historyResults["tB"] = .success(
          makeHistory(
            threadId: "tB",
            seq: 5,
            items: [
              PersistedRuntimeItem(
                id: "b", type: "user_message", state: "completed",
                payload: nil, streams: ["input_text": "B"], parentItemId: nil
              )
            ]
          )
        )
        api.snapshotGate = gate
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
    let socket = try XCTUnwrap(sockets.last)
    socket.markResyncSuspendedForTests()
    session.openThread(id: "tA")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadItems.map(\.id) == ["a"]
    }

    // Mid-resync switch: abort must not partially commit shell/history.
    session.triggerResyncForTests(reason: "gap")
    try await gate.waitUntilWaiting()
    let seqBefore = session.state.lastSeenSeq
    session.openThread(id: "tB")
    await gate.resume()
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      !session.state.resyncCoordinator.pending && !session.state.resyncCoordinator.inFlight
    }

    XCTAssertFalse(session.state.resyncCoordinator.pending)
    XCTAssertFalse(session.state.resyncCoordinator.inFlight)
    XCTAssertEqual(session.openThreadId, "tB")
    // Captured socket recovered; replacement identity path never resumes a different socket.
    XCTAssertGreaterThanOrEqual(socket.recoverFromResyncAbortCount, 1)
    XCTAssertTrue(socket.resumeAfterResyncSeqs.isEmpty)
    // Later live event may apply (gate open).
    session.handleServerMessageForTests(
      .event(
        seq: seqBefore + 1,
        event: .object([
          "type": .string("thread-runtime-event"),
          "threadId": .string("tB"),
          "event": .object([
            "type": .string("item.started"),
            "threadId": .string("tB"),
            "itemId": .string("live-1"),
            "itemType": .string("assistant_message"),
          ]),
        ])
      )
    )
    // History may still be installing for tB; ensure coordinator not wedged.
    XCTAssertFalse(session.state.resyncCoordinator.pending)
  }

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

  func testSend401ReturnsFalseAndRetainsCredentials() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
      api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
      api.sendError = RemoteClientError(message: "expired", status: 401, code: "unauthorized")
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadLoadState == .loaded || !session.threadItems.isEmpty
        || session.threadSnapshot != nil
    }
    let ok = await session.sendMessage("hi")
    XCTAssertFalse(ok)
    XCTAssertEqual(session.phase, .sessionExpired)
    let _nn5 = try await repo.v2RawData()
    XCTAssertNotNil(_nn5)
  }

  func testInterrupt401EntersSessionExpired() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
      api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
      api.interruptError = RemoteClientError(
        message: "expired", status: 401, code: "unauthorized")
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadSnapshot != nil || session.threadLoadState == .loaded
    }
    await session.interruptOpenThread()
    XCTAssertEqual(session.phase, .sessionExpired)
  }

  func testReadOnlyScopesHideOperateAndBlockSend() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(scopes: ["session:read"]),
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
    XCTAssertTrue(session.canRead)
    XCTAssertFalse(session.canOperate)
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.openThreadId == "t1"
    }
    let ok = await session.sendMessage("nope")
    XCTAssertFalse(ok)
  }

  func testSendAndInterruptRequireOnlineForegroundSession() async throws {
    var remote: FakeRemoteAPI?
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
      api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
      remote = api
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadSnapshot != nil || session.threadLoadState == .loaded
    }
    guard let remote else { return XCTFail("missing API") }

    let offlineSend = await session.sendMessage("offline")
    XCTAssertFalse(offlineSend)
    await session.interruptOpenThread()
    XCTAssertEqual(remote.sendCalls, 0)
    XCTAssertEqual(remote.interruptCalls, 0)

    session.state.socketState = .online
    session.state.liveLifecycle.noteEnteredBackground(
      sessionExpired: false,
      resyncPending: false
    )
    let backgroundSend = await session.sendMessage("background")
    XCTAssertFalse(backgroundSend)
    await session.interruptOpenThread()
    XCTAssertEqual(remote.sendCalls, 0)
    XCTAssertEqual(remote.interruptCalls, 0)
  }

  func testOpeningAnotherThreadCancelsOwnedSendAndCannotReportStaleSuccess() async throws {
    let gate = AsyncGate()
    var remote: FakeRemoteAPI?
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(
        makeShell(seq: 1, threads: [makeThread(id: "t1"), makeThread(id: "t2")])
      )
      api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
      api.historyResults["t2"] = .success(makeHistory(threadId: "t2", seq: 1))
      api.sendGate = gate
      remote = api
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.state.socketState = .online
    session.openThread(id: "t1")
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
      session.threadSnapshot?.thread.id == "t1"
    }

    let send = Task { @MainActor in await session.sendMessage("first") }
    try await gate.waitUntilWaiting()
    XCTAssertTrue(session.isSending)
    session.openThread(id: "t2")

    let staleSend = await send.value
    XCTAssertFalse(staleSend)
    XCTAssertEqual(remote?.sendCalls, 1)
    XCTAssertEqual(session.openThreadId, "t2")
    XCTAssertFalse(session.isSending)
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

  func testOpenThreadRejectsTerminal() async throws {
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "t"
    ) { e, t in
      let api = FakeRemoteAPI(endpoint: e, accessToken: t)
      api.environmentResult = .success(makeEnvironment())
      api.snapshotResult = .success(
        makeShell(seq: 1, threads: [makeThread(id: "term", presentationMode: "terminal")])
      )
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }
    await session.bootstrap()
    session.openThread(id: "term")
    XCTAssertNil(session.openThreadId)
    XCTAssertNotNil(session.globalError)
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
    session.openThread(id: "t1")
    session.handleScenePhase(.background)
    // Cancellation paths must not flip to transport network error UI.
    XCTAssertNotEqual(session.state.projectsLoadState, .failed("Network request failed."))
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
