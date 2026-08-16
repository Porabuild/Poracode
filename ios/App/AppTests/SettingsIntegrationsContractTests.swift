import XCTest

@testable import App

final class SettingsIntegrationsContractTests: XCTestCase {
  func testAllTwelveProceduresMatchGeneratedMetadataExactly() {
    let values = SettingsIntegrationsRemoteV3Contract.procedures
    XCTAssertEqual(values.count, 12)
    XCTAssertEqual(Set(values.map(\.procedure)).count, 12)
    XCTAssertEqual(values.filter { $0.scope == .read }.count, 4)
    XCTAssertEqual(values.filter { $0.scope == .operate }.count, 8)
    XCTAssertEqual(values.filter { $0.owner == .optionalProjectLocation }.count, 10)
    XCTAssertEqual(values.filter { $0.owner == .none }.map(\.procedure), [.listSkillMarketplace])
    XCTAssertEqual(values.filter { $0.owner == .skillLocations }.map(\.procedure), [.importSkills])
    XCTAssertEqual(values.filter(\.isLongRunning).map(\.procedure), [.waitMcpServerOauth])
  }

  func testEveryRequestPassesProcedureAndRouteRootCodecs() throws {
    for procedure in SettingsIntegrationsProcedure.allCases {
      let data = try SettingsIntegrationsFixtures.request(procedure)
      let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
      XCTAssertEqual(object["procedure"] as? String, procedure.rawValue)
      XCTAssertNotNil(object["payload"])
    }
  }

  func testEveryResultPassesGeneratedResultCodec() throws {
    let scan: SettingsSkillScanResult = try result(.scanSkills)
    XCTAssertTrue(scan.skills.isEmpty)
    let marketplace: SettingsSkillMarketplaceResult = try result(.listSkillMarketplace)
    XCTAssertEqual(marketplace.marketplace, .skillsSH)
    let imported: SettingsImportSkillsResult = try result(.importSkills)
    XCTAssertTrue(imported.imported.isEmpty)
    let installed: SettingsInstallMarketplaceSkillResult = try result(.installMarketplaceSkill)
    XCTAssertEqual(installed.installed, "/skills/demo")
    let discovery: SettingsDiscoverMCPResult = try result(.discoverExternalMcpServers)
    XCTAssertTrue(discovery.groups.isEmpty)
    let probe: SettingsMCPProbeResult = try result(.probeMcpServer)
    XCTAssertEqual(probe.status, "available")
    let status: SettingsMCPOAuthStatusResult = try result(.getMcpOauthStatus)
    XCTAssertTrue(status.authenticatedURLs.isEmpty)
    let begin: SettingsMCPOAuthBeginResult = try result(.beginMcpServerOauth)
    XCTAssertEqual(begin, .authorized)
    let wait: SettingsMCPOAuthWaitResult = try result(.waitMcpServerOauth)
    XCTAssertEqual(wait, .authorized)
    for procedure in [
      SettingsIntegrationsProcedure.setSkillEnabled, .deleteSkill, .clearMcpServerOauth,
    ] {
      XCTAssertNoThrow(
        try SettingsIntegrationsRemoteV3Contract.omittedResult(
          procedure, response: SettingsIntegrationsFixtures.envelope(procedure)
        )
      )
    }
  }

  func testProjectLocationAndSkillLocationProjectionPreserveWSLPaths() throws {
    let request = SettingsImportSkillsRequest(skills: [
      .init(
        sourcePath: "/source",
        sourceProjectLocation: SettingsIntegrationsFixtures.wsl,
        sourceWslDistro: "Ubuntu",
        destinationScope: .project,
        availability: .shared,
        mode: .copy,
        replace: false,
        projectLocation: SettingsIntegrationsFixtures.posix,
        wslDistro: nil
      )
    ])
    let locations = SettingsIntegrationsRemoteV3Contract.projectedLocations(request)
    XCTAssertEqual(
      locations, [SettingsIntegrationsFixtures.wsl, SettingsIntegrationsFixtures.posix])
    let data = try SettingsIntegrationsRemoteV3Contract.request(.importSkills, payload: request)
    let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
    let skills = try XCTUnwrap(payload["skills"] as? [[String: Any]])
    let source = try XCTUnwrap(skills.first?["sourceProjectLocation"] as? [String: Any])
    XCTAssertEqual(source["linuxPath"] as? String, "/home/dev/project")
    XCTAssertEqual(
      source["uncPath"] as? String,
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\project"
    )
    XCTAssertEqual(source["distro"] as? String, "Ubuntu")
  }

  func testSecretBearingModelsRedactDescriptions() {
    XCTAssertFalse(String(describing: SettingsIntegrationsFixtures.server).contains("host-token"))
    XCTAssertFalse(
      String(describing: SettingsIntegrationsFixtures.server.transport).contains("host-token"))
    let redirect = SettingsMCPOAuthBeginResult.redirect(
      flowID: "flow", authorizationURL: "https://auth.test/?code=secret"
    )
    XCTAssertFalse(String(describing: redirect).contains("secret"))
  }

  private func result<Value: Decodable>(
    _ procedure: SettingsIntegrationsProcedure
  ) throws -> Value {
    try SettingsIntegrationsRemoteV3Contract.result(
      Value.self,
      procedure: procedure,
      response: SettingsIntegrationsFixtures.envelope(procedure)
    )
  }
}
