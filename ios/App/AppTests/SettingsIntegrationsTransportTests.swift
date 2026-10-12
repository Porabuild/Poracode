import XCTest

@testable import App

final class SettingsIntegrationsTransportTests: XCTestCase {
  override func setUp() {
    super.setUp()
    SettingsIntegrationsURLProtocol.reset()
  }

  func testAllTwelveCallsUseExactProcedureEndpointAndBearer() async throws {
    for procedure in SettingsIntegrationsProcedure.allCases {
      SettingsIntegrationsURLProtocol.enqueue(try SettingsIntegrationsFixtures.envelope(procedure))
    }
    let client = settingsIntegrationsClient()
    let context = SettingsIntegrationsFixtures.wsl
    _ = try await client.settingsScanSkills(
      .init(
        projectLocation: context, wslDistro: "Ubuntu", agentKind: nil, presentationMode: "gui"
      ))
    _ = try await client.settingsListSkillMarketplace(
      .init(
        marketplace: .skillsSH, query: nil, sort: .rank
      ))
    try await client.settingsSetSkillEnabled(
      .init(
        absolutePath: "/skills/demo", enabled: true, projectLocation: context, wslDistro: "Ubuntu"
      ))
    try await client.settingsDeleteSkill(
      .init(
        absolutePath: "/skills/demo", projectLocation: context, wslDistro: "Ubuntu"
      ))
    _ = try await client.settingsImportSkills(
      .init(skills: [
        .init(
          sourcePath: "/source", sourceProjectLocation: context, sourceWslDistro: "Ubuntu",
          destinationScope: .global, availability: .poracode, mode: .copy, replace: false,
          projectLocation: nil, wslDistro: nil
        )
      ]))
    _ = try await client.settingsInstallMarketplaceSkill(
      .init(
        marketplace: .skillsSH, marketplaceSkillID: "owner/repo/demo",
        destinationScope: .global, availability: .poracode, replace: false,
        projectLocation: nil, wslDistro: nil
      ))
    _ = try await client.settingsDiscoverExternalMCPServers(.init(source: .workspace(context)))
    _ = try await client.settingsProbeMCPServer(
      .init(
        projectLocation: context, server: SettingsIntegrationsFixtures.server
      ))
    _ = try await client.settingsGetMCPOAuthStatus(.init(projectLocation: context))
    _ = try await client.settingsBeginMCPServerOAuth(
      .init(
        projectLocation: context, server: SettingsIntegrationsFixtures.server
      ))
    _ = try await client.settingsWaitMCPServerOAuth(
      .init(
        projectLocation: context, flowID: "flow-1"
      ))
    try await client.settingsClearMCPServerOAuth(
      .init(
        projectLocation: context, url: "https://mcp.example.test/rpc"
      ))

    let requests = SettingsIntegrationsURLProtocol.requests
    XCTAssertEqual(requests.count, 12)
    XCTAssertTrue(requests.allSatisfy { $0.httpMethod == "POST" })
    XCTAssertTrue(
      requests.allSatisfy { $0.url?.path(percentEncoded: true) == "/prefix/api/git/call" })
    XCTAssertTrue(
      requests.allSatisfy {
        $0.value(forHTTPHeaderField: "Authorization") == "Bearer host-token"
      })
    let names = try SettingsIntegrationsURLProtocol.bodies.map { body -> String in
      let data = try XCTUnwrap(body)
      let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
      return try XCTUnwrap(object["procedure"] as? String)
    }
    XCTAssertEqual(names, SettingsIntegrationsProcedure.allCases.map(\.rawValue))
  }

  func testMutationTransportFailureIsAmbiguousAndAttemptsOnce() async {
    let client = settingsIntegrationsClient()
    do {
      try await client.settingsDeleteSkill(
        .init(
          absolutePath: "/skills/demo", projectLocation: nil, wslDistro: nil
        ))
      XCTFail("Expected ambiguous outcome")
    } catch SettingsIntegrationsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(SettingsIntegrationsURLProtocol.requests.count, 1)
  }
}
