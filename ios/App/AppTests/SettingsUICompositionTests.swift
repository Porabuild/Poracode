import UIKit
import XCTest

@testable import App

@MainActor
final class SettingsUICompositionTests: XCTestCase {
  func testHomeShortcutPreferencesMatchPWADefaultsAndNormalizeStoredValues() {
    XCTAssertTrue(HomeShortcutPreferences.storageKey.hasSuffix(".v1"))
    XCTAssertEqual(HomeShortcutPreferences.default.hidden, [.githubActions])
    XCTAssertEqual(HomeShortcutPreferences.default.visible, [.pullRequests, .schedules])

    let decoded = HomeShortcutPreferences(
      storageValue:
        #"{"hidden":["pullRequests","future"],"order":["schedules","schedules","future"]}"#
    )
    XCTAssertEqual(decoded.hidden, [.pullRequests])
    XCTAssertEqual(decoded.order, [.schedules, .pullRequests, .githubActions])
    XCTAssertEqual(decoded.visible, [.schedules, .githubActions])
  }

  func testHomeShortcutPreferencesRoundTripMutationAndRecoverMalformedStorage() {
    var preferences = HomeShortcutPreferences.default
    preferences.setVisible(true, for: .githubActions)
    preferences.move(fromOffsets: IndexSet(integer: 2), toOffset: 0)

    XCTAssertEqual(preferences.order, [.schedules, .pullRequests, .githubActions])
    XCTAssertEqual(HomeShortcutPreferences(storageValue: preferences.encoded), preferences)
    XCTAssertEqual(HomeShortcutPreferences(storageValue: "not-json"), .default)
  }

  func testAIContentLanguageMatchesPWAResolutionAndPrefillsGenerationDrafts() {
    XCTAssertEqual(AIContentLanguagePreference.resolved("future-value"), .matchApp)
    XCTAssertEqual(
      AIContentLanguagePreference.matchApp.modelLanguageName(preferredLanguages: ["de-DE"]),
      "German"
    )
    XCTAssertEqual(
      AIContentLanguagePreference.simplifiedChinese.modelLanguageName(
        preferredLanguages: ["en-US"]
      ),
      "Simplified Chinese"
    )
    XCTAssertNil(
      AIContentLanguagePreference.matchApp.modelLanguageName(preferredLanguages: ["en-US"])
    )
    XCTAssertTrue(AIContentLanguagePreference.storageKey.hasSuffix(".v1"))

    let commit = AdvancedOperationDraft(
      procedure: .generateCommitMessage,
      initialLanguage: "German"
    )
    let unrelated = AdvancedOperationDraft(
      procedure: .readAbsoluteFile,
      initialLanguage: "German"
    )
    XCTAssertEqual(commit.value(.language), "German")
    XCTAssertEqual(unrelated.value(.language), "")
  }

  func testProfilePresentationMatchesPWAFormatting() {
    XCTAssertEqual(ProfilePresentation.initials("Svecherenko"), "SV")
    XCTAssertEqual(ProfilePresentation.initials("Ada Lovelace"), "AL")
    XCTAssertEqual(ProfilePresentation.compact(Int64(160_000)), "160K")
    XCTAssertEqual(ProfilePresentation.compact(Int64(97_500)), "97.5K")
    XCTAssertEqual(ProfilePresentation.duration(91_000), "1m 31s")
  }

  func testUsagePresentationAppliesPWAProviderOrderWithoutDroppingUnknownProviders() {
    let snapshots = [
      usageSnapshot("claude"),
      usageSnapshot("gemini"),
      usageSnapshot("codex"),
    ]

    XCTAssertEqual(
      SettingsUsagePresentation.ordered(
        snapshots,
        providerOrder: ["codex", "claude", "not-loaded"]
      ).map(\.providerId),
      ["codex", "claude", "gemini"]
    )
  }

