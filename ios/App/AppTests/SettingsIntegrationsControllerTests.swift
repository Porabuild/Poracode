import XCTest

@testable import App

@MainActor
final class SettingsIntegrationsControllerTests: XCTestCase {
  func testAmbiguousSkillMutationAttemptsOnceAndReconcilesWithOneScan() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setFailure(.ambiguousOutcome, for: .deleteSkill)
    let context = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let controller = SettingsIntegrationsSkillsController(gateway: gateway)
    controller.activate(settingsIntegrationsAccess(context))

    await controller.delete(skill(scope: .project))

    let deleteCount = await gateway.count(.deleteSkill)
    let scanCount = await gateway.count(.scanSkills)
    XCTAssertEqual(deleteCount, 1)
    XCTAssertEqual(scanCount, 1)
    XCTAssertEqual(controller.notice, .ambiguousReconciled)
    XCTAssertEqual(controller.scanState, .loaded)
  }

  func testMarketplaceInstallAttemptsOnceAndRefreshesAuthoritativeSkills() async {
    let gateway = SettingsIntegrationsGatewayFake()
    let context = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let controller = SettingsIntegrationsSkillsController(gateway: gateway)
    controller.activate(settingsIntegrationsAccess(context))
    let item = SettingsMarketplaceSkill(
      id: "owner/repo/demo",
      marketplace: .skillsSH,
      name: "demo",
      description: nil,
      source: "owner/repo",
      skillID: "demo",
      sourceURL: nil,
      sourceRef: nil,
      sourcePath: nil,
      installs: nil,
      weeklyInstalls: nil,
      stars: nil,
      votes: nil,
      securityGrade: nil,
      securityScore: nil,
      updatedAt: nil,
      official: false,
      rank: 1
    )

    await controller.install(item, destination: .project)

    let installCount = await gateway.count(.installMarketplaceSkill)
    let scanCount = await gateway.count(.scanSkills)
    XCTAssertEqual(installCount, 1)
    XCTAssertEqual(scanCount, 1)
    XCTAssertEqual(controller.notice, .saved)
  }

  func testProjectMutationIsRefusedWhenNoProjectIsSelected() async {
    let gateway = SettingsIntegrationsGatewayFake()
    let controller = SettingsIntegrationsSkillsController(gateway: gateway)
    controller.activate(settingsIntegrationsAccess(settingsIntegrationsContext()))
    let item = SettingsMarketplaceSkill(
      id: "demo", marketplace: .skillsSH, name: "demo", description: nil,
      source: "owner/repo", skillID: "demo", sourceURL: nil, sourceRef: nil,
      sourcePath: nil, installs: nil, weeklyInstalls: nil, stars: nil, votes: nil,
      securityGrade: nil, securityScore: nil, updatedAt: nil, official: false, rank: 1
    )

    await controller.install(item, destination: .project)

    let installCount = await gateway.count(.installMarketplaceSkill)
    XCTAssertEqual(installCount, 0)
    XCTAssertEqual(controller.mutationFailure, .unavailable)
  }

  func testBackgroundCancelsSkillsMCPAndOAuthWithoutReplayingBrowserLaunch() async {
    let gateway = SettingsIntegrationsCancellationGateway()
    let browser = SettingsIntegrationsBrowserFake()
    let composition = SettingsIntegrationsComposition(
      gateway: gateway,
      browser: browser,
      oauthWaitLimit: .seconds(60)
    )
    composition.activate(
      SettingsIntegrationsSelection(
        hostName: "Fixture",
        access: settingsIntegrationsAccess(settingsIntegrationsContext())
      )
    )

    let skills = Task { await composition.skills.loadSkills() }
    let mcp = Task { await composition.mcp.discover(.user) }
    let oauth = Task { await composition.oauth.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil {
      let scanStarted = await gateway.hasStarted(.scanSkills)
      let discoveryStarted = await gateway.hasStarted(.discoverExternalMcpServers)
      let waitStarted = await gateway.hasStarted(.waitMcpServerOauth)
      return scanStarted && discoveryStarted && waitStarted
    }

    composition.suspendForBackground()
    await skills.value
    await mcp.value
    await oauth.value
    await waitUntil { await gateway.cancelledCount == 3 }

    let startedProcedures = await gateway.startedProcedures
    XCTAssertEqual(
      Set(startedProcedures),
      [
        .scanSkills, .discoverExternalMcpServers, .beginMcpServerOauth, .waitMcpServerOauth,
      ])
    XCTAssertEqual(browser.openedCount, 1)
    XCTAssertEqual(composition.oauth.lifecycle, .paused)

    composition.deactivateTransientWork()
    XCTAssertNil(composition.selection)
    XCTAssertNil(composition.skills.access)
    XCTAssertNil(composition.mcp.access)
    XCTAssertNil(composition.oauth.access)
  }

  func testMCPSourceActionsMapOnlyToCurrentFullProjectLocation() {
    let posix = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    XCTAssertEqual(SettingsMCPView.Source.user.mcpSource(context: posix), .user)
    XCTAssertEqual(
      SettingsMCPView.Source.workspace.mcpSource(context: posix),
      .workspace(SettingsIntegrationsFixtures.posix)
    )
    XCTAssertNil(SettingsMCPView.Source.wsl.mcpSource(context: posix))

    let wsl = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.wsl)
    XCTAssertEqual(
      SettingsMCPView.Source.workspace.mcpSource(context: wsl),
      .workspace(SettingsIntegrationsFixtures.wsl)
    )
    XCTAssertEqual(
      SettingsMCPView.Source.wsl.mcpSource(context: wsl),
      .wslUser(distro: "Ubuntu")
    )
  }

  func testSkillToggleMapsProjectIdentityToExactLocationAndDistro() async {
    let gateway = SettingsIntegrationsGatewayFake()
    let context = settingsIntegrationsContext(
      projectID: "project",
      project: SettingsIntegrationsFixtures.wsl
    )
    let controller = SettingsIntegrationsSkillsController(gateway: gateway)
    controller.activate(settingsIntegrationsAccess(context))

    await controller.setEnabled(false, for: skill(scope: .project))

    let request = await gateway.lastSetEnabledRequest
    XCTAssertEqual(request?.enabled, false)
    XCTAssertEqual(request?.projectLocation, SettingsIntegrationsFixtures.wsl)
    XCTAssertEqual(request?.wslDistro, "Ubuntu")
    let callCount = await gateway.count(.setSkillEnabled)
    XCTAssertEqual(callCount, 1)
  }

  private func waitUntil(_ condition: @escaping @Sendable () async -> Bool) async {
    for _ in 0..<1_000 {
      if await condition() { return }
      await Task.yield()
    }
    XCTFail("Condition was not reached")
  }

  private func skill(scope: SettingsSkillScope) -> SettingsSkillEntry {
    .init(
      id: "skill-1", name: "demo", descriptionText: "Demo", folderName: "demo",
      absolutePath: "/skills/demo", skillFilePath: "/skills/demo/SKILL.md",
      rootPath: "/skills", providerID: "codex", providerLabel: "Codex",
      providerGroupID: nil, providerGroupLabel: nil, providerGroupOrder: nil,
      scope: scope, scopeLabel: "Project", availability: .poracode, origin: .managed,
      pluginID: nil, pluginName: nil, enabled: true, mutable: true, valid: true,
      portable: true, linked: false, importState: nil, sourcePath: nil,
      invalidReason: nil
    )
  }
}

