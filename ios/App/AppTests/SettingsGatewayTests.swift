import XCTest

@testable import App

@MainActor
final class SettingsGatewayTests: XCTestCase {
  func testReadAndMutationRequireTheirExactScopesBeforeTransport() async throws {
    let api = SettingsRemoteAPIFake()
    let lease = settingsLease()
    let selection = SettingsTransportSelection(
      access: makeSettingsAccess(lease, capabilities: []), api: api
    )
    let gateway = SelectedSettingsSessionGateway { _ in selection }

    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: "session:read")
    ) { _ = try await gateway.readSettings(lease: lease) }
    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: "session:operate")
    ) { _ = try await gateway.writeSettings(SettingsPatch(), lease: lease) }
    let calls = await api.calls
    XCTAssertEqual(calls, 0)
  }

  func testProtocolV3AndExactGenerationAreGuarded() async throws {
    let api = SettingsRemoteAPIFake()
    let current = settingsLease(generation: 2)
    let gateway = SelectedSettingsSessionGateway { _ in
      SettingsTransportSelection(
        access: makeSettingsAccess(current, capabilities: [.sessionRead]), api: api
      )
    }
    await assertCancellation { _ = try await gateway.readSettings(lease: settingsLease()) }

    let incompatible = SelectedSettingsSessionGateway { lease in
      SettingsTransportSelection(
        access: makeSettingsAccess(
          lease, protocolVersion: 4, capabilities: [.sessionRead]
        ), api: api
      )
    }
    await assertGatewayError(.protocolIncompatible) {
      _ = try await incompatible.readSettings(lease: settingsLease())
    }
    let calls = await api.calls
    XCTAssertEqual(calls, 0)
  }

  func testCancellationAndSanitizedErrorsDoNotExposeRemoteMessages() async throws {
    let lease = settingsLease()
    let cancelling = SettingsRemoteAPIFake(error: CancellationError())
    let cancellationGateway = gateway(
      api: cancelling, lease: lease, capabilities: [.sessionRead]
    )
    await assertCancellation { _ = try await cancellationGateway.readSettings(lease: lease) }

    let malicious = SettingsRemoteAPIFake(
      error: RemoteClientError(
        message: "Bearer host-token sdkApiKey plaintext-secret", status: 403,
        code: "BAD SECRET"
      )
    )
    let sanitized = gateway(api: malicious, lease: lease, capabilities: [.sessionRead])
    await assertGatewayError(.http(statusCode: 403, code: nil, missingScope: nil)) {
      _ = try await sanitized.readSettings(lease: lease)
    }
  }

  func testExactHostCredentialSourceRequestsOnlyCapturedConnectionID() async throws {
    let lease = settingsLease("1")
    let repository = SettingsCredentialRepositoryFake(
      credentials: SettingsHostCredentials(
        connectionID: lease.connectionID, endpoint: "https://a.example", token: "token-a",
        protocolVersion: 3, scopes: ["session:read"]
      )
    )
    let accessBox = SettingsAccessBox(makeSettingsAccess(lease, capabilities: [.sessionRead]))
    let api = SettingsRemoteAPIFake()
    let source = SettingsExactHostTransportSource(
      credentials: repository,
      accessProvider: { accessBox.value },
      makeAPI: { _, _ in api }
    )
    let selection = try await source.selection(for: lease)
    XCTAssertEqual(selection?.access.lease, lease)
    XCTAssertEqual(selection?.access.capabilities, [.sessionRead])
    let requested = await repository.requested
    XCTAssertEqual(requested, [lease.connectionID])
  }

  func testCredentialScopesCannotBeExpandedByObservableAccess() async throws {
    let lease = settingsLease("2")
    let repository = SettingsCredentialRepositoryFake(
      credentials: SettingsHostCredentials(
        connectionID: lease.connectionID, endpoint: "https://a.example", token: "token-a",
        protocolVersion: 3, scopes: ["session:read"]
      )
    )
    let accessBox = SettingsAccessBox(
      makeSettingsAccess(lease, capabilities: [.sessionRead, .sessionOperate])
    )
    let source = SettingsExactHostTransportSource(
      credentials: repository,
      accessProvider: { accessBox.value },
      makeAPI: { _, _ in SettingsRemoteAPIFake() }
    )
    let resolvedSelection = try await source.selection(for: lease)
    let selection = try XCTUnwrap(resolvedSelection)
    XCTAssertEqual(selection.access.capabilities, [.sessionRead])
  }

  private func gateway(
    api: any SettingsRemoteAPI,
    lease: SettingsHostLease,
    capabilities: Set<SettingsCapability>
  ) -> SelectedSettingsSessionGateway {
    let selection = SettingsTransportSelection(
      access: makeSettingsAccess(lease, capabilities: capabilities), api: api
    )
    return SelectedSettingsSessionGateway { _ in selection }
  }

  private func assertGatewayError(
    _ expected: SettingsGatewayError,
    operation: () async throws -> Void
  ) async {
    do { try await operation(); XCTFail("Expected gateway error") }
    catch let error as SettingsGatewayError { XCTAssertEqual(error, expected) }
    catch { XCTFail("Unexpected error: \(type(of: error))") }
  }

  private func assertCancellation(operation: () async throws -> Void) async {
    do { try await operation(); XCTFail("Expected cancellation") }
    catch is CancellationError {}
    catch { XCTFail("Unexpected error: \(type(of: error))") }
  }
}

