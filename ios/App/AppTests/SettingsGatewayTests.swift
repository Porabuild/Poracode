import XCTest

@testable import App

@MainActor
final class SettingsGatewayTests: XCTestCase {
  func testAgentDiscoveryRequiresOperateAndKeepsTheExactHostLease() async throws {
    let api = SettingsRemoteAPIFake(), lease = settingsLease()
    let readonly = gateway(api: api, lease: lease, capabilities: [.sessionRead])
    do {
      _ = try await readonly.discoverAgents(.init(wslDistros: []), lease: lease)
      XCTFail("Read-only clients must not probe host CLIs")
    } catch SettingsGatewayError.http(let status, _, let scope) {
      XCTAssertEqual(status, 403); XCTAssertEqual(scope, "session:operate")
    }
    var calls = await api.calls
    XCTAssertEqual(calls, 0)
    let writable = gateway(api: api, lease: lease, capabilities: [.sessionRead, .sessionOperate])
    _ = try await writable.discoverAgents(.init(wslDistros: ["Ubuntu"]), lease: lease)
    calls = await api.calls
    XCTAssertEqual(calls, 1)
    do {
      _ = try await writable.discoverAgents(.init(wslDistros: []), lease: settingsLease("2"))
      XCTFail("A different host lease must fail before discovery")
    } catch is CancellationError {}
    calls = await api.calls
    XCTAssertEqual(calls, 1)
  }

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
        protocolVersion: ProtocolConstants.remoteProtocolVersion, scopes: ["session:read"]
      )
    )
    let accessBox = SettingsAccessBox(makeSettingsAccess(lease, capabilities: [.sessionRead]))
    let api = SettingsRemoteAPIFake()
    let source = SettingsExactHostTransportSource(
      credentials: repository,
      accessProvider: { accessBox.value },
      makeAPI: { _, _, _ in api }
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
        protocolVersion: ProtocolConstants.remoteProtocolVersion, scopes: ["session:read"]
      )
    )
    let accessBox = SettingsAccessBox(
      makeSettingsAccess(lease, capabilities: [.sessionRead, .sessionOperate])
    )
    let source = SettingsExactHostTransportSource(
      credentials: repository,
      accessProvider: { accessBox.value },
      makeAPI: { _, _, _ in SettingsRemoteAPIFake() }
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

  func testSettingsReadsDoNotInvalidateOtherScreensButWritesInvalidateOnlyTheirHost() async throws {
    let changes = SettingsDocumentChanges(), lease = settingsLease("1"), other = settingsLease("2")
    let api = SettingsRemoteAPIFake()
    let gateway = SelectedSettingsSessionGateway(mutationSettled: { lease in
      await changes.invalidate(lease.connectionID)
    }) { _ in SettingsTransportSelection(
      access: makeSettingsAccess(lease, capabilities: [.sessionRead, .sessionOperate]), api: api)
    }
    _ = try await gateway.readSettings(lease: lease)
    XCTAssertEqual(changes.revision(for: lease.connectionID), 0)
    _ = try await gateway.writeSettings(.init(values: [.disabledAgents: .array([.string("alpha")])]), lease: lease)
    XCTAssertEqual(changes.revision(for: lease.connectionID), 1)
    XCTAssertEqual(changes.revision(for: other.connectionID), 0)
    let calls = await api.calls
    XCTAssertEqual(calls, 2)
    changes.invalidate(other.connectionID)
    changes.retainConnections([other.connectionID])
    XCTAssertEqual(changes.revision(for: lease.connectionID), 0)
    XCTAssertEqual(changes.revision(for: other.connectionID), 1)
  }

  func testUncertainWritesInvalidateForAFreshReadWithoutReplayingTheMutation() async throws {
    let failures: [any Error] = [CancellationError(), SettingsRemoteMutationError.ambiguousOutcome,
      RemoteClientError(message: "Unavailable", status: 503, code: "unavailable")]
    for failure in failures {
      let changes = SettingsDocumentChanges(), lease = settingsLease()
      let api = SettingsRemoteAPIFake(error: failure)
      let gateway = SelectedSettingsSessionGateway(mutationSettled: { lease in
        await changes.invalidate(lease.connectionID)
      }) { _ in SettingsTransportSelection(
        access: makeSettingsAccess(lease, capabilities: [.sessionRead, .sessionOperate]), api: api)
      }
      do {
        _ = try await gateway.writeSettings(.init(values: [.providerOrder: .array([.string("alpha")])]), lease: lease)
        XCTFail("The uncertain write must not be reported as acknowledged")
      } catch {}
      XCTAssertEqual(changes.revision(for: lease.connectionID), 1)
      let calls = await api.calls
      XCTAssertEqual(calls, 1)
    }
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
  protocolVersion: Int = ProtocolConstants.remoteProtocolVersion,
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
  func settingsDiscoverAgents(_ request: SettingsAgentDiscoveryRequest) throws -> SettingsAgentDiscoveryResult {
    let statuses = try JSONDecoder().decode(SettingsAgentStatuses.self,
      from: SettingsFixtures.data(SettingsFixtures.agentStatuses))
    return try respond(.init(windows: statuses.windows, wsl: statuses.wsl, fromCache: false))
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
