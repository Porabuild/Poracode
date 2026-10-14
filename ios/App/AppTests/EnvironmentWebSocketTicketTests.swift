import XCTest
@testable import App

/// Parent/child WS ticket pairing: exact child-ticket association, bounded TTL,
/// single use, and concurrent event/terminal safety.
final class EnvironmentWebSocketTicketTests: XCTestCase {
    private let proxyEndpoint = "https://parent.test/api/environments/11111111-1111-4111-8111-111111111111/proxy/"

    override func setUp() async throws {
        try await super.setUp()
        EnvironmentURLProtocol.reset()
        await EnvironmentParentTicketStore.shared.resetForTests()
    }

    override func tearDown() async throws {
        EnvironmentURLProtocol.reset()
        await EnvironmentParentTicketStore.shared.resetForTests()
        try await super.tearDown()
    }

    private func ticketResponse(_ ticket: String) -> EnvironmentURLProtocol.Response {
        .json(["ticket": ticket, "expiresAt": "2099-01-01T00:00:00Z"])
    }

    private func environmentClient(
        parentTicket: @escaping @Sendable () async throws -> String
    ) -> RemoteAPIClient {
        let context = RemoteEnvironmentContext(
            environmentId: "11111111-1111-4111-8111-111111111111",
            expectedChildDesktopId: "child-desktop",
            parentAuthorizationToken: { "parent-token" },
            mintParentWebSocketTicket: parentTicket
        )
        return RemoteAPIClient(
            endpoint: proxyEndpoint,
            accessToken: "child-token",
            session: EnvironmentURLProtocol.makeSession(),
            environment: context
        )
    }

    func testParentTicketIsAssociatedWithTheExactChildTicket() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: ticketResponse("child-ticket-1")
        )
        let client = environmentClient(parentTicket: { "parent-ticket-1" })
        let ticket = try await client.websocketTicket()
        XCTAssertEqual(ticket, "child-ticket-1")

        let url = try await client.websocketURL(ticket: ticket, lastSeenSeq: 0)
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(
            query.first { $0.name == ProtocolConstants.environmentParentTicketParam }?.value,
            "parent-ticket-1"
        )
        XCTAssertEqual(query.first { $0.name == "ticket" }?.value, "child-ticket-1")
    }

    func testMissingAssociationFailsClosed() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: ticketResponse("child-ticket-1")
        )
        let client = environmentClient(parentTicket: { "parent-ticket-1" })
        _ = try await client.websocketTicket()
        // Consuming a different child ticket must not reuse the minted parent
        // ticket.
        do {
            _ = try await client.websocketURL(ticket: "other-child-ticket", lastSeenSeq: 0)
            XCTFail("expected missing parent ticket")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentTicketMissing)
        }
    }

    func testParentTicketIsSingleUse() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: ticketResponse("child-ticket-1")
        )
        let client = environmentClient(parentTicket: { "parent-ticket-1" })
        let ticket = try await client.websocketTicket()
        _ = try await client.websocketURL(ticket: ticket, lastSeenSeq: 0)
        do {
            _ = try await client.websocketURL(ticket: ticket, lastSeenSeq: 0)
            XCTFail("parent ticket must be consumed exactly once")
        } catch let error as RemoteClientError {
            XCTAssertEqual(error.code, RemoteEnvironmentErrorCode.parentTicketMissing)
        }
    }

    func testConcurrentMintsKeepDistinctAssociations() async throws {
        EnvironmentURLProtocol.setSequence(
            ProtocolConstants.websocketTicketPath,
            responses: [ticketResponse("child-a"), ticketResponse("child-b")]
        )
        let counter = ParentTicketCounter()
        let client = environmentClient(parentTicket: { await counter.next() })

        async let first = client.websocketTicket()
        async let second = client.websocketTicket()
        let tickets = try await [first, second]
        XCTAssertEqual(Set(tickets).count, 2)

        var parents: [String] = []
        for ticket in tickets {
            let url = try await client.websocketURL(ticket: ticket, lastSeenSeq: 0)
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let parent = query.first {
                $0.name == ProtocolConstants.environmentParentTicketParam
            }?.value
            parents.append(try XCTUnwrap(parent))
        }
        // Each child ticket associates with exactly one distinct parent ticket.
        XCTAssertEqual(Set(parents), ["parent-1", "parent-2"])
        let remaining = await EnvironmentParentTicketStore.shared.liveCount()
        XCTAssertEqual(remaining, 0)
    }

    func testDirectClientURLHasNoParentTicket() async throws {
        let client = RemoteAPIClient(
            endpoint: "https://direct.test",
            accessToken: "direct-token",
            session: EnvironmentURLProtocol.makeSession()
        )
        let url = try await client.websocketURL(ticket: "child-ticket", lastSeenSeq: 0)
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertNil(query.first { $0.name == ProtocolConstants.environmentParentTicketParam })
    }

    func testStoreExpiresEntriesAndBoundsCount() async {
        let clock = MutableClock(Date(timeIntervalSince1970: 1_000))
        let store = EnvironmentParentTicketStore(
            ttl: 10,
            maximumEntries: 2,
            now: { clock.now }
        )
        await store.store(parentTicket: "p1", childTicket: "c1")
        await store.store(parentTicket: "p2", childTicket: "c2")
        await store.store(parentTicket: "p3", childTicket: "c3")
        let bounded = await store.liveCount()
        XCTAssertEqual(bounded, 2)

        clock.now = clock.now.addingTimeInterval(11)
        let expired = await store.consume(childTicket: "c3")
        XCTAssertNil(expired)
        let afterExpiry = await store.liveCount()
        XCTAssertEqual(afterExpiry, 0)
    }

    func testServerExpiryCapsLocalTTL() async {
        let clock = MutableClock(Date(timeIntervalSince1970: 2_000))
        let store = EnvironmentParentTicketStore(ttl: 25, now: { clock.now })
        await store.store(
            parentTicket: "p1",
            childTicket: "c1",
            expiresAt: clock.now.addingTimeInterval(-1)
        )
        let consumed = await store.consume(childTicket: "c1")
        XCTAssertNil(consumed)
    }
}

private final class MutableClock: @unchecked Sendable {
    var now: Date

    init(_ now: Date) {
        self.now = now
    }
}

private actor ParentTicketCounter {
    private var value = 0

    func next() -> String {
        value += 1
        return "parent-\(value)"
    }
}
