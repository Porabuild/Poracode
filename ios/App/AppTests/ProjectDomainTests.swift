import XCTest

@testable import App

final class ProjectDomainTests: XCTestCase {
    private struct ResponseFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var response: ProjectCommandResult
        }

        var cases: [Entry]
    }

    func testCommandResponsesCoverAllLocationsAndAffectedProjectOptionality() throws {
        let fixture = try ProjectFixtureLoader.decode(
            ResponseFixture.self,
            named: "project-command-responses.json"
        )
        XCTAssertEqual(
            fixture.cases.map(\.id), ["with-affected-project", "without-affected-project"])
        let withProject = fixture.cases[0].response
        XCTAssertEqual(withProject.projects.map(\.location.kind), [.windows, .posix])
        XCTAssertEqual(withProject.project, withProject.projects[1])
        XCTAssertEqual(withProject.project?.workspaceId, "workspace-1")
        XCTAssertEqual(withProject.project?.disabled, false)
        XCTAssertNotNil(withProject.project?.lastDraftConfig)
        XCTAssertEqual(withProject.project?.scripts?.actions.map(\.id), ["test"])
        XCTAssertEqual(withProject.project?.searchSettings?.exclude, ["dist/**": true])
        XCTAssertEqual(withProject.project?.worktreeLocation?.basePath, "/Volumes/worktrees/東京")

        let withoutProject = fixture.cases[1].response
        XCTAssertNil(withoutProject.project)
        XCTAssertEqual(withoutProject.projects.map(\.location.kind), [.wsl])
        guard
            case .wsl(let distro, let linuxPath, let uncPath, let remoteServerId) =
                withoutProject.projects[0].location
        else {
            return XCTFail("Expected WSL location")
        }
        XCTAssertEqual(distro, "Ubuntu-24.04")
        XCTAssertEqual(linuxPath, "/home/zoë/项目")
        XCTAssertEqual(uncPath, "\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目")
        XCTAssertEqual(remoteServerId, "location-host-wsl")
    }

    func testWSLDisplayAndHostPathsRemainDistinctAndOpaque() throws {
        let location = ProjectLocation.wsl(
            distro: "Ubuntu-24.04",
            linuxPath: "/home/zoë/项目/../opaque",
            uncPath: "\\\\wsl$\\Ubuntu-24.04\\home\\zoë\\项目\\..\\opaque",
            remoteServerId: "server"
        )
        XCTAssertEqual(location.displayPath, "/home/zoë/项目/../opaque")
        XCTAssertEqual(location.hostPath, "\\\\wsl$\\Ubuntu-24.04\\home\\zoë\\项目\\..\\opaque")
        XCTAssertEqual(location.path, location.hostPath)

        let roundTrip = try JSONDecoder().decode(
            ProjectLocation.self,
            from: JSONEncoder().encode(location)
        )
        XCTAssertEqual(roundTrip, location)
    }

    func testHostAndProjectPairFormCollisionFreeStableIdentity() throws {
        let firstHost = try XCTUnwrap(
            ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")
        )
        let secondHost = try XCTUnwrap(
            ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")
        )
        let first = ProjectIdentity(connectionId: firstHost, projectId: "same:project/id")
        let second = ProjectIdentity(connectionId: secondHost, projectId: "same:project/id")

        XCTAssertNotEqual(first, second)
        XCTAssertNotEqual(first.id, second.id)
        XCTAssertEqual(first.id.decode()?.connectionId, firstHost)
        XCTAssertEqual(first.id.decode()?.remoteId, "same:project/id")
        XCTAssertEqual(
            try JSONDecoder().decode(ProjectIdentity.self, from: JSONEncoder().encode(first)),
            first
        )
    }

    func testLocationDecoderRejectsUnknownKindsAndMissingWSLCoordinates() {
        XCTAssertThrowsError(
            try JSONDecoder().decode(
                ProjectLocation.self,
                from: Data(#"{"kind":"local","path":"/tmp"}"#.utf8)
            )
        )
        XCTAssertThrowsError(
            try JSONDecoder().decode(
                ProjectLocation.self,
                from: Data(#"{"kind":"wsl","distro":"Ubuntu","linuxPath":"/tmp"}"#.utf8)
            )
        )
    }

    @MainActor
    func testProjectSyncPreferencesTreatsPreFeatureStateAsSyncedAndPersistsExclusions() throws {
        let suiteName = "poracode.tests.project-sync.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let connectionID = try XCTUnwrap(
            ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")
        )

        let initial = ProjectSyncPreferences(defaults: defaults)
        XCTAssertTrue(initial.isSynced(connectionID: connectionID, projectID: "project"))

        initial.setSynced(false, connectionID: connectionID, projectID: "project")
        let reloaded = ProjectSyncPreferences(defaults: defaults)
        XCTAssertFalse(reloaded.isSynced(connectionID: connectionID, projectID: "project"))

        reloaded.setSynced(true, connectionID: connectionID, projectID: "project")
        XCTAssertTrue(
            ProjectSyncPreferences(defaults: defaults)
                .isSynced(connectionID: connectionID, projectID: "project")
        )
    }

    @MainActor
    func testProjectSyncPreferencesKeepsHostChoicesIndependent() throws {
        let suiteName = "poracode.tests.project-sync.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let firstHost = try XCTUnwrap(
            ClientConnectionID(rawValue: "11111111-1111-4111-8111-111111111111")
        )
        let secondHost = try XCTUnwrap(
            ClientConnectionID(rawValue: "22222222-2222-4222-8222-222222222222")
        )
        let preferences = ProjectSyncPreferences(defaults: defaults)

        preferences.setSynced(false, connectionID: firstHost, projectID: "shared-id")

        XCTAssertFalse(preferences.isSynced(connectionID: firstHost, projectID: "shared-id"))
        XCTAssertTrue(preferences.isSynced(connectionID: secondHost, projectID: "shared-id"))
    }
}
