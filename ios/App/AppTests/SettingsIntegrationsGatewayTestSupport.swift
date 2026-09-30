import Foundation

@testable import App

actor SettingsIntegrationsGatewayFake: SettingsIntegrationsGateway {
  private(set) var calls: [SettingsIntegrationsProcedure: Int] = [:]
  private var failures: [SettingsIntegrationsProcedure: SettingsIntegrationsGatewayError] = [:]
  private var waitContinuation: CheckedContinuation<SettingsMCPOAuthWaitResult, any Error>?
  private var waitingFlowID: String?
  private var beginResult: SettingsMCPOAuthBeginResult = .authorized
  private var statusResult = SettingsMCPOAuthStatusResult(authenticatedURLs: [])
  private(set) var lastSetEnabledRequest: SettingsSetSkillEnabledRequest?
  private(set) var lastDiscoveryRequest: SettingsDiscoverMCPRequest?

  func setFailure(
    _ failure: SettingsIntegrationsGatewayError?, for procedure: SettingsIntegrationsProcedure
  ) {
    failures[procedure] = failure
  }

  func setBeginResult(_ result: SettingsMCPOAuthBeginResult) { beginResult = result }
  func setStatus(_ urls: [String]) {
    statusResult = .init(authenticatedURLs: urls)
  }
  func resumeWait(_ result: SettingsMCPOAuthWaitResult) {
    waitContinuation?.resume(returning: result)
    waitContinuation = nil
    waitingFlowID = nil
  }

  func count(_ procedure: SettingsIntegrationsProcedure) -> Int { calls[procedure, default: 0] }

  private func record(_ procedure: SettingsIntegrationsProcedure) throws {
    calls[procedure, default: 0] += 1
    if let failure = failures[procedure] { throw failure }
  }

  func scanSkills(
    _ request: SettingsSkillScanRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsSkillScanResult {
    try record(.scanSkills)
    return .init(
      skills: [], effectiveSkillIDs: [], invocation: nil, issues: [], canLinkToGlobal: false)
  }

  func listMarketplace(
    _ request: SettingsSkillMarketplaceRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsSkillMarketplaceResult {
    try record(.listSkillMarketplace)
    return .init(marketplace: request.marketplace, skills: [], total: 0)
  }

  func setSkillEnabled(
    _ request: SettingsSetSkillEnabledRequest, context: SettingsIntegrationsContext
  ) throws {
    try record(.setSkillEnabled)
    lastSetEnabledRequest = request
  }

  func deleteSkill(
    _ request: SettingsDeleteSkillRequest, context: SettingsIntegrationsContext
  ) throws { try record(.deleteSkill) }

  func importSkills(
    _ request: SettingsImportSkillsRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsImportSkillsResult {
    try record(.importSkills)
    return .init(imported: [])
  }

  func installMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsInstallMarketplaceSkillResult {
    try record(.installMarketplaceSkill)
    return .init(installed: "/skills/demo")
  }

  func discoverMCP(
    _ request: SettingsDiscoverMCPRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsDiscoverMCPResult {
    try record(.discoverExternalMcpServers)
    lastDiscoveryRequest = request
    return .init(groups: [])
  }

  func probeMCP(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsMCPProbeResult {
    try record(.probeMcpServer)
    return .init(
      status: "available",
      latencyMs: 1,
      environment: .init(runtime: "host", projectScoped: false),
      toolCount: 0,
      tools: nil,
      serverInfo: nil,
      error: nil
    )
  }

  func oauthStatus(
    _ request: SettingsMCPOAuthOwnerRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsMCPOAuthStatusResult {
    try record(.getMcpOauthStatus)
    return statusResult
  }

  func beginOAuth(
    _ request: SettingsMCPServerRequest, context: SettingsIntegrationsContext
  ) throws -> SettingsMCPOAuthBeginResult {
    try record(.beginMcpServerOauth)
    return beginResult
  }

  func waitOAuth(
    _ request: SettingsMCPOAuthWaitRequest, context: SettingsIntegrationsContext
  ) async throws -> SettingsMCPOAuthWaitResult {
    try record(.waitMcpServerOauth)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        waitContinuation = continuation
        waitingFlowID = request.flowID
      }
    } onCancel: {
      Task { await self.cancelWait(flowID: request.flowID) }
    }
  }

  private func cancelWait(flowID: String) {
    guard waitingFlowID == flowID else { return }
    waitContinuation?.resume(throwing: CancellationError())
    waitContinuation = nil
    waitingFlowID = nil
  }

  func clearOAuth(
    _ request: SettingsMCPOAuthClearRequest, context: SettingsIntegrationsContext
  ) throws { try record(.clearMcpServerOauth) }
}

@MainActor
final class SettingsIntegrationsBrowserFake: SettingsIntegrationsBrowserOpening, @unchecked Sendable
{
  private(set) var openedCount = 0
  private(set) var openedURL: URL?
  var result = true

  func openAuthorizationURL(_ url: URL) async -> Bool {
    openedCount += 1
    openedURL = url
    return result
  }
}

actor SettingsIntegrationsAPIFake: SettingsIntegrationsRemoteAPI {
  private(set) var calls = 0
  var onCall: (@Sendable () async -> Void)?

  func setOnCall(_ callback: (@Sendable () async -> Void)?) { onCall = callback }

  func settingsScanSkills(_ request: SettingsSkillScanRequest) async -> SettingsSkillScanResult {
    await called()
    return .init(
      skills: [], effectiveSkillIDs: [], invocation: nil, issues: [], canLinkToGlobal: false)
  }
  func settingsListSkillMarketplace(
    _ request: SettingsSkillMarketplaceRequest
  ) async -> SettingsSkillMarketplaceResult {
    await called()
    return .init(marketplace: request.marketplace, skills: [], total: 0)
  }
  func settingsSetSkillEnabled(_ request: SettingsSetSkillEnabledRequest) async { await called() }
  func settingsDeleteSkill(_ request: SettingsDeleteSkillRequest) async { await called() }
  func settingsImportSkills(
    _ request: SettingsImportSkillsRequest
  ) async -> SettingsImportSkillsResult {
    await called()
    return .init(imported: [])
  }
  func settingsInstallMarketplaceSkill(
    _ request: SettingsInstallMarketplaceSkillRequest
  ) async -> SettingsInstallMarketplaceSkillResult {
    await called()
    return .init(installed: "/skills/demo")
  }
  func settingsDiscoverExternalMCPServers(
    _ request: SettingsDiscoverMCPRequest
  ) async -> SettingsDiscoverMCPResult {
    await called()
    return .init(groups: [])
  }
  func settingsProbeMCPServer(
    _ request: SettingsMCPServerRequest
  ) async -> SettingsMCPProbeResult {
    await called()
    return .init(
      status: "available", latencyMs: 1,
      environment: .init(runtime: "host", projectScoped: false), toolCount: 0,
      tools: nil, serverInfo: nil, error: nil
    )
  }
  func settingsGetMCPOAuthStatus(
    _ request: SettingsMCPOAuthOwnerRequest
  ) async -> SettingsMCPOAuthStatusResult {
    await called()
    return .init(authenticatedURLs: [])
  }
  func settingsBeginMCPServerOAuth(
    _ request: SettingsMCPServerRequest
  ) async -> SettingsMCPOAuthBeginResult {
    await called()
    return .authorized
  }
  func settingsWaitMCPServerOAuth(
    _ request: SettingsMCPOAuthWaitRequest
  ) async -> SettingsMCPOAuthWaitResult {
    await called()
    return .authorized
  }
  func settingsClearMCPServerOAuth(_ request: SettingsMCPOAuthClearRequest) async { await called() }

  private func called() async {
    calls += 1
    if let onCall { await onCall() }
  }
}
