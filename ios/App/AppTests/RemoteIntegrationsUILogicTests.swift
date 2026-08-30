import XCTest

@testable import App

@MainActor
final class RemoteIntegrationsUILogicTests: XCTestCase {
  func testRoutesAndAccessGatesModelOfflineReadinessAndExactScopes() {
    XCTAssertEqual(RemoteIntegrationsRoute.allCases.count, 3)
    XCTAssertEqual(RemoteIntegrationsRoute.update.readCapability, .projectsManage)
    XCTAssertEqual(RemoteIntegrationsRoute.schedules.readCapability, .sessionRead)
    XCTAssertEqual(RemoteIntegrationsRoute.prWatches.readCapability, .sessionRead)

    let lease = remoteIntegrationsLease()
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, protocolVersion: 4).gate(.sessionRead),
      .protocolIncompatible
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, isOnline: false).gate(.sessionRead),
      .offline
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, isReady: false).gate(.sessionRead),
      .notReady
    )
    XCTAssertEqual(
      remoteIntegrationsAccess(lease, capabilities: []).gate(.sessionOperate),
      .capabilityMissing("session:operate")
    )
  }

  func testFailurePresentationNeverIncludesAssociatedRemoteValues() {
    let failures: [RemoteIntegrationsFailure] = [
      .capabilityMissing(RemoteIntegrationsFixtures.secret),
      .rejected(statusCode: 599, code: RemoteIntegrationsFixtures.secret),
    ]
    for failure in failures {
      let value = RemoteIntegrationsStrings.failure(failure)
      XCTAssertFalse(value.contains(RemoteIntegrationsFixtures.secret))
      XCTAssertFalse(value.contains("599"))
    }
  }

  func testUpdatePresentationClampsProgressAndDoesNotExposeHostMessage() {
    XCTAssertEqual(
      RemoteIntegrationsPresentation.progress(
        .downloading(.init(percent: 150, bytesPerSecond: 1, transferred: 1, total: 1))
      ),
      1
    )
    let message = RemoteIntegrationsPresentation.updateStatus(.failed)
    XCTAssertFalse(message.contains(RemoteIntegrationsFixtures.secret))
  }

  func testSchedulePresentationUsesOnlySafeSummaryFields() {
    let summary = RemoteIntegrationsPresentation.recurrence(
      .weekly(days: [1, 3], time: "09:30")
    )
    XCTAssertTrue(summary.contains("09:30"))
    XCTAssertFalse(summary.contains(RemoteIntegrationsFixtures.secret))
  }

  func testScheduleListFilterMatchesPWAStatusNameAndInstructionSearch() {
    let active = schedule(name: "Daily Brief", prompt: "Review recent work", enabled: true)
    let paused = schedule(name: "Weekly Review", prompt: "Summarize open risks", enabled: false)

    XCTAssertTrue(
      RemoteIntegrationsScheduleListFilter.matches(active, status: .all, query: "daily")
    )
    XCTAssertTrue(
      RemoteIntegrationsScheduleListFilter.matches(paused, status: .all, query: "RISKS")
    )
    XCTAssertFalse(
      RemoteIntegrationsScheduleListFilter.matches(paused, status: .active, query: "")
    )
    XCTAssertTrue(
      RemoteIntegrationsScheduleListFilter.matches(paused, status: .paused, query: " weekly ")
    )
  }

  func testScheduleEditorUsesInstalledOneShotAgentModelsAndEfforts() throws {
    let agent = try scheduleAgent()
    var draft = RemoteIntegrationsScheduleDraft()

    RemoteIntegrationsScheduleAgentCatalog.selectDefault(in: &draft, agents: [agent])
    XCTAssertEqual(draft.agentKind, "codex")
    XCTAssertEqual(draft.model, "model-a")
    XCTAssertEqual(draft.effort, "high")
    XCTAssertEqual(
      RemoteIntegrationsScheduleAgentCatalog.modelOptions(
        [agent],
        agentKind: draft.agentKind,
        selectedModel: draft.model
      ).map(\.id),
      ["model-a", "model-b"]
    )

    draft.effort = "high"
    draft.fast = true
    RemoteIntegrationsScheduleAgentCatalog.selectModel(
      "model-b",
      in: &draft,
      agents: [agent]
    )
    XCTAssertEqual(draft.effort, "low")
    XCTAssertFalse(draft.fast)

    var watch = RemoteIntegrationsPRWatchDraft(projectId: "project")
    RemoteIntegrationsScheduleAgentCatalog.selectDefault(in: &watch, agents: [agent])
    XCTAssertEqual(watch.agentKind, "codex")
    XCTAssertEqual(watch.model, "model-a")
    XCTAssertEqual(watch.effort, "high")
    watch.effort = "high"
    watch.fast = true
    RemoteIntegrationsScheduleAgentCatalog.selectModel(
      "model-b",
      in: &watch,
      agents: [agent]
    )
    XCTAssertEqual(watch.effort, "low")
    XCTAssertFalse(watch.fast)
  }

  func testScheduleSuggestionsMatchPWAPresetsAndCreateRunnableInputs() throws {
    let configuration = try XCTUnwrap(
      RemoteIntegrationsScheduleAgentCatalog.defaultConfiguration(for: scheduleAgent())
    )
    let preset = RemoteIntegrationsSchedulePreset(
      id: "daily-brief",
      title: "Daily brief",
      prompt: "Review recent work",
      recurrence: .weekly(days: [1, 2, 3, 4, 5], time: "08:00")
    ).with(agentKind: "codex", configuration: configuration)

    XCTAssertEqual(preset.task?.agentKind, "codex")
    XCTAssertEqual(preset.task?.config, configuration)
    XCTAssertEqual(preset.task?.recurrence, .weekly(days: [1, 2, 3, 4, 5], time: "08:00"))
    XCTAssertEqual(preset.task?.enabled, true)
    XCTAssertNil(preset.task?.projectId)

    let source = try String(
      contentsOf: URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent(
          "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSchedulesView.swift"
        ),
      encoding: .utf8
    )
    XCTAssertTrue(source.contains("id: \"daily-brief\""))
    XCTAssertTrue(source.contains("id: \"weekly-review\""))
    XCTAssertTrue(source.contains("id: \"keep-on-track\""))
  }

  func testNewScheduleStringsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/RemoteIntegrations.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    for key in [
      "remoteIntegrations.schedule.search",
      "remoteIntegrations.schedule.createWithAgent",
      "remoteIntegrations.schedule.createWithAgent.prompt",
      "remoteIntegrations.schedule.suggestions",
      "remoteIntegrations.schedule.preset.dailyBrief",
      "remoteIntegrations.schedule.preset.dailyBrief.prompt",
      "remoteIntegrations.schedule.preset.weeklyReview",
      "remoteIntegrations.schedule.preset.weeklyReview.prompt",
      "remoteIntegrations.schedule.preset.keepOnTrack",
      "remoteIntegrations.schedule.preset.keepOnTrack.prompt",
      "remoteIntegrations.schedule.interrupted",
      "remoteIntegrations.schedule.noRuns",
      "remoteIntegrations.schedule.previousRuns",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)"
        )
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  func testCreateWithAgentUsesTheFullNativeComposerAndNavigatesToItsThread() throws {
    let source = try String(
      contentsOf: URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent(
          "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSessionComposition.swift"
        ),
      encoding: .utf8
    )

    XCTAssertTrue(source.contains("HomeQuickComposeView("))
    XCTAssertTrue(source.contains("RemoteIntegrationsStrings.createWithAgentPrompt"))
    XCTAssertTrue(source.contains("startedScheduleThreadID = threadID"))
    XCTAssertTrue(source.contains("RichChatThreadView("))
  }

  func testScheduleViewPollsOnlyWhileARunIsActive() throws {
    let source = try String(
      contentsOf: URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent(
          "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSchedulesView.swift"
        ),
      encoding: .utf8
    )

    XCTAssertTrue(source.contains(".task(id: pollingIdentity)"))
    XCTAssertTrue(source.contains("Task.sleep(for: .seconds(2))"))
    XCTAssertTrue(source.contains("guard pollingIdentity.shouldPoll"))

    XCTAssertTrue(
      RemoteIntegrationsSchedulePollingIdentity(
        lease: remoteIntegrationsLease(),
        isPresentationActive: true,
        hasRunningSchedule: true,
        isMutating: false
      ).shouldPoll
    )
    XCTAssertFalse(
      RemoteIntegrationsSchedulePollingIdentity(
        lease: remoteIntegrationsLease(),
        isPresentationActive: true,
        hasRunningSchedule: true,
        isMutating: true
      ).shouldPoll
    )
  }

  func testSchedulePrimaryActionUsesTheSharedTrailingCircleMenu() throws {
    let source = try String(
      contentsOf: URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent(
          "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSchedulesView.swift"
        ),
      encoding: .utf8
    )

    XCTAssertTrue(source.contains("PoracodeBottomActionDock(placement: .trailing)"))
    XCTAssertTrue(source.contains("PoracodeCircleMenu"))
    XCTAssertTrue(source.contains("native-e2e.schedules.create"))
    XCTAssertFalse(source.contains("ToolbarItem(placement: .topBarTrailing)"))
  }

  func testAppCompositionUsesExactSelectedHostGenerationScopesAndSnapshotProjects() {
    let session = AppSession(dependencies: .live)
    let connectionID = ClientConnectionID()
    let profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Profile Label",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate", "projects:manage:extra"],
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: 8
    )
    session.state.selectedConnectionId = connectionID
    session.state.hosts = [
      HostRecord(
        connectionId: connectionID,
        desktopId: profile.desktopId,
        label: "Registry Label",
        httpBaseURL: profile.httpBaseURL,
        wsBaseURL: profile.wsBaseURL,
        appVersion: profile.appVersion,
        scopes: ["session:read", "projects:manage"],
        pairedAt: profile.pairedAt,
        protocolVersion: 8
      )
    ]
    session.state.profile = profile
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "secret")
    )
    session.state.phase = .ready
    session.state.snapshot = RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        project(id: "second", name: "Zulu", disabled: false),
        project(id: "disabled", name: "Hidden", disabled: true),
        project(id: RemoteProject.homeScopeID, name: "Home", disabled: false),
        project(id: "first", name: "Alpha", disabled: false),
      ],
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
    _ = session.state.operationOwner.bumpWorkGeneration()

    let selection = session.currentRemoteIntegrationsHostSelection
    XCTAssertEqual(selection?.name, "Registry Label")
    XCTAssertEqual(selection?.lease.connectionID, connectionID)
    XCTAssertEqual(selection?.lease.generation, UInt64(session.state.workGeneration))
    XCTAssertEqual(selection?.access.protocolVersion, 8)
    XCTAssertEqual(selection?.access.capabilities, [.sessionRead])
    XCTAssertTrue(selection?.access.isOnline == true)
    XCTAssertTrue(selection?.access.isReady == true)
    XCTAssertEqual(session.currentRemoteIntegrationsProjects.map(\.id), ["first", "second"])

    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(session.currentRemoteIntegrationsHostSelection)
    XCTAssertTrue(session.currentRemoteIntegrationsProjects.isEmpty)
  }

  private func project(id: String, name: String, disabled: Bool) -> RemoteProject {
    RemoteProject(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      name: name,
      location: .posix(path: "/\(id)"),
      workspaceId: nil,
      disabled: disabled,
      createdAt: "2026-08-12T00:00:00Z"
    )
  }

  private func schedule(
    name: String,
    prompt: String,
    enabled: Bool
  ) -> RemoteIntegrationsScheduledTask {
    RemoteIntegrationsScheduledTask(
      id: UUID().uuidString.lowercased(),
      name: name,
      prompt: prompt,
      agentKind: "codex",
      config: RemoteIntegrationsAgentConfig(model: "model"),
      recurrence: .weekly(days: [1], time: "09:00"),
      enabled: enabled,
      projectId: nil,
      createdAt: "2026-08-22T00:00:00Z",
      updatedAt: "2026-08-22T00:00:00Z",
      nextRunAt: nil,
      lastRunAt: nil,
      lastCompletedAt: nil,
      lastStatus: .never
    )
  }

  private func scheduleAgent() throws -> AgentStatusRecord {
    try AgentStatusRecord(
      wire: .object([
        "kind": .string("codex"),
        "label": .string("Codex"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "presentationMode": .string("gui"),
          "supportsOneShot": .bool(true),
          "models": .array([
            .object(["id": .string("model-a"), "label": .string("Model A")]),
            .object(["id": .string("model-b"), "label": .string("Model B")]),
          ]),
          "efforts": .array([.string("low"), .string("high")]),
          "modelEfforts": .object([
            "model-a": .array([.string("low"), .string("high")]),
            "model-b": .array([.string("low")]),
          ]),
          "modelDefaultEfforts": .object([
            "model-a": .string("high"),
            "model-b": .string("low"),
          ]),
          "fastModels": .array([.string("model-a")]),
        ]),
      ])
    )
  }
}
