import UIKit
import XCTest

@testable import App

@MainActor
final class SettingsUICompositionTests: XCTestCase {
  func testDesktopSettingsIntegrationsAvoidNestedSplitNavigation() throws {
    let hostView = try String(contentsOfFile: "\(SettingsUICompositionTests.appRoot)/Features/Settings/UI/SettingsHostView.swift", encoding: .utf8)
    let searchView = try String(contentsOfFile: "\(SettingsUICompositionTests.appRoot)/Features/Settings/UI/SettingsSearch.swift", encoding: .utf8)
    XCTAssertTrue(hostView.contains("embeddedInNavigationStack: true"))
    XCTAssertTrue(hostView.contains("allowsRouteSelection: true"))
    XCTAssertTrue(searchView.contains("allowsRouteSelection: true"))
  }

  private static var appRoot: String {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App").path
  }

  func testSettingsSearchFindsFieldsWithContextAndKeepsDesktopResultsScoped() {
    let hits = NativeSettingsSearch.results("  GIT merge METHOD ", desktopOnly: false,
      hasDesktop: true, offersEnvironments: false)
    XCTAssertEqual(hits.first?.id, .init(destination: .device(.git), field: .gitMergeMethod))
    XCTAssertTrue(NativeSettingsSearch.results("merge method", desktopOnly: false,
      hasDesktop: false, offersEnvironments: false).isEmpty)
    XCTAssertTrue(NativeSettingsSearch.results("chat text size", desktopOnly: true,
      hasDesktop: true, offersEnvironments: false).isEmpty)
    let local = NativeSettingsSearch.results("chat text size", desktopOnly: false,
      hasDesktop: false, offersEnvironments: false)
    XCTAssertEqual(local.first?.id, .init(destination: .device(.appearance), field: .chatTextSize))
  }

  func testSettingsSearchHonorsEnvironmentAvailabilityAndIgnoresBlankQueries() {
    XCTAssertTrue(NativeSettingsSearch.results("  \n ", desktopOnly: false,
      hasDesktop: true, offersEnvironments: true).isEmpty)
    XCTAssertFalse(NativeSettingsSearch.results("Environments", desktopOnly: true,
      hasDesktop: true, offersEnvironments: false).contains { $0.id.destination == .environments })
    XCTAssertTrue(NativeSettingsSearch.results("Environments", desktopOnly: true,
      hasDesktop: true, offersEnvironments: true).contains { $0.id.destination == .environments })
  }

  func testHomeShortcutPreferencesMatchPWADefaultsAndNormalizeStoredValues() {
    XCTAssertTrue(HomeShortcutPreferences.storageKey.hasSuffix(".v1"))
    XCTAssertEqual(HomeShortcutPreferences.default.hidden.intersection(Set(HomeShortcutID.core)), [.githubActions])
    XCTAssertEqual(HomeShortcutPreferences.default.visible, [.pullRequests, .schedules])

    let decoded = HomeShortcutPreferences(
      storageValue:
        #"{"hidden":["pullRequests","future"],"order":["schedules","schedules","future"]}"#
    )
    XCTAssertEqual(decoded.hidden.intersection(Set(HomeShortcutID.core)), [.pullRequests])
    XCTAssertEqual(Array(decoded.order.prefix(3)), [.schedules, .pullRequests, .githubActions])
    XCTAssertEqual(decoded.visible, [.schedules, .githubActions])
  }

  func testHomeShortcutPreferencesRoundTripMutationAndRecoverMalformedStorage() {
    var preferences = HomeShortcutPreferences.default
    preferences.setVisible(true, for: .githubActions)
    preferences.move(fromOffsets: IndexSet(integer: 2), toOffset: 0)

    XCTAssertEqual(Array(preferences.order.prefix(3)), [.schedules, .pullRequests, .githubActions])
    XCTAssertEqual(HomeShortcutPreferences(storageValue: preferences.encoded), preferences)
    XCTAssertEqual(HomeShortcutPreferences(storageValue: "not-json"), .default)
  }