  func testUsagePresentationUsesProductProviderNames() {
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("claude"), "Claude")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("codex"), "Codex")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("commandcode"), "Command Code")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("copilot"), "GitHub Copilot")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("factory"), "Droid")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("opencode"), "OpenCode")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("zai"), "z.ai")
    XCTAssertEqual(SettingsUsagePresentation.providerLabel("custom-provider"), "Custom Provider")
  }

  func testUsageMeterMatchesPWAThresholdsValuesAndProjection() throws {
    XCTAssertEqual(SettingsUsagePresentation.tone(for: 69.9), .normal)
    XCTAssertEqual(SettingsUsagePresentation.tone(for: 70), .warning)
    XCTAssertEqual(SettingsUsagePresentation.tone(for: 90), .danger)

    let now = Date(timeIntervalSince1970: 1_000_000)
    let reset = now.addingTimeInterval(2.5 * 3_600)
    let window = SettingsUsageWindow(
      id: "session-5h",
      label: "Session (5h)",
      usedPercent: 60,
      used: nil,
      limit: nil,
      unit: .percent,
      currency: nil,
      resetsAt: Int64(reset.timeIntervalSince1970 * 1_000)
    )
    let projection = try XCTUnwrap(SettingsUsagePresentation.projection(for: window, now: now))
    XCTAssertEqual(projection.projectedPercent, 120, accuracy: 0.001)
    XCTAssertFalse(projection.lastsToReset)
    XCTAssertEqual(SettingsUsagePresentation.resetCountdown(window.resetsAt, now: now), "2h 30m")
    XCTAssertEqual(SettingsUsagePresentation.windowValue(window), "60%")
  }

  func testNativeProviderIconCatalogCoversEveryUsageProvider() throws {
    let usageProviderIDs = [
      "antigravity", "claude", "codex", "commandcode", "copilot", "cursor", "factory",
      "gemini", "grok", "kimi", "opencode", "qwen", "zai",
    ]

    for providerID in usageProviderIDs {
      let assetName = try XCTUnwrap(ProviderIconPresentation.assetName(for: providerID))
      let image = try XCTUnwrap(UIImage(named: assetName), providerID)
      XCTAssertEqual(image.size, CGSize(width: 24, height: 24), providerID)
      XCTAssertEqual(image.renderingMode, .alwaysTemplate, providerID)
    }
    XCTAssertEqual(
      ProviderIconPresentation.assetName(for: "claude-profile:work"),
      "ProviderClaude"
    )
  }

  func testUsagePresentationHonorsSharedEstimatedCostPreferenceWithoutHidingTokens() {
    let snapshot = SettingsUsageSnapshot(
      providerId: "codex",
      status: .ok,
      windows: [],
      fetchedAt: 0,
      authenticatedAs: nil,
      plan: nil,
      error: nil,
      rateLimitedUntil: nil,
      cost: SettingsUsageCost(
        amount: 1.25,
        currency: "USD",
        period: .today,
        estimated: true
      ),
      credits: nil,
      tokens: SettingsUsageTokens(
        input: nil,
        output: nil,
        cacheRead: nil,
        cacheWrite: nil,
        total: 2_000,
        period: .today
      )
    )

    let visible = SettingsUsagePresentation.metaLine(snapshot, showsEstimatedCost: true)
    let hidden = SettingsUsagePresentation.metaLine(snapshot, showsEstimatedCost: false)
    XCTAssertTrue(visible?.contains("USD") == true)
    XCTAssertFalse(hidden?.contains("USD") == true)
    XCTAssertNotNil(hidden)
  }

  func testUsagePreferencePatchPreservesTheCompleteHostOwnedObject() throws {
    let usage = SettingsUsagePreferences(
      autoRefresh: true,
      refreshIntervalMinutes: 10,
      providerRefreshIntervals: ["codex": 15],
      showEstimatedCost: true,
      showInSidebar: false,
      sidebarHiddenProviders: ["claude"],
      disabledProviders: ["gemini"],
      providerOrder: ["codex", "claude"],
      collapsedProviders: ["claude"],
      selectedRingGroups: ["antigravity": "gemini"]
    )

    let object = try XCTUnwrap(usage.settingsJSON.objectValue)
    XCTAssertEqual(object["autoRefresh"], .bool(true))
    XCTAssertEqual(object["refreshIntervalMinutes"], .integer(10))
    XCTAssertEqual(object["providerOrder"], .array([.string("codex"), .string("claude")]))
    XCTAssertEqual(object["collapsedProviders"], .array([.string("claude")]))
    XCTAssertEqual(
      object["selectedRingGroups"],
      .object(["antigravity": .string("gemini")])
    )
  }

  func testEightRoutesRequireReadAndHostGateUsesVersionReadinessAndScope() {
    XCTAssertEqual(SettingsScreenRoute.allCases.count, 8)
    XCTAssertTrue(SettingsScreenRoute.allCases.allSatisfy { $0.requiredCapability == .sessionRead })

    XCTAssertEqual(selection(protocolVersion: 4).gate(.sessionRead), .protocolIncompatible)
    XCTAssertEqual(selection(isOnline: false).gate(.sessionRead), .offline)
    XCTAssertEqual(selection(isReady: false).gate(.sessionRead), .notReady)
    XCTAssertEqual(
      selection(capabilities: []).gate(.sessionRead), .capabilityMissing("session:read"))
    XCTAssertNil(selection().gate(.sessionRead))
    XCTAssertEqual(
      selection(capabilities: [.sessionRead]).gate(.sessionOperate),
      .capabilityMissing("session:operate")
    )
  }

  func testAmbiguousSettingsMutationAttemptsOnceThenRefreshesOnce() async {
    let gateway = SettingsUIFakeGateway(document: settingsDocument())
    let composition = SettingsComposition(gateway: gateway)
    composition.activate(selection())

    await composition.writeSettings(SettingsPatch(values: [.titleGenFast: .bool(true)]))

    let counts = await gateway.counts
    XCTAssertEqual(counts.writes, 1)
    XCTAssertEqual(counts.reads, 1)
    XCTAssertEqual(composition.mutationNotice, .ambiguousRefreshed)
    XCTAssertEqual(composition.document.state, .loaded)
  }

  func testInformationRoutesFetchOnlyTheirSelectedDataset() async throws {
    let gateway = try SettingsInformationFakeGateway()
    let composition = SettingsComposition(gateway: gateway)
    composition.activate(selection())

    await composition.refresh(route: .agents, query: SettingsProfileQuery())
    var counts = await gateway.counts
    XCTAssertEqual(counts.agents, 1)
    XCTAssertEqual(counts.usage, 0)
    XCTAssertEqual(counts.devices, 0)
    XCTAssertNotNil(composition.hostInformation.agentStatuses)
    XCTAssertNil(composition.hostInformation.providerUsage)
    XCTAssertNil(composition.hostInformation.profileDevices)

    await composition.refresh(route: .usage, query: SettingsProfileQuery())
    counts = await gateway.counts
    XCTAssertEqual(counts.agents, 1)
    XCTAssertEqual(counts.usage, 1)
    XCTAssertEqual(counts.devices, 0)

    await composition.refresh(route: .devices, query: SettingsProfileQuery())
    counts = await gateway.counts
    XCTAssertEqual(counts.agents, 1)
    XCTAssertEqual(counts.usage, 1)
    XCTAssertEqual(counts.devices, 1)
  }

  func testDraftOnlyPatchesSchemaBackedChangedFields() {
    let document = settingsDocument()
    var draft = SettingsDocumentDraft(document)
    draft.title.fast.toggle()

    let patch = draft.generationPatch(comparedTo: document)

    XCTAssertEqual(patch.values, [.titleGenFast: .bool(true)])
    XCTAssertNil(patch[.agentSettings])
    XCTAssertNil(patch[.providerOrder])
  }

  func testGitDraftPatchesOnlyHostOwnedAutomationValues() {
    let document = settingsDocument()
    var draft = SettingsDocumentDraft(document)
    draft.prAutomationDefault = .merge
    draft.prMergeMethod = .squash
    draft.worktreeBasePath = "/must-not-write-from-git-page"

    let patch = draft.gitPatch(comparedTo: document)

    XCTAssertEqual(
      patch.values,
      [
        .prAutomationDefault: .string("merge"),
        .prMergeMethod: .string("squash"),
      ]
    )
  }

  func testFailurePresentationDoesNotRenderAssociatedRemoteValues() {
    let secret = "Bearer host-token plaintext-secret"
    let values: [SettingsOperationFailure] = [
      .capabilityMissing(secret),
      .rejected(statusCode: 599, code: secret),
    ]

    for failure in values {
      let message = SettingsUIStrings.failure(failure)
      XCTAssertFalse(message.contains(secret))
      XCTAssertFalse(message.contains("599"))
    }
  }

  func testAgentPresentationProjectsOnlyProviderAgnosticSafeFields() throws {
    let status = try SettingsAgentStatus(
      payload: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object(["secret": .string("never-render")]),
      ])
    )

    let presentation = SettingsAgentPresentation(status, environment: "host")

    XCTAssertEqual(presentation.label, "Provider")
    XCTAssertEqual(presentation.kind, "provider")
    XCTAssertTrue(presentation.installed)
    XCTAssertEqual(presentation.authState, .authenticated)
    XCTAssertFalse(String(describing: presentation).contains("never-render"))
  }

  func testAgentModelProjectionKeepsLabeledModelsAndExcludesAutomaticChoice() throws {
    let status = try SettingsAgentStatus(
      payload: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "supportsOneShot": .bool(true),
          "efforts": .array([.string("medium"), .string("high")]),
          "fastModels": .array([.string("model-b")]),
          "models": .array([
            .object(["id": .string("auto"), "label": .string("Automatic")]),
            .object(["id": .string("model-a"), "label": .string("Model A")]),
            .object(["id": .string("model-b"), "label": .string("Model B")]),
          ]),
        ]),
      ])
    )

    XCTAssertEqual(
      status.models,
      [
        SettingsAgentModel(id: "model-a", label: "Model A"),
        SettingsAgentModel(id: "model-b", label: "Model B"),
      ]
    )
    XCTAssertTrue(status.supportsOneShot)
    XCTAssertEqual(status.efforts, ["medium", "high"])
    XCTAssertEqual(status.fastModels, ["model-b"])
  }

  func testReplayReducerProjectsInitialWindowsAndWSLDistroLists() throws {
    let host = selection().lease.connectionID
    var replay = HostReplayState()
    ReplayEventApplier.apply(
      .windowsAgentStatuses([
        try replayStatus(kind: "codex", label: "Codex", environment: .windows),
        try replayStatus(kind: "gemini", label: "Gemini", environment: .windows),
      ]),
      to: &replay
    )
    ReplayEventApplier.apply(
      .wslAgentStatuses([
        try replayStatus(kind: "codex", label: "Codex", environment: .wsl, distro: "Ubuntu"),
        try replayStatus(kind: "codex", label: "Codex", environment: .wsl, distro: "Debian"),
      ]),
      to: &replay
    )

    let policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )

    XCTAssertEqual(policy.windows.loadState, .populated)
    XCTAssertEqual(policy.windows.agents.map(\.label), ["Codex", "Gemini"])
    XCTAssertEqual(policy.wsl.loadState, .populated)
    XCTAssertEqual(policy.wsl.agents.compactMap(\.distro), ["Ubuntu", "Debian"])
  }

  func testIncrementalReplayPatchPreservesUnrelatedOSAndDistroRows() throws {
    let host = selection().lease.connectionID
    var replay = HostReplayState()
    ReplayEventApplier.apply(
      .windowsAgentStatuses([
        try replayStatus(kind: "codex", label: "Codex old", environment: .windows),
        try replayStatus(kind: "gemini", label: "Gemini", environment: .windows),
      ]),
      to: &replay
    )
    ReplayEventApplier.apply(
      .wslAgentStatuses([
        try replayStatus(kind: "codex", label: "Ubuntu old", environment: .wsl, distro: "Ubuntu"),
        try replayStatus(kind: "codex", label: "Debian", environment: .wsl, distro: "Debian"),
      ]),
      to: &replay
    )
    ReplayEventApplier.apply(
      .agentStatusUpdated(
        try replayStatus(
          kind: "codex", label: "Windows patched", installed: false, environment: .windows)
      ),
      to: &replay
    )
    ReplayEventApplier.apply(
      .agentStatusUpdated(
        try replayStatus(
          kind: "codex", label: "Ubuntu patched", environment: .wsl, distro: "Ubuntu")
      ),
      to: &replay
    )
    ReplayEventApplier.apply(
      .agentStatusUpdated(
        try replayStatus(kind: "ignored", label: "POSIX", environment: .posix)
      ),
      to: &replay
    )

    let policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )

    XCTAssertEqual(policy.windows.agents.map(\.label), ["Windows patched", "Gemini"])
    XCTAssertEqual(policy.windows.agents.first?.installed, false)
    XCTAssertEqual(policy.wsl.agents.map(\.label), ["Ubuntu patched", "Debian"])
    XCTAssertFalse(policy.windows.agents.contains { $0.kind == "ignored" })
    XCTAssertFalse(policy.wsl.agents.contains { $0.kind == "ignored" })

    ReplayEventApplier.apply(
      .windowsAgentStatuses([
        try replayStatus(kind: "codex", label: "Newest full scan", environment: .windows),
        try replayStatus(kind: "gemini", label: "Gemini", environment: .windows),
      ]),
      to: &replay
    )
    let replaced = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )
    XCTAssertEqual(replaced.windows.agents.map(\.label), ["Newest full scan", "Gemini"])
  }

  func testReplayPolicyDistinguishesNotLoadedFromLoadedEmpty() {
    let host = selection().lease.connectionID
    var replay = HostReplayState()
    var policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )
    XCTAssertEqual(policy.windows.loadState, .notLoaded)
    XCTAssertEqual(policy.wsl.loadState, .notLoaded)

    ReplayEventApplier.apply(.windowsAgentStatuses([]), to: &replay)
    policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )
    XCTAssertEqual(policy.windows.loadState, .loadedEmpty)
    XCTAssertEqual(policy.wsl.loadState, .notLoaded)

    ReplayEventApplier.apply(.wslAgentStatuses([]), to: &replay)
    policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )
    XCTAssertEqual(policy.wsl.loadState, .loadedEmpty)
  }

  func testHostSwitchAndStaleOldHostProjectionClearImmediately() throws {
    let alpha = selection().lease.connectionID
    let beta = ClientConnectionID(UUID(uuidString: "00000000-0000-4000-8000-000000000002")!)
    var oldHostReplay = HostReplayState()
    ReplayEventApplier.apply(
      .windowsAgentStatuses([
        try replayStatus(kind: "codex", label: "Alpha only", environment: .windows)
      ]),
      to: &oldHostReplay
    )

    let switched = SettingsReplayAgentController.presentation(
      requestedConnectionID: alpha,
      selectedConnectionID: beta,
      replay: oldHostReplay
    )

    XCTAssertEqual(switched, .notLoaded)
    XCTAssertFalse(String(describing: switched).contains("Alpha only"))

    let staleFallback = try JSONDecoder().decode(
      SettingsAgentStatuses.self,
      from: SettingsFixtures.data(SettingsFixtures.agentStatuses)
    )
    let selectedBeta = SettingsReplayAgentController.presentation(
      requestedConnectionID: beta,
      selectedConnectionID: beta,
      replay: HostReplayState(),
      fallbackConnectionID: alpha,
      fallback: staleFallback
    )
    XCTAssertEqual(selectedBeta, .notLoaded)
  }

  func testBackgroundPresentationKeepsCommittedCacheWithoutTakingOwnership() throws {
    let session = AppSession()
    let host = selection().lease.connectionID
    session.state.selectedConnectionId = host
    ReplayEventApplier.apply(
      .windowsAgentStatuses([
        try replayStatus(kind: "codex", label: "Cached", environment: .windows)
      ]),
      to: &session.state.replay
    )
    session.state.liveLifecycle.noteEnteredBackground(sessionExpired: false, resyncPending: false)
    let before = session.state.replay

    let policy = session.settingsAgentReplayPresentation(for: host)

    XCTAssertEqual(policy.windows.agents.map(\.label), ["Cached"])
    XCTAssertEqual(session.state.replay, before)
    XCTAssertTrue(session.state.liveLifecycle.isInBackground)
  }

  func testReplayPresentationRedactsRawSensitiveFields() throws {
    let host = selection().lease.connectionID
    let secret = "Bearer plaintext-secret"
    let status = try AgentStatusRecord(
      wire: .object([
        "kind": .string("codex"), "label": .string("Codex"), "installed": .bool(true),
        "authState": .string("authenticated"), "envKind": .string("windows"),
        "capabilities": .object(["token": .string(secret)]),
        "endpoint": .string("https://secret.example"),
        "command": .string("codex --token plaintext-secret"),
      ])
    )
    var replay = HostReplayState()
    ReplayEventApplier.apply(.windowsAgentStatuses([status]), to: &replay)

    let policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )
    let renderedPolicy = String(describing: policy)

    XCTAssertEqual(policy.windows.agents.map(\.label), ["Codex"])
    XCTAssertFalse(renderedPolicy.contains(secret))
    XCTAssertFalse(renderedPolicy.contains("secret.example"))
    XCTAssertFalse(renderedPolicy.contains("--token"))
  }

  private func replayStatus(
    kind: String,
    label: String,
    installed: Bool = true,
    environment: AgentStatusRecord.EnvironmentKind,
    distro: String? = nil
  ) throws -> AgentStatusRecord {
    var wire: [String: JSONValue] = [
      "kind": .string(kind), "label": .string(label), "installed": .bool(installed),
      "authState": .string("authenticated"), "capabilities": .object([:]),
      "envKind": .string(environment.rawValue),
    ]
    if let distro { wire["envDistro"] = .string(distro) }
    return try AgentStatusRecord(wire: .object(wire))
  }

  private func selection(
    protocolVersion: Int = 3,
    isOnline: Bool = true,
    isReady: Bool = true,
    capabilities: Set<SettingsCapability> = [.sessionRead, .sessionOperate]
  ) -> SettingsHostSelection {
    SettingsHostSelection(
      name: "Fixture Host",
      access: SettingsSessionAccess(
        lease: SettingsHostLease(
          connectionID: ClientConnectionID(
            UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
          ),
          generation: 7
        ),
        protocolVersion: protocolVersion,
        isOnline: isOnline,
        isReady: isReady,
        capabilities: capabilities
      )
    )
  }
}

