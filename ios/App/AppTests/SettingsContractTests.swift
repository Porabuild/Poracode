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
}
