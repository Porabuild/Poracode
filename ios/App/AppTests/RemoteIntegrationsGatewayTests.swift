import XCTest

@testable import App

final class RemoteIntegrationsGatewayTests: XCTestCase {
  func testEveryRouteIsGatedByItsExactScopeBeforeTransport() async {
    let api = RemoteIntegrationsAPIFake()
    let lease = remoteIntegrationsLease()
    let gateway = SelectedRemoteIntegrationsGateway { _ in
      RemoteIntegrationsTransportSelection(
        access: remoteIntegrationsAccess(lease, capabilities: []),
        api: api
      )
    }

    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: "projects:manage")
    ) { _ = try await gateway.hostUpdate(lease: lease) }
    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: "session:read")
    ) { _ = try await gateway.schedules(lease: lease) }
    await assertGatewayError(
      .http(statusCode: 403, code: "missing_scope", missingScope: "session:operate")
    ) {
      _ = try await gateway.scheduleCommand(
        .delete(id: RemoteIntegrationsFixtures.scheduleID),
        lease: lease
      )
    }
    let calls = await api.callCount
    XCTAssertEqual(calls, 0)
  }

  func testExactGenerationAndProtocolAreCheckedBeforeAndAfterCalls() async {
    let api = RemoteIntegrationsAPIFake()
    let requested = remoteIntegrationsLease(generation: 1)
    let current = remoteIntegrationsLease(generation: 2)
    let stale = SelectedRemoteIntegrationsGateway { _ in
      RemoteIntegrationsTransportSelection(
        access: remoteIntegrationsAccess(current),
        api: api
      )
    }
    await assertCancellation { _ = try await stale.schedules(lease: requested) }

    let incompatible = SelectedRemoteIntegrationsGateway { lease in
      RemoteIntegrationsTransportSelection(
        access: remoteIntegrationsAccess(lease, protocolVersion: 4),
        api: api
      )
    }
    await assertGatewayError(.protocolIncompatible) {
      _ = try await incompatible.schedules(lease: requested)
    }
    let calls = await api.callCount
    XCTAssertEqual(calls, 0)
  }

  func testRemoteMessagesAndMalformedCodesAreNeverPropagated() async {
    let lease = remoteIntegrationsLease()
    let api = RemoteIntegrationsAPIFake(
      error: RemoteClientError(
        message: RemoteIntegrationsFixtures.secret,
        status: 403,
        code: "BAD SECRET"
      )
    )
    let gateway = SelectedRemoteIntegrationsGateway { _ in
      RemoteIntegrationsTransportSelection(
        access: remoteIntegrationsAccess(lease),
        api: api
      )
    }
    await assertGatewayError(.http(statusCode: 403, code: nil, missingScope: nil)) {
      _ = try await gateway.schedules(lease: lease)
    }
  }

  @MainActor
  func testCredentialSourceUsesOnlyCapturedHostAndIntersectsScopes() async throws {
    let lease = remoteIntegrationsLease()
    let repository = RemoteIntegrationsCredentialRepositoryFake(
      credential: RemoteIntegrationsHostCredentials(
        connectionID: lease.connectionID,
        endpoint: "https://host.example",
        token: "token",
        protocolVersion: 3,
        scopes: ["session:read"]
      )
    )
    let box = RemoteIntegrationsAccessBox(
      remoteIntegrationsAccess(
        lease,
        capabilities: [.sessionRead, .sessionOperate, .projectsManage]
      )
    )
    let source = RemoteIntegrationsExactHostTransportSource(
      credentials: repository,
      accessProvider: { box.value },
      makeAPI: { _, _ in RemoteIntegrationsAPIFake() }
    )

    let resolved = try await source.selection(for: lease)
    XCTAssertEqual(resolved?.access.lease, lease)
    XCTAssertEqual(resolved?.access.capabilities, [.sessionRead])
    let requested = await repository.requested
    XCTAssertEqual(requested, [lease.connectionID])
  }

  private func assertGatewayError(
    _ expected: RemoteIntegrationsGatewayError,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected gateway error")
    } catch let error as RemoteIntegrationsGatewayError {
      XCTAssertEqual(error, expected)
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private func assertCancellation(operation: () async throws -> Void) async {
    do {
      try await operation()
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }
}

private actor RemoteIntegrationsAPIFake: RemoteIntegrationsRemoteAPI {
  private(set) var callCount = 0
  let error: (any Error)?

  init(error: (any Error)? = nil) { self.error = error }

  private func respond<Value: Sendable>(_ value: Value) throws -> Value {
    callCount += 1
    if let error { throw error }
    return value
  }

  func remoteIntegrationsHostUpdate() throws -> RemoteIntegrationsHostUpdateState {
    try respond(Self.hostUpdate)
  }
  func remoteIntegrationsCheckHostUpdate() throws -> RemoteIntegrationsHostUpdateState {
    try respond(Self.hostUpdate)
  }
  func remoteIntegrationsInstallHostUpdate() throws { _ = try respond(true) }
  func remoteIntegrationsSchedules() throws -> RemoteIntegrationsSchedulesResponse {
    try respond(Self.schedules)
  }
  func remoteIntegrationsScheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand
  ) throws -> RemoteIntegrationsSchedulesResponse { try respond(Self.schedules) }
  func remoteIntegrationsPRWatch(
    _ key: RemoteIntegrationsPRWatchKey
  ) throws -> RemoteIntegrationsPRWatchResponse { try respond(.init(watch: nil)) }
  func remoteIntegrationsCheckPRWatch(_ key: RemoteIntegrationsPRWatchKey) throws {
    _ = try respond(true)
  }
  func remoteIntegrationsUpsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput
  ) throws -> RemoteIntegrationsPRWatch { throw RemoteIntegrationsGatewayError.transport }
  func remoteIntegrationsDeletePRWatch(_ key: RemoteIntegrationsPRWatchKey) throws {
    _ = try respond(true)
  }

  private static let hostUpdate = RemoteIntegrationsHostUpdateState(
    currentVersion: "1.0",
    status: nil
  )
  private static let schedules = RemoteIntegrationsSchedulesResponse(
    schedules: [],
    schedule: nil
  )
}

@MainActor
private final class RemoteIntegrationsAccessBox {
  var value: RemoteIntegrationsHostAccess?
  init(_ value: RemoteIntegrationsHostAccess?) { self.value = value }
}

private actor RemoteIntegrationsCredentialRepositoryFake:
  RemoteIntegrationsCredentialRepository
{
  let credential: RemoteIntegrationsHostCredentials?
  private(set) var requested: [ClientConnectionID] = []

  init(credential: RemoteIntegrationsHostCredentials?) { self.credential = credential }

  func remoteIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) -> RemoteIntegrationsHostCredentials? {
    requested.append(connectionID)
    return credential?.connectionID == connectionID ? credential : nil
  }
}
