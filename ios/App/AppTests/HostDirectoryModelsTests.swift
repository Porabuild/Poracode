import XCTest

@testable import App

final class HostDirectoryModelsTests: XCTestCase {
    private struct BrowseFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var request: BrowseHostDirectoryRequest
            var result: BrowseHostDirectoryResult
        }

        var cases: [Entry]
    }

    private struct SetupFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var request: DetectSetupScriptRequest
            var result: DetectSetupScriptResult
        }

        var cases: [Entry]
    }

    private struct RouteFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var routeId: String
            var resolvedPath: String
            var body: JSONValue?
        }

        var cases: [Entry]
    }

    private struct ProcedureBody: Decodable {
        var procedure: String
        var payload: DetectSetupScriptRequest
    }

    func testHostDirectoryFixturesPreserveRootsUnicodeOrderAndTruncation() throws {
        let fixture = try ProjectFixtureLoader.decode(
            BrowseFixture.self,
            named: "project-browse-host-directory.json"
        )
        XCTAssertEqual(fixture.cases.count, 5)
        XCTAssertEqual(fixture.cases[0].request.path, "")
        XCTAssertEqual(fixture.cases[0].result.entries.map(\.name), [".config", "项目", "résumé.md"])
        XCTAssertTrue(fixture.cases[0].result.truncated)
        XCTAssertNil(fixture.cases[1].result.parentPath)
        XCTAssertTrue(fixture.cases[2].result.isDriveList)
        XCTAssertEqual(fixture.cases[2].result.path, BrowseHostDirectoryResult.driveListPath)
        XCTAssertEqual(fixture.cases[2].result.entries.map(\.path), ["C:\\", "D:\\"])
        XCTAssertEqual(
            fixture.cases[3].result.path,
            "\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目"
        )
        XCTAssertEqual(fixture.cases[4].result.path, "\\\\wsl$\\Debian\\home\\dev\\repo")

        for entry in fixture.cases {
            let roundTrip = try JSONDecoder().decode(
                BrowseHostDirectoryResult.self,
                from: JSONEncoder().encode(entry.result)
            )
            XCTAssertEqual(roundTrip, entry.result, entry.id)
        }
    }

    func testSetupDetectionKeepsOmittedAndConcreteResults() throws {
        let fixture = try ProjectFixtureLoader.decode(
            SetupFixture.self,
            named: "project-detect-setup-script.json"
        )
        XCTAssertEqual(fixture.cases.map(\.id), ["omitted-result", "concrete-result"])
        XCTAssertNil(fixture.cases[0].result.setupScript)
        XCTAssertEqual(fixture.cases[1].result.setupScript, "pnpm install")
        XCTAssertEqual(fixture.cases[0].request.projectLocation.kind, .wsl)
        XCTAssertEqual(fixture.cases[1].request.projectLocation.kind, .posix)

        let omitted = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: JSONEncoder().encode(fixture.cases[0].result)
            ) as? [String: Any]
        )
        XCTAssertFalse(omitted.keys.contains("setupScript"))
    }

    func testRouteProjectionBodiesDecodeIntoStableDomainModels() throws {
        let fixture = try ProjectFixtureLoader.decode(
            RouteFixture.self,
            named: "project-route-projections.json"
        )
        let commandCase = try XCTUnwrap(fixture.cases.first { $0.id == "project-command" })
        let command = try ProjectFixtureLoader.decode(
            ProjectCommand.self,
            json: XCTUnwrap(commandCase.body)
        )
        XCTAssertEqual(command, .remove(projectId: "project-remove"))

        let notesCase = try XCTUnwrap(fixture.cases.first { $0.id == "project-notes-write" })
        let notes = try ProjectFixtureLoader.decode(
            ProjectNotesWriteBody.self,
            json: XCTUnwrap(notesCase.body)
        )
        XCTAssertNil(notes.doc)
        XCTAssertEqual(notes.todos.map(\.id), ["todo-route"])
        XCTAssertEqual(notesCase.resolvedPath, "/api/projects/project%20notes/notes")

        let procedureCase = try XCTUnwrap(
            fixture.cases.first { $0.id == "procedure-detect-setup-script" }
        )
        let procedure = try ProjectFixtureLoader.decode(
            ProcedureBody.self,
            json: XCTUnwrap(procedureCase.body)
        )
        XCTAssertEqual(procedure.procedure, "detectSetupScript")
        XCTAssertEqual(procedure.payload.projectLocation.kind, .windows)
        XCTAssertEqual(procedure.payload.projectLocation.hostPath, "C:\\src\\fixture")
    }
}