private func makeSettingsAccess(
  _ lease: SettingsHostLease,
  protocolVersion: Int = 3,
  capabilities: Set<SettingsCapability>
) -> SettingsSessionAccess {
  SettingsSessionAccess(
    lease: lease, protocolVersion: protocolVersion, isOnline: true, isReady: true,
    capabilities: capabilities
  )
}

@MainActor
private final class SettingsAccessBox {
  var value: SettingsSessionAccess?
  init(_ value: SettingsSessionAccess?) { self.value = value }
}

private actor SettingsCredentialRepositoryFake: SettingsCredentialRepository {
  let credentials: SettingsHostCredentials?
  private(set) var requested: [ClientConnectionID] = []
  init(credentials: SettingsHostCredentials?) { self.credentials = credentials }
  func settingsCredentials(for connectionID: ClientConnectionID) -> SettingsHostCredentials? {
    requested.append(connectionID)
    return credentials?.connectionID == connectionID ? credentials : nil
  }
}

private actor SettingsRemoteAPIFake: SettingsRemoteAPI {
  private(set) var calls = 0
  let error: (any Error)?
  init(error: (any Error)? = nil) { self.error = error }

  private func respond<Value: Sendable>(_ value: Value) throws -> Value {
    calls += 1
    if let error { throw error }
    return value
  }

  func settingsRead() throws -> SettingsReadResponse {
    try respond(try JSONDecoder().decode(
      SettingsReadResponse.self, from: SettingsFixtures.data(SettingsFixtures.settingsResponse)
    ))
  }
  func settingsWrite(_ patch: SettingsPatch) throws -> SettingsReadResponse { try settingsRead() }
  func settingsAgentStatuses() throws -> SettingsAgentStatuses {
    try respond(try JSONDecoder().decode(
      SettingsAgentStatuses.self, from: SettingsFixtures.data(SettingsFixtures.agentStatuses)
    ))
  }
  func settingsProviderUsage() throws -> SettingsProviderUsage {
    try respond(try JSONDecoder().decode(
      SettingsProviderUsage.self, from: SettingsFixtures.data(SettingsFixtures.providerUsage)
    ))
  }
  func settingsProfileDevices() throws -> SettingsProfileDevices {
    try respond(try JSONDecoder().decode(
      SettingsProfileDevices.self, from: SettingsFixtures.data(SettingsFixtures.profileDevices)
    ))
  }
  func settingsProfileCoreStats(
    _ request: SettingsProfileStatsRequest
  ) throws -> SettingsProfileCoreStats {
    try respond(try JSONDecoder().decode(
      SettingsProfileCoreStats.self, from: SettingsFixtures.data(SettingsFixtures.profileCore)
    ))
  }
  func settingsProfileTokenStats(
    _ request: SettingsProfileStatsRequest
  ) throws -> SettingsProfileTokenStats {
    try respond(try JSONDecoder().decode(
      SettingsProfileTokenStats.self, from: SettingsFixtures.data(SettingsFixtures.profileTokens)
    ))
  }
  func settingsSetProfileIdentity(
    _ identity: SettingsProfileIdentity
  ) throws -> SettingsProfileIdentityResponse {
    try respond(try JSONDecoder().decode(
      SettingsProfileIdentityResponse.self,
      from: SettingsFixtures.data(SettingsFixtures.profileIdentity)
    ))
  }
}
