import XCTest

@testable import App

@MainActor
final class SettingsIntegrationsGatewayTests: XCTestCase {
  func testReadAndOperateScopesAreEnforcedBeforeCallingAPI() async {
    let context = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let api = SettingsIntegrationsAPIFake()
    let readOnly = SelectedSettingsIntegrationsGateway { _ in
      .init(access: settingsIntegrationsAccess(context, scopes: [.read]), api: api)
    }
    do {
      _ = try await readOnly.scanSkills(
        .init(
          projectLocation: context.projectLocation, wslDistro: nil, agentKind: nil,
          presentationMode: "gui"),
        context: context
      )
    } catch { XCTFail("Unexpected read error: \(error)") }
    await assertGatewayError(.http(statusCode: 403, code: "missing_scope", missingScope: .operate))
    {
      try await readOnly.deleteSkill(
        .init(
          absolutePath: "/skills/demo", projectLocation: context.projectLocation, wslDistro: nil),
        context: context
      )
    }
    let calls = await api.calls
    XCTAssertEqual(calls, 1)
  }

  func testExactConnectionGenerationAndProjectAreCheckedPreAndPostCall() async {
    let first = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let stale = settingsIntegrationsContext(
      generation: 2, project: SettingsIntegrationsFixtures.posix)
    let api = SettingsIntegrationsAPIFake()
    let box = SettingsIntegrationsSelectionBox(
      .init(access: settingsIntegrationsAccess(first), api: api)
    )
    await api.setOnCall {
      await box.set(.init(access: settingsIntegrationsAccess(stale), api: api))
    }
    let gateway = SelectedSettingsIntegrationsGateway { context in
      await box.selection(for: context)
    }
    await assertCancellation {
      _ = try await gateway.scanSkills(
        .init(
          projectLocation: first.projectLocation, wslDistro: nil, agentKind: nil,
          presentationMode: "gui"),
        context: first
      )
    }
    let calls = await api.calls
    XCTAssertEqual(calls, 1)
  }

  func testStaleProjectMutationIsRejectedBeforeCall() async {
    let selected = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let api = SettingsIntegrationsAPIFake()
    let gateway = SelectedSettingsIntegrationsGateway { _ in
      .init(access: settingsIntegrationsAccess(selected), api: api)
    }
    await assertCancellation {
      try await gateway.setSkillEnabled(
        .init(
          absolutePath: "/skills/demo", enabled: true,
          projectLocation: SettingsIntegrationsFixtures.wsl, wslDistro: "Ubuntu"
        ),
        context: selected
      )
    }
    let calls = await api.calls
    XCTAssertEqual(calls, 0)
  }

  func testDifferentProjectIdentityAtSameLocationIsAStaleLease() async {
    let first = settingsIntegrationsContext(
      projectID: "first",
      project: SettingsIntegrationsFixtures.posix
    )
    let replacement = settingsIntegrationsContext(
      projectID: "replacement",
      project: SettingsIntegrationsFixtures.posix
    )
    let api = SettingsIntegrationsAPIFake()
    let box = SettingsIntegrationsSelectionBox(
      .init(access: settingsIntegrationsAccess(first), api: api)
    )
    await api.setOnCall {
      await box.set(.init(access: settingsIntegrationsAccess(replacement), api: api))
    }
    let gateway = SelectedSettingsIntegrationsGateway { context in
      await box.selection(for: context)
    }

    await assertCancellation {
      _ = try await gateway.scanSkills(
        .init(
          projectLocation: first.projectLocation,
          wslDistro: nil,
          agentKind: nil,
          presentationMode: "gui"
        ),
        context: first
      )
    }
    let calls = await api.calls
    XCTAssertEqual(calls, 1)
  }

  func testCredentialSourceUsesExactClientIDGenerationAndScopeIntersection() async throws {
    let context = settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    let repository = SettingsIntegrationsCredentialFake(
      credential: .init(
        connectionID: context.lease.connectionID,
        endpoint: "https://host.example",
        token: "token",
        protocolVersion: 3,
        scopes: ["session:read"]
      )
    )
    let accessBox = SettingsIntegrationsAccessBox(settingsIntegrationsAccess(context))
    let source = SettingsIntegrationsExactHostTransportSource(
      credentials: repository,
      accessProvider: { accessBox.value },
      makeAPI: { _, _ in SettingsIntegrationsAPIFake() }
    )
    let selection = try await source.selection(for: context)
    XCTAssertEqual(selection?.access.context, context)
    XCTAssertEqual(selection?.access.scopes, [.read])
    let requested = await repository.requested
    XCTAssertEqual(requested, [context.lease.connectionID])

    accessBox.value = settingsIntegrationsAccess(
      settingsIntegrationsContext(generation: 2, project: SettingsIntegrationsFixtures.posix)
    )
    await assertCancellation { _ = try await source.selection(for: context) }
  }

  private func assertGatewayError(
    _ expected: SettingsIntegrationsGatewayError,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected gateway error")
    } catch let error as SettingsIntegrationsGatewayError {
      XCTAssertEqual(error, expected)
    } catch {
      XCTFail("Unexpected error type")
    }
  }

  private func assertCancellation(operation: () async throws -> Void) async {
    do {
      try await operation()
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error type")
    }
  }
}

private actor SettingsIntegrationsSelectionBox {
  var value: SettingsIntegrationsTransportSelection
  init(_ value: SettingsIntegrationsTransportSelection) { self.value = value }
  func set(_ value: SettingsIntegrationsTransportSelection) { self.value = value }
  func selection(for context: SettingsIntegrationsContext) -> SettingsIntegrationsTransportSelection
  {
    value
  }
}

@MainActor
private final class SettingsIntegrationsAccessBox {
  var value: SettingsIntegrationsAccess?
  init(_ value: SettingsIntegrationsAccess?) { self.value = value }
}

private actor SettingsIntegrationsCredentialFake: SettingsIntegrationsCredentialRepository {
  let credential: SettingsIntegrationsHostCredentials?
  private(set) var requested: [ClientConnectionID] = []

  init(credential: SettingsIntegrationsHostCredentials?) { self.credential = credential }

  func settingsIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) -> SettingsIntegrationsHostCredentials? {
    requested.append(connectionID)
    return credential?.connectionID == connectionID ? credential : nil
  }
}