private actor SettingsIntegrationsCancellationGateway: SettingsIntegrationsGateway {
  private(set) var startedProcedures: [SettingsIntegrationsProcedure] = []
  private(set) var cancelledProcedures: [SettingsIntegrationsProcedure] = []

  var startedCount: Int { startedProcedures.count }
  var cancelledCount: Int { cancelledProcedures.count }
  func hasStarted(_ procedure: SettingsIntegrationsProcedure) -> Bool {
    startedProcedures.contains(procedure)
  }

  func scanSkills(
    _ request: SettingsSkillScanRequest,
    context: SettingsIntegrationsContext
  ) async throws -> SettingsSkillScanResult {
    try await suspend(.scanSkills)
    return .init(
      skills: [], effectiveSkillIDs: [], invocation: nil, issues: [], canLinkToGlobal: false)
  }

  func discoverMCP(
    _ request: SettingsDiscoverMCPRequest,
    context: SettingsIntegrationsContext
  ) async throws -> SettingsDiscoverMCPResult {
    try await suspend(.discoverExternalMcpServers)
    return .init(groups: [])
  }

  func beginOAuth(
    _ request: SettingsMCPServerRequest,
    context: SettingsIntegrationsContext
  ) -> SettingsMCPOAuthBeginResult {
    startedProcedures.append(.beginMcpServerOauth)
    return .redirect(
      flowID: "flow",
      authorizationURL: "https://auth.example.test/authorize"
    )
  }

  func waitOAuth(
    _ request: SettingsMCPOAuthWaitRequest,
    context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthWaitResult {
    try await suspend(.waitMcpServerOauth)
    return .authorized
  }

  private func suspend(_ procedure: SettingsIntegrationsProcedure) async throws {
    startedProcedures.append(procedure)
    do {
      try await Task.sleep(for: .seconds(60))
    } catch is CancellationError {
      cancelledProcedures.append(procedure)
      throw CancellationError()
    }
  }

  func listMarketplace(
    _ request: SettingsSkillMarketplaceRequest,
    context: SettingsIntegrationsContext
  ) throws -> SettingsSkillMarketplaceResult { throw SettingsIntegrationsGatewayError.transport }
  func setSkillEnabled(
    _ request: SettingsSetSkillEnabledRequest,
    context: SettingsIntegrationsContext
  ) throws { throw SettingsIntegrationsGatewayError.transport }
  func deleteSkill(
    _ request: SettingsDeleteSkillRequest,
    context: SettingsIntegrationsContext
  ) throws { throw SettingsIntegrationsGatewayError.transport }
  func importSkills(
    _ request: SettingsImportSkillsRequest,
    context: SettingsIntegrationsContext
  ) throws -> SettingsImportSkillsResult { throw SettingsIntegrationsGatewayError.transport }
  func installMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest,
    context: SettingsIntegrationsContext
  ) throws -> SettingsInstallMarketplaceSkillResult {
    throw SettingsIntegrationsGatewayError.transport
  }
  func probeMCP(
    _ request: SettingsMCPServerRequest,
    context: SettingsIntegrationsContext
  ) throws -> SettingsMCPProbeResult { throw SettingsIntegrationsGatewayError.transport }
  func oauthStatus(
    _ request: SettingsMCPOAuthOwnerRequest,
    context: SettingsIntegrationsContext
  ) throws -> SettingsMCPOAuthStatusResult { throw SettingsIntegrationsGatewayError.transport }
  func clearOAuth(
    _ request: SettingsMCPOAuthClearRequest,
    context: SettingsIntegrationsContext
  ) throws { throw SettingsIntegrationsGatewayError.transport }
}
