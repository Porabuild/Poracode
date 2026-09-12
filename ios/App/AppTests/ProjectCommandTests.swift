import XCTest

@testable import App

final class ProjectCommandTests: XCTestCase {
    private struct CommandFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var request: ProjectCommand
        }

        var cases: [Entry]
    }

    private struct PatchFixture: Decodable {
        struct Entry: Decodable {
            var id: String
            var field: String?
            var state: String?
            var request: JSONValue
        }

        var accepted: [Entry]
        var rejected: [Entry]
    }

    func testDecodesEveryProjectCommandAndBothCloneSources() throws {
        let fixture = try ProjectFixtureLoader.decode(
            CommandFixture.self,
            named: "project-command-requests.json"
        )
        XCTAssertEqual(fixture.cases.count, 7)

        let variants = fixture.cases.map { entry -> String in
            switch entry.request {
            case .addExisting: "add-existing"
            case .create: "create"
            case .clone(_, _, .url(_)): "clone:url"
            case .clone(_, _, .github(_, _)): "clone:github"
            case .update: "update"
            case .relocate: "relocate"
            case .remove: "remove"
            }
        }
        XCTAssertEqual(
            variants,
            ["add-existing", "create", "clone:url", "clone:github", "update", "relocate", "remove"]
        )

        for entry in fixture.cases {
            let encoded = try JSONEncoder().encode(entry.request)
            XCTAssertNoThrow(try JSONDecoder().decode(ProjectCommand.self, from: encoded), entry.id)
        }
    }

    func testPatchPreservesMissingNullAndConcreteEmptyCollections() throws {
        let fixture = try ProjectFixtureLoader.decode(
            PatchFixture.self,
            named: "project-update-semantics.json"
        )
        XCTAssertEqual(fixture.accepted.count, 11)

        var patches: [String: ProjectPatch] = [:]
        for entry in fixture.accepted {
            let command = try ProjectFixtureLoader.decode(ProjectCommand.self, json: entry.request)
            guard case .update(_, let patch) = command else {
                return XCTFail("Expected update for \(entry.id)")
            }
            patches[entry.id] = patch
        }

        let missing = try XCTUnwrap(patches["all-missing"])
        XCTAssertTrue(missing.name.isUnchanged)
        XCTAssertTrue(missing.scripts.isUnchanged)
        XCTAssertTrue(missing.searchSettings.isUnchanged)
        XCTAssertTrue(missing.worktreeLocation.isUnchanged)
        XCTAssertTrue(missing.mcpServers.isUnchanged)
        XCTAssertTrue(missing.disabled.isUnchanged)
        XCTAssertEqual(patches["scripts-null"]?.scripts, .clear)
        XCTAssertEqual(patches["search-settings-null"]?.searchSettings, .clear)
        XCTAssertEqual(patches["worktree-location-null"]?.worktreeLocation, .clear)
        XCTAssertEqual(patches["mcp-servers-null"]?.mcpServers, .clear)

        guard case .set(let scripts)? = patches["scripts-value-empty-list"]?.scripts else {
            return XCTFail("Expected scripts value")
        }
        XCTAssertEqual(scripts.actions, [])
        guard case .set(let search)? = patches["search-settings-value-empty-map"]?.searchSettings
        else {
            return XCTFail("Expected search settings value")
        }
        XCTAssertEqual(search.exclude, [:])
        guard
            case .set(let worktree)? = patches["worktree-location-value-empty-map"]?
                .worktreeLocation
        else {
            return XCTFail("Expected worktree value")
        }
        XCTAssertNil(worktree.mode)
        XCTAssertNil(worktree.basePath)
        XCTAssertEqual(patches["mcp-servers-value-empty-list"]?.mcpServers, .set([]))
    }

    func testPatchRejectsNullForNonnullableFields() throws {
        let fixture = try ProjectFixtureLoader.decode(
            PatchFixture.self,
            named: "project-update-semantics.json"
        )
        XCTAssertEqual(fixture.rejected.map(\.id), ["name-null", "disabled-null"])
        for entry in fixture.rejected {
            XCTAssertThrowsError(
                try ProjectFixtureLoader.decode(ProjectCommand.self, json: entry.request),
                entry.id
            )
        }
    }

    func testPatchEncodingOmitsUnchangedAndKeepsClearAndEmptyValues() throws {
        let patch = ProjectPatch(
            scripts: .clear,
            searchSettings: .set(.init(useIgnoreFiles: nil, exclude: [:])),
            worktreeLocation: .set(.init(mode: nil, basePath: nil)),
            mcpServers: .set([]),
            disabled: .set(false)
        )
        let encoded = try JSONEncoder().encode(patch)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        XCTAssertFalse(object.keys.contains("name"))
        XCTAssertTrue(object["scripts"] is NSNull)
        XCTAssertEqual((object["mcpServers"] as? [Any])?.count, 0)
        XCTAssertEqual(object["disabled"] as? Bool, false)
        XCTAssertEqual(
            (object["searchSettings"] as? [String: Any])?["exclude"] as? [String: Bool], [:])
        XCTAssertEqual((object["worktreeLocation"] as? [String: Any])?.count, 0)
    }

    func testProjectNameValidationUsesJSTrimAndUTF16Length() {
        XCTAssertNil(ProjectValidation.projectNameError("\u{FEFF}valid\u{3000}"))
        XCTAssertEqual(ProjectValidation.projectNameError("\u{FEFF}\u{3000}"), .empty)
        XCTAssertEqual(ProjectValidation.projectNameError(" . "), .reservedDotName)
        XCTAssertEqual(ProjectValidation.projectNameError(" .. "), .reservedDotName)
        for character in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"] {
            XCTAssertEqual(
                ProjectValidation.projectNameError("bad\(character)name"), .illegalCharacter)
        }
        XCTAssertNil(ProjectValidation.projectNameError(String(repeating: "🚀", count: 127) + "x"))
        XCTAssertEqual(
            ProjectValidation.projectNameError(String(repeating: "🚀", count: 128)),
            .tooLong
        )
    }

    func testCloneURLTransportAllowlistAndInjectionRejections() {
        for value in [
            "https://github.com/example/repo.git",
            "http://example.test/repo",
            "ssh://git@example.test/repo",
            "git://example.test/repo",
            "ftp://example.test/repo",
            "ftps://example.test/repo",
            "git@example.test:owner/repo.git",
            "\u{FEFF}https://example.test/repo\u{3000}",
        ] {
            XCTAssertTrue(ProjectValidation.isSafeCloneURL(value), value)
        }
        for value in [
            "", "--upload-pack=touch", "file:///etc/passwd", "file:/etc/passwd",
            "gopher://example.test/repo", "ext::sh -c evil", "fd::17", "::helper", "relative/path",
        ] {
            XCTAssertFalse(ProjectValidation.isSafeCloneURL(value), value)
        }
    }
}
