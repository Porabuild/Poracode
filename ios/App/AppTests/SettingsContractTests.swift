import XCTest

@testable import App

final class SettingsContractTests: XCTestCase {
  func testRequestedRoutesAreProducerBackedWithExactMetadata() throws {
    let expected: [(String, String, String, String)] = [
      ("agent-statuses", "GET", "/api/agent-statuses", "session:read"),
      ("provider-usage", "GET", "/api/provider-usage", "session:read"),
      ("profile-devices", "GET", "/api/profile/devices", "session:read"),
      ("profile-core-stats", "POST", "/api/profile/core-stats", "session:read"),
      ("profile-token-stats", "POST", "/api/profile/token-stats", "session:read"),
      ("profile-identity", "POST", "/api/profile/identity", "session:operate"),
      ("settings-read", "GET", "/api/settings", "session:read"),
      ("settings-write", "POST", "/api/settings", "session:operate"),
      ("mcp-settings-read", "GET", "/api/settings/mcp-servers", "projects:manage"),
      ("mcp-settings-command", "POST", "/api/settings/mcp-servers/command", "projects:manage"),
      (
        "mcp-settings-operation", "POST", "/api/settings/mcp-servers/operation",
        "projects:manage"
      ),
    ]
    XCTAssertEqual(SettingsRemoteV3Contract.protocolVersion, RemoteContractMetadata.protocolVersion)
    XCTAssertEqual(SettingsRemoteV3Contract.routes.count, expected.count)
    for item in expected {
      let metadata = try XCTUnwrap(SettingsRemoteV3Contract.metadata(id: item.0))
      XCTAssertEqual(metadata.method, item.1)
      XCTAssertEqual(metadata.path, item.2)
      XCTAssertEqual(metadata.scope.rawValue, item.3)
      XCTAssertEqual(metadata.status, 200)
      XCTAssertNotNil(RemoteContractMetadata.routes.first { $0.id == item.0 })
    }
  }

