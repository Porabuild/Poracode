import XCTest
@testable import App

final class ProtocolDecodingTests: XCTestCase {
    func testDecodeReadyEnvelope() throws {
        let json = #"{"type":"ready","seq":12}"#
        let message = try RemoteWebSocketServerMessage.decode(from: Data(json.utf8))
        guard case .ready(let seq) = message else {
            return XCTFail("expected ready")
        }
        XCTAssertEqual(seq, 12)
    }

    func testDecodeEventEnvelopeForwardCompatible() throws {
        let json = """
        {"type":"event","seq":3,"event":{"type":"remote-threads-changed","threadIds":["t1"],"extraField":true}}
        """
        let message = try RemoteWebSocketServerMessage.decode(from: Data(json.utf8))
        guard case .event(let seq, let event) = message else {
            return XCTFail("expected event")
        }
        XCTAssertEqual(seq, 3)
        XCTAssertEqual(event["type"]?.stringValue, "remote-threads-changed")
        XCTAssertEqual(event["extraField"], .bool(true))
    }

    func testDecodeResyncRequired() throws {
        let json = #"{"type":"resync-required","seq":9,"reason":"gap"}"#
        let message = try RemoteWebSocketServerMessage.decode(from: Data(json.utf8))
        guard case .resyncRequired(let seq, let reason) = message else {
            return XCTFail("expected resync")
        }
        XCTAssertEqual(seq, 9)
        XCTAssertEqual(reason, "gap")
    }

    func testDecodePong() throws {
        let json = #"{"type":"pong","id":"ping-1","sentAt":1,"receivedAt":2}"#
        let message = try RemoteWebSocketServerMessage.decode(from: Data(json.utf8))
        guard case .pong(let id, let sentAt, let receivedAt) = message else {
            return XCTFail("expected pong")
        }
        XCTAssertEqual(id, "ping-1")
        XCTAssertEqual(sentAt, 1)
        XCTAssertEqual(receivedAt, 2)
    }

    func testUnknownEnvelopeTypeIsForwardCompatible() throws {
        let json = #"{"type":"future-widget","payload":{"x":1}}"#
        let message = try RemoteWebSocketServerMessage.decode(from: Data(json.utf8))
        guard case .unknown(let type, _) = message else {
            return XCTFail("expected unknown")
        }
        XCTAssertEqual(type, "future-widget")
    }

    func testDecodeShellSnapshot() throws {
        let json = """
        {
          "snapshotSeq": 1,
          "projects": [
            {
              "id": "project-1",
              "name": "Project",
              "location": { "kind": "posix", "path": "/repo" },
              "createdAt": "2026-01-01T00:00:00.000Z"
            }
          ],
          "threads": [
            {
              "id": "thread-1",
              "projectId": "project-1",
              "title": "Hello",
              "agentKind": "claude",
              "config": { "model": "sonnet" },
              "status": "idle",
              "attention": "none",
              "createdAt": "2026-01-01T00:00:00.000Z",
              "updatedAt": "2026-01-01T00:00:00.000Z"
            }
          ],
          "runtimeSummariesByThread": {
            "thread-1": { "itemCount": 2 }
          },
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "futureServerField": { "ok": true }
        }
        """
        let snapshot = try JSONDecoding.decode(RemoteShellSnapshot.self, from: Data(json.utf8))
        XCTAssertEqual(snapshot.snapshotSeq, 1)
        XCTAssertEqual(snapshot.projects.count, 1)
        XCTAssertEqual(snapshot.threads.first?.title, "Hello")
        XCTAssertEqual(snapshot.runtimeSummariesByThread["thread-1"]?.itemCount, 2)
    }

    func testDecodeRuntimeItem() throws {
        let json = """
        {
          "id": "item-1",
          "type": "user_message",
          "state": "completed",
          "payload": { "text": "Hi there", "unknown": 1 },
          "streams": { "text": "Hi there" }
        }
        """
        let item = try JSONDecoding.decode(PersistedRuntimeItem.self, from: Data(json.utf8))
        XCTAssertEqual(item.id, "item-1")
        XCTAssertEqual(item.displayText, "Hi there")
    }

    func testDecodeGoldenWsReadyFixture() throws {
        let data = try Self.loadProtocolFixture("ws-ready.json")
        let message = try RemoteWebSocketServerMessage.decode(from: data)
        guard case .ready(let seq) = message else {
            return XCTFail("expected ready")
        }
        XCTAssertEqual(seq, 42)
    }

    func testDecodeGoldenWsResyncRequiredFixture() throws {
        let data = try Self.loadProtocolFixture("ws-resync-required.json")
        let message = try RemoteWebSocketServerMessage.decode(from: data)
        guard case .resyncRequired(let seq, let reason) = message else {
            return XCTFail("expected resync-required")
        }
        XCTAssertEqual(seq, 7)
        XCTAssertTrue(reason.contains("replay"))
    }

    func testDecodeGoldenShellSnapshotFixture() throws {
        let data = try Self.loadProtocolFixture("shell-snapshot.json")
        let snapshot = try JSONDecoding.decode(RemoteShellSnapshot.self, from: data)
        XCTAssertEqual(snapshot.snapshotSeq, 42)
        XCTAssertFalse(snapshot.projects.isEmpty)
    }

    func testReconnectBackoffIncreasesAndCaps() {
        var backoff = ReconnectBackoff(baseMs: 1000, maxMs: 8000)
        // Force deterministic path by checking ceiling bounds rather than exact jitter.
        for attempt in 0 ..< 6 {
            let delay = backoff.nextDelay()
            // Duration.milliseconds components
            let ms = Double(delay.components.seconds) * 1000
                + Double(delay.components.attoseconds) / 1e15
            let ceiling = min(8000.0, 1000.0 * pow(2.0, Double(attempt)))
            XCTAssertGreaterThanOrEqual(ms, ceiling / 2 - 0.001)
            XCTAssertLessThan(ms, ceiling + 0.001)
        }
    }

    private static func loadProtocolFixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("protocol/remote/v3/fixtures/\(name)")
        return try Data(contentsOf: url)
    }
}
