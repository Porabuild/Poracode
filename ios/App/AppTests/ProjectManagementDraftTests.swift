import XCTest
@testable import App

final class ProjectManagementDraftTests: XCTestCase {
  func testCreationDraftBuildsAllThreeCommandsWithTrimmedValues() throws {
    let existing = try ProjectCreationDraft(
      kind: .addExisting,
      path: "\u{FEFF}/work/existing ",
      name: " Example ",
      cloneURL: ""
    ).command()
    XCTAssertEqual(existing, .addExisting(path: "/work/existing", name: "Example"))

    let created = try ProjectCreationDraft(
      kind: .create,
      path: "/work",
      name: " New App ",
      cloneURL: ""
    ).command()
    XCTAssertEqual(created, .create(parentPath: "/work", name: "New App"))

    let cloned = try ProjectCreationDraft(
      kind: .clone,
      path: "/work",
      name: "Repo",
      cloneURL: " https://example.test/repo.git "
    ).command()
    XCTAssertEqual(
      cloned,
      .clone(
        parentPath: "/work",
        name: "Repo",
        source: .url("https://example.test/repo.git")
      )
    )
  }

  func testCreationDraftRejectsUnsafeInputsBeforeTransport() {
    XCTAssertThrowsError(
      try ProjectCreationDraft(kind: .create, path: "", name: "Name", cloneURL: "").command()
    ) { XCTAssertEqual($0 as? ProjectDraftError, .pathRequired) }
    XCTAssertThrowsError(
      try ProjectCreationDraft(kind: .create, path: "/work", name: "..", cloneURL: "").command()
    ) { XCTAssertEqual($0 as? ProjectDraftError, .invalidName(.reservedDotName)) }
    XCTAssertThrowsError(
      try ProjectCreationDraft(
        kind: .clone,
        path: "/work",
        name: "Repo",
        cloneURL: "ext::payload"
      ).command()
    ) { XCTAssertEqual($0 as? ProjectDraftError, .invalidCloneURL) }
  }

  func testEditDraftKeepsRelocateAndPatchAsSeparateCommands() throws {
    let project = fixtureProject()
    var draft = ProjectEditDraft(project: project)
    draft.name = "Renamed"
    draft.path = "/work/moved"
    draft.disabled = true

    let commands = try draft.commands()
    XCTAssertEqual(commands.count, 2)
    XCTAssertEqual(
      commands[0],
      .update(
        projectId: "project-1",
        patch: ProjectPatch(name: .set("Renamed"), disabled: .set(true))
      )
    )
    XCTAssertEqual(commands[1], .relocate(projectId: "project-1", path: "/work/moved"))
  }

  func testEditDraftRejectsNoOp() {
    XCTAssertThrowsError(try ProjectEditDraft(project: fixtureProject()).commands()) {
      XCTAssertEqual($0 as? ProjectDraftError, .noChanges)
    }
  }

  func testNoteEditingPreservesOrderAndTypedIdentity() {
    let first = ProjectNoteTodo(id: "1", text: "First", done: false, createdAt: "now")
    let second = ProjectNoteTodo(id: "2", text: "Second", done: false, createdAt: "now")
    let toggled = ProjectNoteEditing.toggling(first, in: [first, second])
    XCTAssertEqual(toggled.map(\.id), ["1", "2"])
    XCTAssertTrue(toggled[0].done)
    XCTAssertFalse(toggled[1].done)

    let added = ProjectNoteEditing.adding(
      text: " New task ",
      to: toggled,
      now: "later",
      id: "3"
    )
    XCTAssertEqual(added.map(\.id), ["1", "2", "3"])
    XCTAssertEqual(added.last?.text, "New task")
    XCTAssertEqual(ProjectNoteEditing.deleting(second, from: added).map(\.id), ["1", "3"])
  }

  private func fixtureProject() -> RemoteProject {
    RemoteProject(
      id: "project-1",
      name: "Original",
      location: .posix(path: "/work/original"),
      createdAt: "2026-08-12T00:00:00Z"
    )
  }
}
