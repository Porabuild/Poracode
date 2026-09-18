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
    XCTAssertEqual(existing, .addExisting(path: "/work/existing", name: nil))

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
      name: "Ignored custom name",
      cloneURL: " https://example.test/repo.git "
    ).command()
    XCTAssertEqual(
      cloned,
      .clone(
        parentPath: "/work",
        name: "repo",
        source: .url("https://example.test/repo.git")
      )
    )
  }

  func testCloneFolderNameMatchesCompactPWAURLSemantics() {
    XCTAssertEqual(
      ProjectCloneNaming.folderName(from: "https://github.com/owner/repo.git"),
      "repo"
    )
    XCTAssertEqual(
      ProjectCloneNaming.folderName(from: "git@github.com:owner/repo.git"),
      "repo"
    )
    XCTAssertEqual(
      ProjectCloneNaming.folderName(from: "https://github.com/owner/repo/?ref=main"),
      "repo"
    )
    XCTAssertEqual(ProjectCloneNaming.folderName(from: "   "), "")
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

  func testProjectManagementExcludesSyntheticHomeScopeAndSortsProjects() {
    let projects = ProjectManagementPresentation.selectableProjects([
      fixtureProject(id: "project-z", name: "Zulu"),
      fixtureProject(id: RemoteProject.homeScopeID, name: "Home"),
      fixtureProject(id: "project-a", name: "alpha"),
    ])

    XCTAssertEqual(projects.map(\.id), ["project-a", "project-z"])
  }

  func testNativeNoteSelectionPreservesUTF16TextExactly() {
    let note = "Fix 👋 日本語 test"

    XCTAssertEqual(
      ProjectNoteTextSelection.text(in: note, range: (note as NSString).range(of: "👋 日本語")),
      "👋 日本語"
    )
    XCTAssertEqual(
      ProjectNoteTextSelection.text(in: note, range: NSRange(location: NSNotFound, length: 0)),
      ""
    )
  }

  func testNativeNoteDocumentRoundTripsPWAFormattingMarksAndUnicode() throws {
    let paragraphs = [
      ProjectNoteParagraph(runs: [
        ProjectNoteTextRun(text: "Plain ", formats: []),
        ProjectNoteTextRun(text: "bold 👋", formats: [.bold]),
        ProjectNoteTextRun(text: " and ", formats: []),
        ProjectNoteTextRun(text: "both 日本語", formats: [.bold, .italic]),
      ]),
      ProjectNoteParagraph(runs: [
        ProjectNoteTextRun(text: "italic", formats: [.italic])
      ]),
    ]

    let document = try XCTUnwrap(ProjectNoteDocument.document(from: paragraphs))
    XCTAssertEqual(ProjectNoteDocument.paragraphs(document), paragraphs)
    XCTAssertEqual(ProjectNoteDocument.text(document), "Plain bold 👋 and both 日本語\nitalic")

    let attributedText = ProjectNoteDocument.attributedText(document)
    let attributedDocument = try XCTUnwrap(ProjectNoteDocument.document(from: attributedText))
    XCTAssertEqual(ProjectNoteDocument.paragraphs(attributedDocument), paragraphs)
  }

  func testNativeNoteDocumentPreservesEmptyAndHardBreakSemantics() throws {
    XCTAssertNil(ProjectNoteDocument.fromText(""))

    let document: JSONValue = .object([
      "type": .string("doc"),
      "content": .array([
        .object([
          "type": .string("paragraph"),
          "content": .array([
            .object(["type": .string("text"), "text": .string("first")]),
            .object(["type": .string("hardBreak")]),
            .object(["type": .string("text"), "text": .string("second")]),
          ]),
        ])
      ]),
    ])

    XCTAssertEqual(ProjectNoteDocument.text(document), "first\nsecond")
    XCTAssertEqual(ProjectNoteDocument.attributedText(document).string, "first\nsecond")
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

  func testNativeWorktreeDraftProjectsEveryPWAField() {
    let project = RemoteProject(
      id: "project-1",
      name: "Project",
      location: .posix(path: "/work/project"),
      scripts: ProjectScripts(
        setupScript: "pnpm install",
        cleanupScript: "rm -rf node_modules",
        worktreeCopyPatterns: [".env", ".env.*"],
        actions: []
      ),
      worktreeLocation: ProjectWorktreeLocation(mode: .global, basePath: "/worktrees"),
      createdAt: "2026-08-22T00:00:00Z"
    )

    let draft = ProjectWorktreeSettingsDraft(project: project)

    XCTAssertEqual(draft.location, .custom)
    XCTAssertEqual(draft.basePath, "/worktrees")
    XCTAssertEqual(draft.setupScript, "pnpm install")
    XCTAssertEqual(draft.cleanupScript, "rm -rf node_modules")
    XCTAssertEqual(draft.copyPatterns, ".env\n.env.*")
  }

  func testNativeProjectSearchChoicePreservesInheritanceAndExplicitOverrides() {
    XCTAssertEqual(ProjectIgnoreFilesChoice(nil), .inherit)
    XCTAssertNil(ProjectIgnoreFilesChoice(nil).value)
    XCTAssertEqual(ProjectIgnoreFilesChoice(true), .enabled)
    XCTAssertEqual(ProjectIgnoreFilesChoice(true).value, true)
    XCTAssertEqual(ProjectIgnoreFilesChoice(false), .disabled)
    XCTAssertEqual(ProjectIgnoreFilesChoice(false).value, false)
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

  private func fixtureProject(
    id: String = "project-1",
    name: String = "Original"
  ) -> RemoteProject {
    RemoteProject(
      id: id,
      name: name,
      location: .posix(path: "/work/original"),
      createdAt: "2026-08-12T00:00:00Z"
    )
  }
}
