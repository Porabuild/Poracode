import XCTest
@testable import App

/// F3: an environment identity refusal is terminal on both connect paths.
///
/// `environment_identity_changed` must never proceed to snapshot/socket and
/// must never be retried as a generic network error.
@MainActor
final class EnvironmentIdentityTerminalTests: XCTestCase {
    private let proxyEndpoint =
        "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy"

    private func makeConnectedSession(
        api: FakeRemoteAPI,
        socket: FakeLiveSocket
    ) async throws -> (AppSession, SessionOperationOwner.Begin) {
        let (session, _, _) = try await makeSession(
            apiFactory: { _, _ in api },
            socketFactory: { _ in socket }
        )
        session.state.profile = makeProfile(desktopId: "child-desktop", endpoint: proxyEndpoint)
        session.state.accessToken = "child-token"
        let began = session.state.operationOwner.begin(.connect)
        return (session, began)
    }

    func testEnvironmentProbeIdentityChangedIsTerminalWithoutSnapshotOrSocket() async throws {
        let api = FakeRemoteAPI(endpoint: proxyEndpoint)
        api.environmentResult = .failure(EnvironmentTransportError.identityChanged())
        let socket = FakeLiveSocket()
        let (session, began) = try await makeConnectedSession(api: api, socket: socket)

        await session.live.connectWithStoredSession(
            generation: began.workGeneration,
            ownerEpoch: began.epoch
        )

        XCTAssertEqual(api.environmentCalls, 1)
        XCTAssertEqual(api.snapshotCalls, 0)
        XCTAssertNil(socket.startedWithSeq)
        XCTAssertEqual(session.state.phase, .protocolIncompatible)
        XCTAssertEqual(session.state.socketState, .idle)
        XCTAssertEqual(
            session.state.globalError,
            EnvironmentStrings.identityChangedMessage
        )
        XCTAssertNil(session.state.snapshot)

        // The terminal phase is a hard gate: a later connect attempt must not
        // retry the refusal as a generic network error.
        await session.live.connectAndStart(
            generation: began.workGeneration,
            ownerEpoch: began.epoch
        )
        XCTAssertEqual(api.snapshotCalls, 0)
        XCTAssertNil(socket.startedWithSeq)
    }

    func testSnapshotIdentityChangedIsTerminalWithoutSocket() async throws {
        let api = FakeRemoteAPI(endpoint: proxyEndpoint)
        api.environmentResult = .success(makeEnvironment(desktopId: "child-desktop"))
        api.snapshotResult = .failure(EnvironmentTransportError.identityChanged())
        let socket = FakeLiveSocket()
        let (session, began) = try await makeConnectedSession(api: api, socket: socket)

        await session.live.connectWithStoredSession(
            generation: began.workGeneration,
            ownerEpoch: began.epoch
        )

        XCTAssertEqual(api.environmentCalls, 1)
        XCTAssertEqual(api.snapshotCalls, 1)
        XCTAssertNil(socket.startedWithSeq)
        XCTAssertEqual(session.state.phase, .protocolIncompatible)
        XCTAssertEqual(session.state.socketState, .idle)
        XCTAssertEqual(
            session.state.globalError,
            EnvironmentStrings.identityChangedMessage
        )
        // No partial install: the refusal aborted the replay boundary buffer
        // and never advanced the replay cursor.
        XCTAssertNil(session.state.snapshot)
        XCTAssertEqual(session.state.lastSeenSeq, 0)
    }

    func testDirectHostSnapshotFailureStillStartsSocket() async throws {
        // Control: the same snapshot failure shape without the identity code
        // keeps the pre-existing generic recovery (proceed to the socket).
        let api = FakeRemoteAPI(endpoint: "https://direct.test")
        api.environmentResult = .success(makeEnvironment(desktopId: "direct-desktop"))
        api.snapshotResult = .failure(
            RemoteClientError(message: "offline", status: 0, code: "network")
        )
        let socket = FakeLiveSocket()
        let (session, began) = try await makeConnectedSession(api: api, socket: socket)
        session.state.profile = makeProfile(desktopId: "direct-desktop", endpoint: "https://direct.test")

        await session.live.connectWithStoredSession(
            generation: began.workGeneration,
            ownerEpoch: began.epoch
        )

        XCTAssertEqual(session.state.phase, .ready)
        XCTAssertEqual(socket.startedWithSeq, 0)
    }
}
