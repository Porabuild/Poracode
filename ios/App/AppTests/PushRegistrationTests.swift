import XCTest

@testable import App

final class PushRegistrationTests: XCTestCase {
  func testCapabilityAbsentAndV2SkipWhileV1V2Registers() async throws {
    let harness = try await PushHarness.make(hosts: [
      ("https://absent.test", nil),
      ("https://v2.test", [2]),
      ("https://v12.test", [1, 2]),
    ])
    await harness.controller.receiveAPNSToken(Data([0xAA, 0x01]))
    await harness.controller.setForeground(true)
    let calls = await harness.recorder.registrationCalls
    XCTAssertEqual(calls.map(\.endpoint), ["https://v12.test"])
    XCTAssertEqual(calls.first?.request.deviceToken, "aa01")
    XCTAssertEqual(calls.first?.request.routing.version, 1)
  }

  func testAPNSTokenRotationReconcilesEveryEligibleHost() async throws {
    let harness = try await PushHarness.make(hosts: [
      ("https://a.test", [1]),
      ("https://b.test", [1]),
    ])
    await harness.controller.receiveAPNSToken(Data([0x01]))
    await harness.controller.setForeground(true)
    await harness.recorder.clearRegistrations()

    await harness.controller.setForeground(false)
    await harness.controller.receiveAPNSToken(Data([0x02]))
    let backgroundCalls = await harness.recorder.registrationCalls
    XCTAssertEqual(backgroundCalls.count, 0)
    await harness.controller.setForeground(true)
    let calls = await harness.recorder.registrationCalls
    XCTAssertEqual(Set(calls.map(\.endpoint)), Set(["https://a.test", "https://b.test"]))
    XCTAssertTrue(calls.allSatisfy { $0.request.deviceToken == "02" })
  }

  func testMissingRoutingEchoNeverMarksRegistrationOrDowngrades() async throws {
    let harness = try await PushHarness.make(hosts: [("https://a.test", [1])])
    await harness.recorder.setEchoVersion(nil)
    await harness.controller.receiveAPNSToken(Data([0x01]))
    await harness.controller.setForeground(true)
    let host = try XCTUnwrap(harness.hosts.first)
    let state = try await harness.state.host(host.connectionId)
    XCTAssertNil(state.deviceTokenFingerprint)
    let calls = await harness.recorder.registrationCalls
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(calls.first?.request.routing.version, 1)
  }

  func testPushToStartAndActivityDeltasGoOnlyToRoutedHost() async throws {
    let harness = try await PushHarness.make(hosts: [
      ("https://a.test", [1]),
      ("https://b.test", [1]),
    ])
    let a = try XCTUnwrap(harness.hosts.first)
    await harness.controller.receiveAPNSToken(Data([0x01]))
    await harness.controller.receivePushToStartToken(Data([0x0A]))
    await harness.controller.receiveActivityToken(
      Data([0x0B]),
      activityId: "activity-a",
      route: PushRegistrationRoute(clientConnectionId: a.connectionId, desktopId: a.desktopId)
    )
    await harness.controller.setForeground(true)
    let calls = await harness.recorder.registrationCalls
    let callA = try XCTUnwrap(calls.first { $0.endpoint == "https://a.test" })
    let callB = try XCTUnwrap(calls.first { $0.endpoint == "https://b.test" })
    XCTAssertEqual(callA.request.pushToStartToken, "0a")
    XCTAssertEqual(callA.request.activityTokens, ["activity-a": "0b"])
    XCTAssertEqual(callB.request.pushToStartToken, "0a")
    XCTAssertNil(callB.request.activityTokens)

    await harness.recorder.clearRegistrations()
    await harness.controller.setForeground(false)
    await harness.controller.setForeground(true)
    let secondCalls = await harness.recorder.registrationCalls
    XCTAssertTrue(secondCalls.allSatisfy { $0.request.activityTokens == nil })
  }

  func testExactUnregisterRecoveryErasesOnAuthFailure() async throws {
    let harness = try await PushHarness.make(hosts: [])
    let connection = ClientConnectionID(rawValue: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
    let route = PushRegistrationRoute(clientConnectionId: connection, desktopId: "desktop-exact")
    _ = try await harness.outbox.enqueue(
      endpoint: "https://relay.test/prefix",
      accessToken: "exact-access-token",
      deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      route: route
    )
    await harness.recorder.setUnregisterError(
      RemoteClientError(message: "expired", status: 401, code: "unauthorized")
    )
    await harness.controller.setForeground(true)
    let unregisterCalls = await harness.recorder.unregisterCalls
    let call = try XCTUnwrap(unregisterCalls.first)
    XCTAssertEqual(call.endpoint, "https://relay.test/prefix")
    XCTAssertEqual(call.accessToken, "exact-access-token")
    XCTAssertEqual(
      call.request,
      PushUnregisterRequest(
        deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        routing: route
      ))
    let pending = try await harness.outbox.pending()
    XCTAssertEqual(pending, [])
  }
}

private struct PushHarness {
  var controller: PushRegistrationController
  var recorder: PushAPIRecorder
  var state: PushClientStateStore
  var outbox: PushUnregisterOutbox
  var hosts: [HostRecord]

