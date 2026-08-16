import XCTest

@testable import App

/// Legacy AppSession send/interrupt ambiguity handling.
///
/// A post-send failure whose outcome cannot be established (HTTP >= 500, status 0 /
/// network / timeout) must never replay the mutation: exactly one authoritative read
/// reconciles the thread state under the existing ownership guards. Definite rejections
/// surface as errors without a reconcile read. Stale hosts must not install the refresh.
@MainActor
final class AppSessionMutationAmbiguityTests: XCTestCase {
    func testAmbiguousSendRefreshesExactlyOnceAndNeverReplays() async throws {
        let ambiguous: [RemoteClientError] = [
            RemoteClientError(message: "server error", status: 500, code: "internal"),
            RemoteClientError(message: "unavailable", status: 503, code: "unavailable"),
            RemoteClientError(message: "dropped", status: 0, code: "network"),
        ]
        for error in ambiguous {
            let fixture = try await makeSendFixture(sendError: error)
            let baselineHistoryCalls = fixture.api.historyCalls.count
            let ok = await fixture.session.sendMessage("hi")
            XCTAssertFalse(ok, "\(error)")
            XCTAssertEqual(fixture.api.sendCalls, 1, "submitted exactly once: \(error)")
            XCTAssertEqual(
                fixture.api.historyCalls.count,
                baselineHistoryCalls + 1,
                "exactly one authoritative refresh: \(error)"
            )
            XCTAssertEqual(fixture.api.historyCalls.last, "t1", "\(error)")
            XCTAssertEqual(
                fixture.session.threadSnapshot?.snapshotSeq,
                9,
                "refresh installed authoritative state: \(error)"
            )
            XCTAssertNil(fixture.session.globalError, "\(error)")
            XCTAssertNotEqual(fixture.session.phase, .sessionExpired, "\(error)")
        }
    }

    func testDefiniteSendRejectionsDoNotRefresh() async throws {
        let definite: [RemoteClientError] = [
            RemoteClientError(message: "bad request", status: 400, code: "invalid_request"),
            RemoteClientError(message: "conflict", status: 409, code: "conflict"),
        ]
        for error in definite {
            let fixture = try await makeSendFixture(sendError: error)
            let baselineHistoryCalls = fixture.api.historyCalls.count
            let ok = await fixture.session.sendMessage("hi")
            XCTAssertFalse(ok, "\(error)")
            XCTAssertEqual(fixture.api.sendCalls, 1, "\(error)")
            XCTAssertEqual(
                fixture.api.historyCalls.count,
                baselineHistoryCalls,
                "no reconcile read for definite failures: \(error)"
            )
            XCTAssertNotNil(fixture.session.globalError, "\(error)")
        }
    }

    func testAmbiguousInterruptRefreshesExactlyOnceAndNeverReplays() async throws {
        let fixture = try await makeSendFixture(
            interruptError: RemoteClientError(message: "unavailable", status: 503, code: "unavailable")
        )
        let baselineHistoryCalls = fixture.api.historyCalls.count
        await fixture.session.interruptOpenThread()
        XCTAssertEqual(fixture.api.interruptCalls, 1)
        XCTAssertEqual(fixture.api.historyCalls.count, baselineHistoryCalls + 1)
        XCTAssertEqual(fixture.api.historyCalls.last, "t1")
        XCTAssertNil(fixture.session.globalError)
        XCTAssertNotEqual(fixture.session.phase, .sessionExpired)
    }

    func testStaleHostDoesNotInstallRefreshAfterAmbiguousSend() async throws {
        let gate = AsyncGate()
        var remote: FakeRemoteAPI?
        let (session, repo, _) = try await makeSession(
            seedProfile: makeProfile(),
            seedToken: "t"
        ) { e, t in
            let api = FakeRemoteAPI(endpoint: e, accessToken: t)
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
            api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
            api.sendGate = gate
            api.sendError = RemoteClientError(
                message: "unavailable", status: 503, code: "unavailable")
            remote = api
            return api
        }
        defer { Task { await repo.wipeSuiteForTests() } }
        await session.bootstrap()
        session.state.socketState = .online
        session.openThread(id: "t1")
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            session.threadSnapshot != nil || session.threadLoadState == .loaded
        }
        guard let remote else { return XCTFail("missing API") }
        let baselineHistoryCalls = remote.historyCalls.count

        let send = Task { @MainActor in await session.sendMessage("hi") }
        try await gate.waitUntilWaiting()
        // The host moved on while the mutation was in flight: the outcome no longer
        // belongs to this generation, so no refresh may be installed for it.
        session.state.operationOwner.bumpWorkGeneration()
        await gate.resume()

        let ok = await send.value
        XCTAssertFalse(ok)
        XCTAssertEqual(remote.sendCalls, 1)
        XCTAssertEqual(
            remote.historyCalls.count,
            baselineHistoryCalls,
            "stale host must not install the authoritative refresh"
        )
    }

    private struct SendFixture {
        let session: AppSession
        let api: FakeRemoteAPI
    }

    private func makeSendFixture(
        sendError: RemoteClientError? = nil,
        interruptError: RemoteClientError? = nil
    ) async throws -> SendFixture {
        var remote: FakeRemoteAPI?
        let (session, repo, _) = try await makeSession(
            seedProfile: makeProfile(),
            seedToken: "t"
        ) { e, t in
            let api = FakeRemoteAPI(endpoint: e, accessToken: t)
            api.environmentResult = .success(makeEnvironment())
            api.snapshotResult = .success(makeShell(seq: 1, threads: [makeThread(id: "t1")]))
            api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 1))
            api.sendError = sendError
            api.interruptError = interruptError
            remote = api
            return api
        }
        defer { Task { await repo.wipeSuiteForTests() } }
        await session.bootstrap()
        session.state.socketState = .online
        session.openThread(id: "t1")
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            session.threadSnapshot != nil || session.threadLoadState == .loaded
        }
        let api = try XCTUnwrap(remote)
        // Swap in a distinguishable authoritative snapshot so the reconcile read is
        // observable after an ambiguous mutation.
        api.historyResults["t1"] = .success(makeHistory(threadId: "t1", seq: 9))
        return SendFixture(session: session, api: api)
    }
}