  func testRootCodecStripsUnknownFieldsAndRejectsMalformedKnownFields() throws {
    var source = SettingsFixtures.agentStatuses
    source["future"] = "ignored"
    let canonical = try SettingsRemoteV3Contract.agentStatusesResponse(
      SettingsFixtures.data(source)
    )
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: canonical) as? [String: Any])
    XCTAssertNil(object["future"])

    source["windows"] = "not-an-array"
    XCTAssertThrowsError(
      try SettingsRemoteV3Contract.agentStatusesResponse(SettingsFixtures.data(source))
    )
  }

  func testSettingsPatchPreservesOmissionRejectsNullAndStripsCursorSecret() throws {
    let source: [String: Any] = [
      "titleGenFast": true,
      "agentSettings": [
        "cursor": ["structuredRuntime": "sdk", "sdkApiKey": "plaintext-secret"]
      ],
    ]
    let canonical = try SettingsRemoteV3Contract.settingsWriteRequest(
      SettingsFixtures.data(source)
    )
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: canonical) as? [String: Any])
    XCTAssertEqual(object["titleGenFast"] as? Bool, true)
    XCTAssertNil(object["commitGenFast"])
    let agents = try XCTUnwrap(object["agentSettings"] as? [String: Any])
    let cursor = try XCTUnwrap(agents["cursor"] as? [String: Any])
    XCTAssertNil(cursor["sdkApiKey"])
    XCTAssertFalse(String(data: canonical, encoding: .utf8)!.contains("plaintext-secret"))

    XCTAssertThrowsError(
      try SettingsRemoteV3Contract.settingsWriteRequest(
        SettingsFixtures.data(["titleGenFast": NSNull()])
      )
    )
  }

  func testSettingsReadRetainsSearchDefaultsAndAcceptsOlderHostOmission() throws {
    let canonical = try SettingsRemoteV3Contract.settingsReadResponse(
      SettingsFixtures.data(SettingsFixtures.settingsResponse)
    )
    let decoded = try JSONDecoding.decode(SettingsReadResponse.self, from: canonical)
    XCTAssertEqual(decoded.settings.searchUseIgnoreFiles, false)
    XCTAssertEqual(decoded.settings.searchExclude?["**/generated"], true)

    var olderSettings = SettingsFixtures.settings
    olderSettings.removeValue(forKey: "searchUseIgnoreFiles")
    olderSettings.removeValue(forKey: "searchExclude")
    let olderCanonical = try SettingsRemoteV3Contract.settingsReadResponse(
      SettingsFixtures.data(["settings": olderSettings])
    )
    let older = try JSONDecoding.decode(SettingsReadResponse.self, from: olderCanonical)
    XCTAssertNil(older.settings.searchUseIgnoreFiles)
    XCTAssertNil(older.settings.searchExclude)
  }

  func testProfileProviderFilterIsValidatedAndRetainedByProducerCodec() throws {
    let request: [String: Any] = [
      "utcOffsetMinutes": -420, "scope": "device", "provider": "claude:work",
      "window": "30d",
    ]
    let canonical = try SettingsRemoteV3Contract.profileCoreStatsRequest(
      SettingsFixtures.data(request)
    )
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: canonical) as? [String: Any])
    XCTAssertEqual(object["provider"] as? String, "claude:work")
    XCTAssertEqual(object["scope"] as? String, "device")
    XCTAssertThrowsError(
      try SettingsRemoteV3Contract.profileCoreStatsRequest(
        SettingsFixtures.data(["utcOffsetMinutes": 0, "scope": "future"])
      )
    )
  }

  func testMCPSettingsOperationUsesServerIdentityAndDecodesProbeResult() throws {
    let request = try SettingsRemoteV3Contract.mcpSettingsOperationRequest(
      SettingsFixtures.data([
        "kind": "probe",
        "scope": ["kind": "global"],
        "serverId": "server-1",
      ])
    )
    let requestObject = try XCTUnwrap(
      JSONSerialization.jsonObject(with: request) as? [String: Any])
    XCTAssertEqual(requestObject["serverId"] as? String, "server-1")
    XCTAssertNil(requestObject["server"])

    let response = try SettingsRemoteV3Contract.mcpSettingsOperationResponse(
      SettingsFixtures.data([
        "kind": "probe",
        "result": [
          "status": "available",
          "latencyMs": 12,
          "environment": ["runtime": "host", "projectScoped": false],
          "toolCount": 1,
          "tools": ["read"],
        ],
      ])
    )
    let decoded = try JSONDecoding.decode(GlobalMCPSettingsOperationResult.self, from: response)
    guard case .probe(let probe) = decoded else {
      return XCTFail("Expected probe operation result")
    }
    XCTAssertEqual(probe.status, "available")
    XCTAssertEqual(probe.tools, ["read"])
  }

  func testMCPSettingsReadRejectsUnredactedCredentials() throws {
    let server: [String: Any] = [
      "id": "server-1",
      "name": "Server",
      "description": "",
      "enabled": true,
      "timeoutMs": 30_000,
      "transport": [
        "type": "http",
        "url": "https://example.test/mcp?token=«redacted»",
        "headers": ["Authorization": "«redacted»"],
      ],
    ]
    XCTAssertNoThrow(
      try SettingsRemoteV3Contract.mcpSettingsReadResponse(
        SettingsFixtures.data(["servers": [server]]))
    )
    var unsafe = server
    unsafe["transport"] = [
      "type": "http",
      "url": "https://example.test/mcp?token=plaintext",
      "headers": ["Authorization": "Bearer plaintext"],
    ]
    XCTAssertThrowsError(
      try SettingsRemoteV3Contract.mcpSettingsReadResponse(
        SettingsFixtures.data(["servers": [unsafe]]))
    )
  }
}