  static func make(hosts specs: [(String, [Int]?)]) async throws -> PushHarness {
    let catalog = HostCatalog.ephemeralForTests()
    let pushIO = InMemoryKeychainIO()
    let vault = PushTokenVault(io: pushIO)
    let state = PushClientStateStore(
      directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    )
    let outbox = PushUnregisterOutbox(io: pushIO)
    let recorder = PushAPIRecorder()
    var records: [HostRecord] = []
    for (index, spec) in specs.enumerated() {
      let connection = ClientConnectionID()
      let record = HostRecord(
        connectionId: connection,
        desktopId: "desktop-\(index)",
        label: "Desktop \(index)",
        httpBaseURL: spec.0,
        wsBaseURL: spec.0,
        appVersion: "1",
        scopes: ["session:read", "session:operate"],
        pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
      _ = try await catalog.activate(id: UInt64(index + 1), kind: .add)
      _ = try await catalog.pairAdd(
        record: record, token: "host-token-\(index)", owning: UInt64(index + 1))
      records.append(record)
      await recorder.setEnvironment(
        environment(desktopId: record.desktopId, versions: spec.1),
        endpoint: spec.0
      )
    }
    let controller = PushRegistrationController(
      catalog: catalog,
      vault: vault,
      stateStore: state,
      outbox: outbox,
      makeAPI: { endpoint, token in
        PushFakeAPI(endpoint: endpoint, accessToken: token, recorder: recorder)
      },
      appVersion: { "9.9.9" }
    )
    return PushHarness(
      controller: controller, recorder: recorder, state: state, outbox: outbox, hosts: records)
  }

  private static func environment(desktopId: String, versions: [Int]?)
    -> RemoteEnvironmentDescriptor
  {
    RemoteEnvironmentDescriptor(
      protocolVersion: 3,
      hostMode: nil,
      desktopId: desktopId,
      label: desktopId,
      appVersion: "1",
      platform: "macOS",
      auth: .init(
        policy: ProtocolConstants.authPolicy,
        bootstrapMethods: [ProtocolConstants.bootstrapMethod],
        sessionMethods: [ProtocolConstants.sessionMethod],
        scopes: ["session:read", "session:operate"]
      ),
      endpoints: .init(httpBaseUrl: "https://unused", wsBaseUrl: "wss://unused"),
      capabilities: versions.map {
        .init(pushRouting: .init(versions: $0))
      }
    )
  }
}

private actor PushAPIRecorder {
  struct RegistrationCall: Sendable {
    var endpoint: String
    var accessToken: String
    var request: PushRegistrationRequest
  }

  struct UnregisterCall: Sendable {
    var endpoint: String
    var accessToken: String
    var request: PushUnregisterRequest
  }

  var environments: [String: RemoteEnvironmentDescriptor] = [:]
  var registrationCalls: [RegistrationCall] = []
  var unregisterCalls: [UnregisterCall] = []
  var echoVersion: Int? = 1
  var unregisterError: RemoteClientError?

  func setEnvironment(_ value: RemoteEnvironmentDescriptor, endpoint: String) {
    environments[endpoint] = value
  }

  func environment(endpoint: String) throws -> RemoteEnvironmentDescriptor {
    guard let value = environments[endpoint] else {
      throw RemoteClientError(message: "offline", status: 0, code: "network")
    }
    return value
  }

  func register(endpoint: String, accessToken: String, request: PushRegistrationRequest)
    -> PushRegistrationResponse
  {
    registrationCalls.append(.init(endpoint: endpoint, accessToken: accessToken, request: request))
    return PushRegistrationResponse(
      ok: true,
      routing: echoVersion.map { .init(version: $0) }
    )
  }

  func unregister(endpoint: String, accessToken: String, request: PushUnregisterRequest) throws {
    unregisterCalls.append(.init(endpoint: endpoint, accessToken: accessToken, request: request))
    if let unregisterError { throw unregisterError }
  }

  func clearRegistrations() { registrationCalls = [] }
  func setEchoVersion(_ version: Int?) { echoVersion = version }
  func setUnregisterError(_ error: RemoteClientError?) { unregisterError = error }
}

private struct PushFakeAPI: PushRemoteAPI {
  var endpoint: String
  var accessToken: String
  var recorder: PushAPIRecorder

  func environment() async throws -> RemoteEnvironmentDescriptor {
    try await recorder.environment(endpoint: endpoint)
  }

  func registerPush(_ request: PushRegistrationRequest) async throws -> PushRegistrationResponse {
    await recorder.register(endpoint: endpoint, accessToken: accessToken, request: request)
  }

  func unregisterPush(_ request: PushUnregisterRequest) async throws {
    try await recorder.unregister(endpoint: endpoint, accessToken: accessToken, request: request)
  }
}
