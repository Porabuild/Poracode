import XCTest

@testable import App

final class ProjectSettingsNotesTests: XCTestCase {
    private struct SettingsFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var response: ProjectSettings
        }

        var cases: [Entry]
    }

    private struct NotesFixture: Decodable {
        struct ReadEntry: Decodable {
            var id: String
            var response: ProjectNotesResponse
        }

        struct WriteEntry: Decodable {
            var id: String
            var body: ProjectNotesWriteBody
        }

        var readCases: [ReadEntry]
        var writeCases: [WriteEntry]
    }

    func testSettingsDecodeOmissionAndAllMCPTransports() throws {
        let fixture = try ProjectFixtureLoader.decode(
            SettingsFixture.self,
            named: "project-settings.json"
        )
        XCTAssertEqual(fixture.cases.map(\.id), ["omitted", "all-transports"])
        XCTAssertNil(fixture.cases[0].response.mcpServers)

        let servers = try XCTUnwrap(fixture.cases[1].response.mcpServers)
        XCTAssertEqual(servers.count, 3)
        guard case .stdio(let command, let args, let env, let cwd) = servers[0].transport else {
            return XCTFail("Expected stdio")
        }
        XCTAssertEqual(command, "node")
        XCTAssertEqual(args, ["./scripts/mcp-fixture.mjs", "--stdio"])
        XCTAssertEqual(env.secretValue(forKey: "FIXTURE_MODE"), "read-only")
        XCTAssertEqual(cwd, "/srv/fixture")
        guard case .http(let url, let headers) = servers[1].transport else {
            return XCTFail("Expected HTTP")
        }
        XCTAssertEqual(url, "https://mcp.example.test/rpc")
        XCTAssertEqual(headers.secretValue(forKey: "X-Fixture-Client"), "poracode")
        guard case .sse(let sseURL, let sseHeaders) = servers[2].transport else {
            return XCTFail("Expected SSE")
        }
        XCTAssertEqual(sseURL, "https://mcp.example.test/events")
        XCTAssertEqual(sseHeaders.secretValue(forKey: "Accept-Language"), "en")
    }

    func testMCPDefaultsAndDescriptionsNeverLogEnvironmentOrHeaderValues() throws {
        let data = Data(
            #"{"mcpServers":[{"id":"server","name":"server","transport":{"type":"stdio","command":"tool","env":{"TOKEN":"top-secret"}}}]}"#
                .utf8
        )
        let settings = try JSONDecoder().decode(ProjectSettings.self, from: data)
        let server = try XCTUnwrap(settings.mcpServers?.first)
        XCTAssertEqual(server.descriptionText, "")
        XCTAssertTrue(server.enabled)
        XCTAssertEqual(server.timeoutMs, 30_000)
        guard case .stdio(_, let args, let env, _) = server.transport else {
            return XCTFail("Expected stdio")
        }
        XCTAssertEqual(args, [])
        XCTAssertEqual(env.keys, ["TOKEN"])
        XCTAssertFalse(env.description.contains("top-secret"))
        XCTAssertFalse(String(describing: server).contains("top-secret"))
        XCTAssertFalse(String(reflecting: server).contains("top-secret"))
        XCTAssertFalse(String(reflecting: server.transport).contains("top-secret"))

        let encoded = try JSONEncoder().encode(settings)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let encodedServers = try XCTUnwrap(object["mcpServers"] as? [[String: Any]])
        let transport = try XCTUnwrap(encodedServers.first?["transport"] as? [String: Any])
        XCTAssertEqual((transport["env"] as? [String: String])?["TOKEN"], "top-secret")
    }

    func testNotesKeepNullabilityOpaqueDocumentAndTodoOrder() throws {
        let fixture = try ProjectFixtureLoader.decode(
            NotesFixture.self,
            named: "project-notes.json"
        )
        XCTAssertEqual(fixture.readCases.map(\.id), ["null", "value"])
        XCTAssertNil(fixture.readCases[0].response.notes)

        let notes = try XCTUnwrap(fixture.readCases[1].response.notes)
        XCTAssertEqual(notes.projectId, "project-notes")
        XCTAssertEqual(notes.todos.map(\.id), ["todo-first", "todo-second"])
        XCTAssertNotNil(notes.doc)

        let write = try XCTUnwrap(fixture.writeCases.first?.body)
        XCTAssertEqual(write.todos.map(\.id), ["todo-a", "todo-b", "todo-c"])
        XCTAssertNotNil(write.doc)
        let roundTrip = try JSONDecoder().decode(
            ProjectNotesWriteBody.self,
            from: JSONEncoder().encode(write)
        )
        XCTAssertEqual(roundTrip, write)
    }

    func testNotesEncodeRequiredNullsRatherThanDroppingKeys() throws {
        let responseData = try JSONEncoder().encode(ProjectNotesResponse(notes: nil))
        let response = try XCTUnwrap(
            JSONSerialization.jsonObject(with: responseData) as? [String: Any]
        )
        XCTAssertTrue(response["notes"] is NSNull)

        let body = ProjectNotesWriteBody(doc: nil, todos: [], updatedAt: "2026-08-12T00:00:00Z")
        let bodyData = try JSONEncoder().encode(body)
        let bodyObject = try XCTUnwrap(
            JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
        )
        XCTAssertTrue(bodyObject["doc"] is NSNull)
        XCTAssertFalse(bodyObject.keys.contains("projectId"))
    }
}