private actor SettingsUIFakeGateway: SettingsSessionGateway {
  private let document: SettingsDocument
  private(set) var reads = 0
  private(set) var writes = 0

  init(document: SettingsDocument) { self.document = document }

  var counts: (reads: Int, writes: Int) { (reads, writes) }

  func readSettings(lease: SettingsHostLease) -> SettingsReadResponse {
    reads += 1
    return SettingsReadResponse(settings: document)
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) throws -> SettingsReadResponse {
    writes += 1
    throw SettingsGatewayError.ambiguousOutcome
  }

  func agentStatuses(lease: SettingsHostLease) throws -> SettingsAgentStatuses {
    throw SettingsGatewayError.transport
  }
  func providerUsage(lease: SettingsHostLease) throws -> SettingsProviderUsage {
    throw SettingsGatewayError.transport
  }
  func profileDevices(lease: SettingsHostLease) throws -> SettingsProfileDevices {
    throw SettingsGatewayError.transport
  }
  func profileCoreStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(
    _ identity: SettingsProfileIdentity,
    lease: SettingsHostLease
  ) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}

private actor SettingsInformationFakeGateway: SettingsSessionGateway {
  private let statuses: SettingsAgentStatuses
  private let usageValue: SettingsProviderUsage
  private let devicesValue: SettingsProfileDevices
  private var agentsCalls = 0
  private var usageCalls = 0
  private var deviceCalls = 0

  init() throws {
    statuses = try JSONDecoder().decode(
      SettingsAgentStatuses.self,
      from: SettingsFixtures.data(SettingsFixtures.agentStatuses)
    )
    usageValue = try JSONDecoder().decode(
      SettingsProviderUsage.self,
      from: SettingsFixtures.data(SettingsFixtures.providerUsage)
    )
    devicesValue = try JSONDecoder().decode(
      SettingsProfileDevices.self,
      from: SettingsFixtures.data(SettingsFixtures.profileDevices)
    )
  }

  var counts: (agents: Int, usage: Int, devices: Int) {
    (agentsCalls, usageCalls, deviceCalls)
  }

  func agentStatuses(lease: SettingsHostLease) -> SettingsAgentStatuses {
    agentsCalls += 1
    return statuses
  }

  func providerUsage(lease: SettingsHostLease) -> SettingsProviderUsage {
    usageCalls += 1
    return usageValue
  }

  func profileDevices(lease: SettingsHostLease) -> SettingsProfileDevices {
    deviceCalls += 1
    return devicesValue
  }

  func profileCoreStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }

  func profileTokenStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }

  func setProfileIdentity(
    _ identity: SettingsProfileIdentity,
    lease: SettingsHostLease
  ) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }

  func readSettings(lease: SettingsHostLease) throws -> SettingsReadResponse {
    throw SettingsGatewayError.transport
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) throws -> SettingsReadResponse { throw SettingsGatewayError.transport }
}