  func testStoredGitAndImportShortcutsRetainTheirDesktopDestinations() {
    let preferences = HomeShortcutPreferences(
      storageValue: #"{"hidden":[],"order":["settings:git","settings:import"]}"#
    )
    XCTAssertEqual(Array(preferences.visible.prefix(2)), [.settings(.git), .settings(.sessionImport)])
    XCTAssertTrue(DeviceSettingsDestination.git.requiresSelectedHost)
    XCTAssertTrue(DeviceSettingsDestination.sessionImport.requiresSelectedHost)
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

  func testSidebarUsageUsesHostVisibilityAndDeviceOrder() {
    let usage = SettingsProviderUsage(
      snapshots: [usageSnapshot("claude"), usageSnapshot("codex"), usageSnapshot("gemini"),
        usageSnapshot("cursor"), usageSnapshot("unavailable", status: .authMissing),
        usageSnapshot("unsupported", status: .unsupported)],
      fromCache: false
    )
    var preferences = SettingsUsagePreferences(
      autoRefresh: true, refreshIntervalMinutes: 10, providerRefreshIntervals: [:],
      showEstimatedCost: true, showInSidebar: true, sidebarHiddenProviders: ["claude"],
      disabledProviders: ["gemini"], providerOrder: ["codex", "cursor"],
      collapsedProviders: [], selectedRingGroups: [:]
    )
    XCTAssertEqual(SettingsUsagePresentation.sidebarSnapshots(
      usage, preferences: preferences, providerOrder: ["cursor", "codex"]
    ).map(\.providerId), ["cursor", "codex"])
    preferences.showInSidebar = false
    XCTAssertTrue(SettingsUsagePresentation.sidebarSnapshots(usage, preferences: preferences, providerOrder: []).isEmpty)
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

  func testDailyUsageProjectionUsesOneDayWindow() throws {
    let now = Date(timeIntervalSince1970: 1_000_000)
    let reset = now.addingTimeInterval(12 * 3_600)
    let window = SettingsUsageWindow(
      id: "daily", label: "Daily", usedPercent: 40, used: nil, limit: nil,
      unit: .percent, currency: nil, resetsAt: Int64(reset.timeIntervalSince1970 * 1_000)
    )
    let projection = try XCTUnwrap(SettingsUsagePresentation.projection(for: window, now: now))
    XCTAssertEqual(projection.projectedPercent, 80, accuracy: 0.001)
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

  func testUsagePresentationHonorsEstimatedCostPreferenceWithoutHidingTokens() {
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

  func testUsageDisplayMigratesLegacyFieldsOnceAndKeepsThemAcrossHosts() throws {
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

    XCTAssertNil(SettingsUsageDisplayPreferences.migrated(Data(), from: nil))
    let migrated = try XCTUnwrap(SettingsUsageDisplayPreferences.migrated(Data(), from: usage))
    let projected = SettingsUsageDisplayPreferences.resolved(migrated, legacy: nil)
    XCTAssertTrue(projected.showEstimatedCost)
    XCTAssertEqual(projected.order, ["codex", "claude"])
    XCTAssertTrue(projected.isCollapsed("claude"))

    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: migrated) as? [String: Any])
    XCTAssertEqual(Set(object.keys), ["estimatedCost", "providerOrder", "collapsedOverrides", "seededFromHost"])

    var otherHost = usage
    otherHost.showEstimatedCost = false
    otherHost.collapsedProviders = []
    XCTAssertNil(SettingsUsageDisplayPreferences.migrated(migrated, from: otherHost))
    XCTAssertEqual(SettingsUsageDisplayPreferences.resolved(migrated, legacy: otherHost), projected)
    XCTAssertEqual(SettingsUsageDisplayPreferences.resolved(Data([0xff]), legacy: otherHost), .init())

    // Device edits can arrive before the first host document. The seed fills
    // untouched fields and preserves even an explicit expansion.
    var earlyEdit = SettingsUsageDisplayPreferences()
    earlyEdit.showEstimatedCost = false
    earlyEdit.setCollapsed(false, providerID: "claude")
    earlyEdit.order = ["gemini"]
    var legacy = usage
    legacy.collapsedProviders = ["claude", "codex"]
    let pending = try JSONEncoder().encode(earlyEdit)
    XCTAssertNil(SettingsUsageDisplayPreferences.migrated(pending, from: nil))
    let seeded = try XCTUnwrap(SettingsUsageDisplayPreferences.migrated(pending, from: legacy))
    let updated = SettingsUsageDisplayPreferences.resolved(seeded, legacy: otherHost)
    XCTAssertFalse(updated.showEstimatedCost)
    XCTAssertEqual(updated.order, ["gemini", "codex", "claude"])
    XCTAssertFalse(updated.isCollapsed("claude"))
    XCTAssertTrue(updated.isCollapsed("codex"))
    XCTAssertNil(SettingsUsageDisplayPreferences.migrated(seeded, from: otherHost))
  }

  func testEightRoutesRequireReadAndHostGateUsesVersionReadinessAndScope() {
    XCTAssertEqual(SettingsScreenRoute.allCases.count, 9)
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
    let host = selection()
    composition.activate(host)

    let saved = await composition.writeSettings(
      SettingsPatch(values: [.titleGenFast: .bool(true)]), lease: host.lease
    )

    let counts = await gateway.counts
    XCTAssertFalse(saved)
    XCTAssertEqual(counts.writes, 1)
    XCTAssertEqual(counts.reads, 1)
    XCTAssertEqual(composition.mutationNotice, .ambiguousRefreshed)
    XCTAssertEqual(composition.document.state, .loaded)
  }

  func testSettingsSaveRejectsDraftFromAnEarlierLeaseOfTheSameDesktop() async {
    let gateway = SettingsUIFakeGateway(document: settingsDocument())
    let composition = SettingsComposition(gateway: gateway)
    let original = selection(generation: 6)
    let current = selection()
    composition.activate(original)
    composition.activate(current)
    await composition.refresh(route: .workspace, query: SettingsProfileQuery())

    let saved = await composition.writeSettings(
      SettingsPatch(values: [.prMergeMethod: .string("rebase")]), lease: original.lease
    )

    let counts = await gateway.counts
    XCTAssertFalse(saved)
    XCTAssertEqual(counts.writes, 0)
    XCTAssertEqual(composition.document.lease, current.lease)
    XCTAssertNil(composition.mutationNotice)
    XCTAssertNil(composition.mutationFailure)
  }

  func testSettingsRefreshReplacesPreviousSaveNoticeWithReadFailure() async {
    let gateway = SettingsUIFakeGateway(
      document: settingsDocument(), readError: .transport, writeError: nil
    )
    let composition = SettingsComposition(gateway: gateway)
    let host = selection()
    composition.activate(host)

    let saved = await composition.writeSettings(
      SettingsPatch(values: [.prMergeMethod: .string("rebase")]), lease: host.lease
    )
    XCTAssertTrue(saved)
    XCTAssertEqual(composition.mutationNotice, .saved)

    await composition.refresh(route: .workspace, query: SettingsProfileQuery())
    XCTAssertNil(composition.mutationNotice)
    XCTAssertEqual(composition.document.refreshFailure, .transport)
    XCTAssertNotNil(composition.document.document)
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

  func testMemorySettingsDraftPatchesOnlyOnChangeAndPreservesOlderHosts() throws {
    let legacy = settingsDocument()
    XCTAssertNil(legacy.memory)
    XCTAssertTrue(SettingsDocumentDraft(legacy).memoryPatch(comparedTo: legacy).values.isEmpty)

    var withMemory = legacy
    withMemory.memory = SettingsMemoryPreferences(
      enabled: false,
      learning: true,
      syncEnabled: true,
      captureTiming: .settle2m,
      captureCustomMinutes: 10,
      deletePolicy: .spool,
      dreamCadence: .daily,
      suggestSkills: true,
      skillThreshold: 3,
      sessionTokenBudget: 2000,
      archiveUnusedDays: 60,
      suppressNative: false,
      captureProvider: "auto",
      captureModel: "",
      captureEffort: "",
      captureFast: false,
      dreamProvider: "auto",
      dreamModel: "",
      dreamEffort: "",
      dreamFast: false
    )
    var draft = SettingsDocumentDraft(withMemory)
    XCTAssertTrue(draft.memoryPatch(comparedTo: withMemory).values.isEmpty)

    draft.memory?.enabled = true
    draft.memory?.dreamCadence = .weekly
    let patch = draft.memoryPatch(comparedTo: withMemory)
    XCTAssertEqual(Set(patch.values.keys), [.memory])
    XCTAssertEqual(patch[.memory]?.objectValue?["enabled"]?.boolValue, true)
    XCTAssertEqual(patch[.memory]?.objectValue?["dreamCadence"]?.stringValue, "weekly")
    XCTAssertEqual(patch[.memory]?.objectValue?["sessionTokenBudget"], .integer(2000))
  }

  func testProfileFiltersKeepDesktopIdentifiersSeparate() {
    let first = ClientConnectionID(), second = ClientConnectionID()
    var state = SettingsProfileQuerySelection()
    XCTAssertEqual(state[first].scope, .all)
    state[first] = SettingsProfileQuery(
      scope: .device, deviceID: "device-a", provider: "account-a", window: .sevenDays
    )
    let other = state[second].request()
    XCTAssertEqual(other.scope, .device)
    XCTAssertEqual(other.window, .sevenDays)
    XCTAssertNil(other.deviceId)
    XCTAssertNil(other.provider)
    state[second] = SettingsProfileQuery(deviceID: "device-b", provider: "account-b", window: .thirtyDays)
    XCTAssertEqual(state[first].deviceID, "device-a")
    XCTAssertEqual(state[first].provider, "account-a")
    XCTAssertEqual(state[first].window, .thirtyDays)
  }

  func testProfileSaveRejectsAnotherDesktopAndPublishesOnlyTheAcknowledgedIdentity() async throws {
    let gateway = try SettingsInformationFakeGateway()
    let composition = SettingsComposition(gateway: gateway)
    let original = selection(), current = selection(connectionID: ClientConnectionID())
    let query = SettingsProfileQuery()
    let edit = SettingsProfileIdentityDraft(.init(name: "Updated", handle: "updated", avatarColor: "#123456"))
    composition.activate(original)
    await composition.refresh(route: .profile, query: query)
    XCTAssertEqual(composition.profile.information?.request, query.request())
    composition.activate(current)
    XCTAssertNil(composition.profile.information)
    let stale = await composition.setIdentity(edit, lease: original.lease, query: query)
    XCTAssertFalse(stale)
    let noWrites = await gateway.identityWrites
    XCTAssertTrue(noWrites.isEmpty)

    await composition.refresh(route: .profile, query: query)
    let saved = await composition.setIdentity(edit, lease: current.lease, query: query)
    XCTAssertTrue(saved)
    XCTAssertEqual(composition.profile.identity?.identity, edit.value)
    let accepted = await gateway.identityWrites
    XCTAssertEqual(accepted, [current.lease])

    await composition.refresh(route: .profile, query: query)
    XCTAssertNil(composition.profile.identity)
    XCTAssertEqual(composition.profile.information?.core.identity.name, "Ada")
  }

  func testDraftOnlyPatchesSchemaBackedChangedFields() {
    let document = settingsDocument()
    var draft = SettingsDocumentDraft(document)
    draft.title.chooseFast(!draft.title.fast)

    let patch = draft.generationPatch(comparedTo: document)

    XCTAssertEqual(patch.values, [.titleGenFast: .bool(true)])
    XCTAssertNil(patch[.agentSettings])
    XCTAssertNil(patch[.providerOrder])
  }

  func testCanonicalGenerationSelectionBeatsLegacyMirrorsAndRoundTripsSelectiveEdit() throws {
    var document = settingsDocument()
    let owner = ModelSelectionOwner(agentKind: document.titleGenProvider, presentationMode: .terminal)
    let binding = try XCTUnwrap(ModelSelectionBinding(
      owner: owner, model: "bound-model", inertValues: [.effort: .string(""), .thinking: .bool(false)]
    ))
    document.titleGenSelection = ThreadConfig(
      model: "bound-model", effort: "", contextSize: "wide", thinking: false,
      selectionBinding: binding
    )
    document.commitGenSelection = ThreadConfig(model: "other-model", fast: false)
    var draft = SettingsDocumentDraft(document)
    XCTAssertEqual(draft.title.model, "bound-model")
    XCTAssertEqual(draft.title.effort, "")
    XCTAssertNil(draft.title.configuration.fast)
    XCTAssertTrue(draft.generationPatch(comparedTo: document).values.isEmpty)

    draft.title.chooseEffort("low")
    let patch = draft.generationPatch(comparedTo: document)
    XCTAssertEqual(patch[.titleGenModel], .string("bound-model"))
    XCTAssertEqual(patch[.titleGenEffort], .string("low"))
    XCTAssertNil(patch[.commitGenSelection])
    let accepted = try SettingsRemoteV3Contract.settingsWriteRequest(JSONEncoder().encode(patch))
    let wire = try JSONDecoder().decode(SettingsPatch.self, from: accepted)
    let selection = try XCTUnwrap(wire[.titleGenSelection])
    let outgoing = try JSONDecoder().decode(ThreadConfig.self, from: JSONEncoder().encode(selection))
    XCTAssertEqual(outgoing.model, "bound-model")
    XCTAssertEqual(outgoing.effort, "low")
    XCTAssertNil(outgoing.fast)
    XCTAssertEqual(outgoing.contextSize, "wide")
    XCTAssertEqual(outgoing.thinking, false)
    XCTAssertEqual(outgoing.selectionBinding?.inertValues, [.thinking: .bool(false)])
  }

  func testRetargetDropsWSLConflictBindingAndRetainsItsAdvancedFields() throws {
    var document = settingsDocument()
    let owner = ModelSelectionOwner(
      agentKind: document.wslConflictResolverProvider, presentationMode: .terminal
    )
    let binding = try XCTUnwrap(ModelSelectionBinding(
      owner: owner, model: "member", inertValues: [.fast: .bool(false)]
    ))
    document.wslConflictResolverSelection = ThreadConfig(
      model: "member", contextSize: "", fast: false, selectionBinding: binding
    )
    var draft = SettingsDocumentDraft(document)
    draft.wslConflict.choosePresentation(.gui)
    let patch = draft.generationPatch(comparedTo: document)
    XCTAssertEqual(patch[.wslConflictResolverPresentationMode], .string("gui"))
    let selection = try XCTUnwrap(patch[.wslConflictResolverSelection]?.objectValue)
    XCTAssertEqual(selection["contextSize"], .string(""))
    XCTAssertEqual(selection["fast"], .bool(false))
    XCTAssertNil(selection["effort"])
    XCTAssertNil(selection["selectionBinding"])
    XCTAssertNil(patch[.conflictResolverSelection])
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

  func testWorktreeDraftDoesNotWriteGitAutomationOrModelPreferences() {
    let document = settingsDocument()
    var draft = SettingsDocumentDraft(document)
    draft.worktreeBasePath = "/workspace/checkouts"
    draft.wslWorktreeBasePath = "/home/user/checkouts"
    draft.prAutomationDefault = .merge
    draft.prMergeMethod = .squash
    draft.title.chooseProvider("auto", agent: nil)

    XCTAssertEqual(draft.workspacePatch(comparedTo: document).values, [
      .worktreeBasePath: .string("/workspace/checkouts"),
      .wslWorktreeBasePath: .string("/home/user/checkouts"),
    ])
  }

  func testWorktreeDraftPreservesEditedPathsAndRebasesUntouchedFields() {
    let original = settingsDocument(worktreeBasePath: "/original", wslWorktreeBasePath: "/wsl-original")
    let refreshed = settingsDocument(worktreeBasePath: "/desktop-edit", wslWorktreeBasePath: "/wsl-desktop-edit")
    var draft = SettingsDocumentDraft(original)
    draft.worktreeBasePath = "/phone-edit"

    draft.rebaseWorkspace(from: original, to: refreshed)

    XCTAssertEqual(draft.wslWorktreeBasePath, "/wsl-desktop-edit")
    XCTAssertEqual(draft.workspacePatch(comparedTo: refreshed).values, [
      .worktreeBasePath: .string("/phone-edit"),
    ])

    draft.wslWorktreeBasePath = "/wsl-phone-edit"
    XCTAssertEqual(draft.workspacePatch(comparedTo: refreshed, includesWSL: false).values, [
      .worktreeBasePath: .string("/phone-edit"),
    ])

    let projectRelative = settingsDocument(
      worktreeStorageMode: .projectRelative, worktreeBasePath: "/desktop-edit",
      wslWorktreeBasePath: "/wsl-desktop-edit"
    )
    draft.rebaseWorkspace(from: refreshed, to: projectRelative)

    XCTAssertEqual(draft.worktreeStorageMode, .projectRelative)
    XCTAssertTrue(draft.workspacePatch(comparedTo: projectRelative).values.isEmpty)

    draft.worktreeStorageMode = .global
    XCTAssertEqual(draft.workspacePatch(comparedTo: projectRelative).values, [
      .worktreeStorageMode: .string(SettingsWorktreeStorageMode.global.rawValue),
      .worktreeBasePath: .string("/phone-edit"),
      .wslWorktreeBasePath: .string("/wsl-phone-edit"),
    ])
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

  func testGenerationModelEditUsesTheScopedEffortLadderAndFastCapability() throws {
    let agent = try SettingsAgentStatus(payload: .object([
      "kind": .string("fixture"),
      "label": .string("Fixture"),
      "installed": .bool(true),
      "authState": .string("authenticated"),
      "capabilities": .object([
        "efforts": .array([.string("low"), .string("medium"), .string("high")]),
        "modelEfforts": .object([
          "quick": .array([.string("low"), .string("medium")]),
          "no-effort": .array([]),
        ]),
        "defaultEffort": .string("medium"),
        "fastModels": .array([.string("thorough")]),
      ]),
    ]))
    var draft = SettingsGenerationDraft(provider: "fixture", model: "quick", effort: "high", fast: true)
    XCTAssertEqual(draft.displayEffort(for: agent), "medium")
    XCTAssertEqual(draft.effort, "high")
    XCTAssertTrue(draft.fast)

    draft.chooseModel("thorough", for: agent)
    XCTAssertEqual(draft.effort, "high")
    XCTAssertTrue(draft.fast)
    draft.chooseModel("quick", for: agent)
    XCTAssertEqual(agent.efforts(forModel: draft.model), ["low", "medium"])
    XCTAssertEqual(draft.effort, "medium")
    XCTAssertFalse(draft.fast)
    draft.chooseModel("no-effort", for: agent)
    XCTAssertEqual(agent.efforts(forModel: draft.model), [])
    XCTAssertEqual(draft.effort, "")

    var gatedPayload = try XCTUnwrap(agent.payload.objectValue)
    var gatedCapabilities = try XCTUnwrap(gatedPayload["capabilities"]?.objectValue)
    gatedCapabilities["fastDisabledReason"] = .string("Fast is disabled for this account")
    gatedPayload["capabilities"] = .object(gatedCapabilities)
    let gatedAgent = try SettingsAgentStatus(payload: .object(gatedPayload))
    draft.chooseFast(true)
    draft.chooseModel("thorough", for: gatedAgent)
    XCTAssertFalse(draft.fast)
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
        try replayStatus(kind: "posix-agent", label: "POSIX", environment: .posix)
      ),
      to: &replay
    )
    ReplayEventApplier.apply(
      .agentStatusUpdated(try replayStatus(kind: "legacy", label: "Legacy native", environment: nil)),
      to: &replay
    )

    let policy = SettingsReplayAgentController.presentation(
      requestedConnectionID: host, selectedConnectionID: host, replay: replay
    )

    XCTAssertEqual(policy.windows.agents.map(\.label), ["Windows patched", "Gemini", "POSIX", "Legacy native"])
    XCTAssertEqual(policy.windows.agents.first?.installed, false)
    XCTAssertEqual(policy.wsl.agents.map(\.label), ["Ubuntu patched", "Debian"])
    XCTAssertFalse(policy.wsl.agents.contains { $0.kind == "posix-agent" })
    XCTAssertFalse(policy.wsl.agents.contains { $0.kind == "legacy" })

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
    environment: AgentStatusRecord.EnvironmentKind?,
    distro: String? = nil
  ) throws -> AgentStatusRecord {
    var wire: [String: JSONValue] = [
      "kind": .string(kind), "label": .string(label), "installed": .bool(installed),
      "authState": .string("authenticated"), "capabilities": .object([:]),
    ]
    if let environment { wire["envKind"] = .string(environment.rawValue) }
    if let distro { wire["envDistro"] = .string(distro) }
    return try AgentStatusRecord(wire: .object(wire))
  }

  private func selection(
    protocolVersion: Int = ProtocolConstants.remoteProtocolVersion,
    isOnline: Bool = true,
    isReady: Bool = true,
    capabilities: Set<SettingsCapability> = [.sessionRead, .sessionOperate],
    connectionID: ClientConnectionID = ClientConnectionID(
      UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    ),
    generation: UInt64 = 7
  ) -> SettingsHostSelection {
    SettingsHostSelection(
      name: "Fixture Host",
      access: SettingsSessionAccess(
        lease: SettingsHostLease(
          connectionID: connectionID,
          generation: generation
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
  private let readError: SettingsGatewayError?
  private let writeError: SettingsGatewayError?
  private(set) var reads = 0
  private(set) var writes = 0

  init(
    document: SettingsDocument,
    readError: SettingsGatewayError? = nil,
    writeError: SettingsGatewayError? = .ambiguousOutcome
  ) {
    self.document = document
    self.readError = readError
    self.writeError = writeError
  }

  var counts: (reads: Int, writes: Int) { (reads, writes) }

  func readSettings(lease: SettingsHostLease) throws -> SettingsReadResponse {
    reads += 1
    if let readError { throw readError }
    return SettingsReadResponse(settings: document)
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) throws -> SettingsReadResponse {
    writes += 1
    if let writeError { throw writeError }
    return SettingsReadResponse(settings: document)
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
  private let coreValue: SettingsProfileCoreStats
  private let tokensValue: SettingsProfileTokenStats
  private(set) var identityWrites: [SettingsHostLease] = []
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
    coreValue = try JSONDecoder().decode(
      SettingsProfileCoreStats.self,
      from: SettingsFixtures.data(SettingsFixtures.profileCore)
    )
    tokensValue = try JSONDecoder().decode(
      SettingsProfileTokenStats.self,
      from: SettingsFixtures.data(SettingsFixtures.profileTokens)
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
  ) -> SettingsProfileCoreStats { coreValue }

  func profileTokenStats(
    _ request: SettingsProfileStatsRequest,
    lease: SettingsHostLease
  ) -> SettingsProfileTokenStats { tokensValue }

  func setProfileIdentity(
    _ identity: SettingsProfileIdentity,
    lease: SettingsHostLease
  ) -> SettingsProfileIdentityResponse {
    identityWrites.append(lease)
    return SettingsProfileIdentityResponse(identity: identity, device: coreValue.device)
  }

  func readSettings(lease: SettingsHostLease) throws -> SettingsReadResponse {
    throw SettingsGatewayError.transport
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) throws -> SettingsReadResponse { throw SettingsGatewayError.transport }
}

private func settingsDocument(
  worktreeStorageMode: SettingsWorktreeStorageMode = .global,
  worktreeBasePath: String = "",
  wslWorktreeBasePath: String = ""
) -> SettingsDocument {
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
    worktreeStorageMode: worktreeStorageMode,
    worktreeBasePath: worktreeBasePath,
    wslWorktreeBasePath: wslWorktreeBasePath,
    prAutomationDefault: .off,
    prMergeMethod: .merge
  )
}

private func usageSnapshot(_ providerID: String, status: SettingsUsageStatus = .ok) -> SettingsUsageSnapshot {
  SettingsUsageSnapshot(
    providerId: providerID,
    status: status,
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
