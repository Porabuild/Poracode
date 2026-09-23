import SwiftUI
import XCTest

@testable import App

private let connectionA = ClientConnectionID(
  rawValue: "11111111-1111-4111-8111-111111111111")!
private let connectionB = ClientConnectionID(
  rawValue: "22222222-2222-4222-8222-222222222222")!

/// Composition pin for the scene-phase wiring: drives the real
/// `NotificationIngress` fan-out — route confirmation, push registration
/// reconcile, remote presentations — through the single `applyScenePhase`
/// seam PoracodeApp calls from both scene-phase sites. 587195a47 originally
/// computed the predicate inline in PoracodeApp.swift, where reverting it to
/// `phase == .active` shipped with a fully green suite; these tests fail
/// under exactly that mapping.
@MainActor
final class NotificationIngressScenePhaseTests: XCTestCase {

  func testTransientInactiveKeepsPendingConfirmationWithoutReconciling() async throws {
    let harness = try await Harness.make()

    harness.ingress.applyScenePhase(.active)
    await harness.ingress.settleForTests()
    let initialCalls = await harness.recorder.registrationCount
    XCTAssertEqual(initialCalls, 1, "the launch reconcile registers the paired host once")

    harness.ingress.routes.submit(
      route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.ingress.routes.settleForTests()
    XCTAssertNotNil(harness.ingress.routes.pendingHostSwitch)

    // Notification Center / Control Center / app-switcher peek: the phase
    // still maps to foreground. The pending confirmation survives and the
    // push reconcile must not re-run.
    harness.ingress.applyScenePhase(.inactive)
    await harness.ingress.settleForTests()
    XCTAssertNotNil(harness.ingress.routes.pendingHostSwitch)
    let afterOverlayCalls = await harness.recorder.registrationCount
    XCTAssertEqual(afterOverlayCalls, 1, "a transient .inactive must not re-run the reconcile")

    // Closing the overlay is not a return from background: still no reconcile.
    harness.ingress.applyScenePhase(.active)
    await harness.ingress.settleForTests()
    XCTAssertNotNil(harness.ingress.routes.pendingHostSwitch)
    let afterCloseCalls = await harness.recorder.registrationCount
    XCTAssertEqual(afterCloseCalls, 1)
  }

  func testBackgroundCancelsPendingConfirmationAndReturnReconcilesExactlyOnce() async throws {
    let harness = try await Harness.make()

    harness.ingress.applyScenePhase(.active)
    await harness.ingress.settleForTests()
    let initialCalls = await harness.recorder.registrationCount
    XCTAssertEqual(initialCalls, 1)

    harness.ingress.routes.submit(
      route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.ingress.routes.settleForTests()
    XCTAssertNotNil(harness.ingress.routes.pendingHostSwitch)

    harness.ingress.applyScenePhase(.background)
    await harness.ingress.settleForTests()
    XCTAssertNil(harness.ingress.routes.pendingHostSwitch)

    harness.ingress.applyScenePhase(.active)
    await harness.ingress.settleForTests()
    let returnCalls = await harness.recorder.registrationCount
    XCTAssertEqual(
      returnCalls, 2, "background→active must reconcile exactly once more, not per-phase")
  }

  // MARK: - Fixtures

  private func route(
    connection: ClientConnectionID, desktopId: String, threadId: String
  ) -> NotificationRoute {
    NotificationRoute(
      version: NotificationRoute.version,
      clientConnectionId: connection,
      desktopId: desktopId,
      threadId: threadId
    )
  }
}

private struct Harness {
  let ingress: NotificationIngress
  let recorder: PushCallRecorder
  // Held strongly: NotificationRouteController keeps its session weakly.
  let session: RouteSessionDouble

  @MainActor
  static func make() async throws -> Harness {
    // Push side: one paired host answering push-routing v1, so every
    // reconcile pass emits exactly one registerPush call.
    let catalog = HostCatalog.ephemeralForTests()
    let pushIO = InMemoryKeychainIO()
    let vault = PushTokenVault(io: pushIO)
    let state = PushClientStateStore(
      directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    )
    let outbox = PushUnregisterOutbox(io: pushIO)
    let recorder = PushCallRecorder()
    let pushEndpoint = "https://push.test"
    let pushConnection = ClientConnectionID()
    let pushRecord = HostRecord(
      connectionId: pushConnection,
      desktopId: "desk-push",
      label: "Desktop Push",
      httpBaseURL: pushEndpoint,
      wsBaseURL: pushEndpoint,
      appVersion: "1",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    _ = try await catalog.activate(id: 1, kind: .add)
    _ = try await catalog.pairAdd(record: pushRecord, token: "host-token", owning: 1)
    await recorder.setEnvironment(
      pushEnvironment(desktopId: pushRecord.desktopId), endpoint: pushEndpoint)
    let registrations = PushRegistrationController(
      catalog: catalog,
      vault: vault,
      stateStore: state,
      outbox: outbox,
      makeAPI: { endpoint, token, _ in
        CountingPushAPI(endpoint: endpoint, accessToken: token, recorder: recorder)
      },
      appVersion: { "9.9.9" },
      deliveryEnabled: true
    )
    await registrations.receiveAPNSToken(Data([0x01]))

    // Route side: host A selected, cross-host tap for host B pauses for
    // confirmation. No snapshot needed — the cross-host pause happens before
    // any thread lookup.
    let session = RouteSessionDouble()
    session.hosts = [
      HostRecord(
        connectionId: connectionA,
        desktopId: "desk-a",
        label: "Desktop A",
        httpBaseURL: "https://desk-a.internal.example",
        wsBaseURL: "wss://desk-a.internal.example",
        appVersion: "1.0.0",
        scopes: ["session:read", "session:operate"],
        pairedAt: Date(timeIntervalSince1970: 0)
      ),
      HostRecord(
        connectionId: connectionB,
        desktopId: "desk-b",
        label: "Desktop B",
        httpBaseURL: "https://desk-b.internal.example",
        wsBaseURL: "wss://desk-b.internal.example",
        appVersion: "1.0.0",
        scopes: ["session:read", "session:operate"],
        pairedAt: Date(timeIntervalSince1970: 0)
      ),
    ]
    session.selectedConnectionId = connectionA
    session.profile = session.hosts[0].asProfile()

    let routes = NotificationRouteController(navigation: NotificationNavigationCenter())
    routes.attach(session: session)
    let ingress = NotificationIngress(
      routes: routes,
      registrations: registrations,
      remotePresentations: RemoteUserNotificationPresentationCenter()
    )
    return Harness(ingress: ingress, recorder: recorder, session: session)
  }

  private static func pushEnvironment(desktopId: String) -> RemoteEnvironmentDescriptor {
    RemoteEnvironmentDescriptor(
      protocolVersion: ProtocolConstants.remoteProtocolVersion,
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
      capabilities: .init(pushRouting: .init(versions: [1]))
    )
  }
}

private actor PushCallRecorder {
  private(set) var registrationCount = 0
  private var environments: [String: RemoteEnvironmentDescriptor] = [:]

  func setEnvironment(_ value: RemoteEnvironmentDescriptor, endpoint: String) {
    environments[endpoint] = value
  }

  func environment(endpoint: String) throws -> RemoteEnvironmentDescriptor {
    guard let value = environments[endpoint] else {
      throw RemoteClientError(message: "offline", status: 0, code: "network")
    }
    return value
  }

  func register() {
    registrationCount += 1
  }
}

private struct CountingPushAPI: PushRemoteAPI {
  var endpoint: String
  var accessToken: String
  var recorder: PushCallRecorder

  func environment() async throws -> RemoteEnvironmentDescriptor {
    try await recorder.environment(endpoint: endpoint)
  }

  func registerPush(_ request: PushRegistrationRequest) async throws -> PushRegistrationResponse {
    await recorder.register()
    return PushRegistrationResponse(ok: true, routing: .init(version: 1))
  }

  func unregisterPush(_ request: PushUnregisterRequest) async throws {
    // The outbox stays empty in these tests; no unregister is expected.
  }
}

/// In-memory `NotificationRouteSession` double (no AppSession composition).
@MainActor
private final class RouteSessionDouble: NotificationRouteSession {
  var selectedConnectionId: ClientConnectionID?
  var hosts: [HostRecord] = []
  var profile: ConnectionProfile?
  var snapshot: RemoteShellSnapshot?

  func switchHost(_ connectionId: ClientConnectionID) async {
    selectedConnectionId = connectionId
  }

  func refreshSnapshot() async {}

  func ensureThreadLoadedForOpen(id: String) async -> RemoteThread? {
    snapshot?.threads.first { $0.id == id }
  }

  func releasePendingNavigationPin(id: String) {}
}
