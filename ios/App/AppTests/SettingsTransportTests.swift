import XCTest

@testable import App

final class SettingsTransportTests: XCTestCase {
  override func setUp() {
    super.setUp()
    SettingsURLProtocol.reset()
    SettingsBlockingURLProtocol.reset()
  }

  func testAllEightRoutesUseProducerMetadataBearerAndExactMethods() async throws {
    try SettingsURLProtocol.enqueue(SettingsFixtures.agentStatuses)
    try SettingsURLProtocol.enqueue(SettingsFixtures.providerUsage)
    try SettingsURLProtocol.enqueue(SettingsFixtures.profileDevices)
    try SettingsURLProtocol.enqueue(SettingsFixtures.profileCore)
    try SettingsURLProtocol.enqueue(SettingsFixtures.profileTokens)
    try SettingsURLProtocol.enqueue(SettingsFixtures.profileIdentity)
    try SettingsURLProtocol.enqueue(SettingsFixtures.settingsResponse)
    try SettingsURLProtocol.enqueue(SettingsFixtures.settingsResponse)
    let client = makeSettingsClient()

    _ = try await client.settingsAgentStatuses()
    _ = try await client.settingsProviderUsage()
    _ = try await client.settingsProfileDevices()
    let request = SettingsProfileStatsRequest(
      utcOffsetMinutes: -420, scope: .device, provider: "codex", window: .sevenDays
    )
    _ = try await client.settingsProfileCoreStats(request)
    _ = try await client.settingsProfileTokenStats(request)
    _ = try await client.settingsSetProfileIdentity(
      SettingsProfileIdentity(name: "Ada", handle: "ada", avatarColor: "#123456")
    )
    let settings = try await client.settingsRead()
    _ = try await client.settingsWrite(
      SettingsPatch(values: [.titleGenFast: .bool(true)])
    )

    let requests = SettingsURLProtocol.requests
    XCTAssertEqual(requests.count, 8)
    XCTAssertEqual(
      requests.map { $0.url?.path(percentEncoded: true) },
      [
        "/prefix/api/agent-statuses", "/prefix/api/provider-usage",
        "/prefix/api/profile/devices", "/prefix/api/profile/core-stats",
        "/prefix/api/profile/token-stats", "/prefix/api/profile/identity",
        "/prefix/api/settings", "/prefix/api/settings",
      ]
    )
    XCTAssertEqual(
      requests.map(\.httpMethod),
      ["GET", "GET", "GET", "POST", "POST", "POST", "GET", "POST"]
    )
    XCTAssertTrue(
      requests.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == "Bearer host-token" }
    )
    for index in [0, 1, 2, 6] {
      XCTAssertNil(requests[index].httpBody)
      XCTAssertNil(requests[index].value(forHTTPHeaderField: "Content-Type"))
    }
    let stats = try requestObject(at: 3)
    XCTAssertEqual(stats["provider"] as? String, "codex")
    XCTAssertEqual(stats["window"] as? String, "7d")
    let patch = try requestObject(at: 7)
    XCTAssertEqual(patch["titleGenFast"] as? Bool, true)
    XCTAssertEqual(patch.count, 1)
    XCTAssertEqual(settings.settings.usage?.providerOrder, ["codex"])
  }

  func testLegacySettingsResponseWithoutUsageStillDecodes() throws {
    var settings = SettingsFixtures.settings
    settings.removeValue(forKey: "usage")
    let data = try SettingsFixtures.data(["settings": settings])

    let response = try JSONDecoding.decode(SettingsReadResponse.self, from: data)

    XCTAssertNil(response.settings.usage)
  }

  func testSettingsMutationNeverRetriesAndSignalsAmbiguousNetworkOutcome() async throws {
    let client = makeSettingsClient()
    do {
      _ = try await client.settingsWrite(
        SettingsPatch(values: [.titleGenFast: .bool(true)])
      )
      XCTFail("Expected ambiguous outcome")
    } catch SettingsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(SettingsURLProtocol.requestCount, 1)
  }

  func testMalformedSuccessfulMutationResponseIsAmbiguousAndStillSingleAttempt() async throws {
    try SettingsURLProtocol.enqueue(["settings": ["titleGenFast": true]])
    let client = makeSettingsClient()
    do {
      _ = try await client.settingsWrite(SettingsPatch())
      XCTFail("Expected ambiguous outcome")
    } catch SettingsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(SettingsURLProtocol.requestCount, 1)
  }

  func testTaskCancellationPropagatesAsCancellationError() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [SettingsBlockingURLProtocol.self]
    let client = RemoteAPIClient(
      endpoint: "https://host.example", accessToken: "token",
      session: URLSession(configuration: configuration)
    )
    let task = Task { try await client.settingsRead() }
    while SettingsBlockingURLProtocol.requestCount == 0 { await Task.yield() }
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private func requestObject(at index: Int) throws -> [String: Any] {
    let body = try XCTUnwrap(SettingsURLProtocol.bodies[index])
    return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
  }
}

private final class SettingsBlockingURLProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var count = 0

  static func reset() { lock.withLock { count = 0 } }
  static var requestCount: Int { lock.withLock { count } }
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() { Self.lock.withLock { Self.count += 1 } }
  override func stopLoading() {}
}