private func settingsDocument() -> SettingsDocument {
  SettingsDocument(
    agentSettings: [:],
    hiddenModels: [:],
    disabledAgents: [],
    providerOrder: [],
    enabledMcpServers: [:],
    disabledBuiltInMcpServers: [:],
    titleGenProvider: "provider",
    titleGenModel: "model",
    titleGenEffort: "medium",
    titleGenFast: false,
    commitGenProvider: "provider",
    commitGenModel: "model",
    commitGenEffort: "medium",
    commitGenFast: false,
    conflictResolverProvider: "provider",
    conflictResolverModel: "model",
    conflictResolverEffort: "medium",
    conflictResolverFast: false,
    conflictResolverPresentationMode: .terminal,
    wslTitleGenProvider: "provider",
    wslTitleGenModel: "model",
    wslTitleGenEffort: "medium",
    wslTitleGenFast: false,
    wslCommitGenProvider: "provider",
    wslCommitGenModel: "model",
    wslCommitGenEffort: "medium",
    wslCommitGenFast: false,
    wslConflictResolverProvider: "provider",
    wslConflictResolverModel: "model",
    wslConflictResolverEffort: "medium",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: .terminal,
    worktreeStorageMode: .global,
    worktreeBasePath: "",
    wslWorktreeBasePath: "",
    prAutomationDefault: .off,
    prMergeMethod: .merge
  )
}

private func usageSnapshot(_ providerID: String) -> SettingsUsageSnapshot {
  SettingsUsageSnapshot(
    providerId: providerID,
    status: .ok,
    windows: [],
    fetchedAt: 0,
    authenticatedAs: nil,
    plan: nil,
    error: nil,
    rateLimitedUntil: nil,
    cost: nil,
    credits: nil,
    tokens: nil
  )
}
