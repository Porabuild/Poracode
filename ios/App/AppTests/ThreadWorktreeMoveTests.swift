import Foundation
import XCTest

@testable import App

final class ThreadWorktreeMoveTests: XCTestCase {
  func testWithChangesPlanMovesInsteadOfCopiesUncommittedChanges() {
    let plan = ThreadWorktreeMovePlan(
      thread: thread(status: "idle"),
      project: project(location: .posix(path: "/repo", remoteServerId: "desktop")),
      branch: "poracode/mobile-abcdef",
      sourceBranch: "main",
      mode: .withChanges
    )

    XCTAssertTrue(plan.wasActive)
    XCTAssertEqual(plan.addWorktreeRequest.branch, "poracode/mobile-abcdef")
    XCTAssertEqual(plan.addWorktreeRequest.startPoint, "main")
    XCTAssertEqual(plan.addWorktreeRequest.createBranch, true)
    XCTAssertEqual(plan.addWorktreeRequest.transferUncommitted, true)
    XCTAssertEqual(plan.addWorktreeRequest.keepChangesInSource, false)
  }

  func testCleanPlanLeavesTransferFieldsAbsent() {
    let plan = ThreadWorktreeMovePlan(
      thread: thread(status: "inactive"),
      project: project(location: .posix(path: "/repo")),
      branch: "poracode/mobile-abcdef",
      sourceBranch: nil,
      mode: .clean
    )

    XCTAssertFalse(plan.wasActive)
    XCTAssertNil(plan.addWorktreeRequest.transferUncommitted)
    XCTAssertNil(plan.addWorktreeRequest.keepChangesInSource)
  }

  func testRestartUsesTheNewWSLWorktreeAndPreservesLaunchConfiguration() {
    let plan = ThreadWorktreeMovePlan(
      thread: thread(status: "idle"),
      project: project(
        location: .wsl(
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: #"\\wsl.localhost\Ubuntu\repo"#,
          remoteServerId: "desktop"
        )
      ),
      branch: "poracode/mobile-abcdef",
      sourceBranch: "main",
      mode: .clean
    )

    let request = plan.restartRequest(worktreePath: "/repo/.poracode/worktrees/mobile")

    XCTAssertEqual(request.threadID, "thread-1")
    XCTAssertEqual(request.agentKind, "codex")
    XCTAssertEqual(request.config.model, "gpt-5")
    XCTAssertNil(request.prompt)
    XCTAssertEqual(request.presentationMode, .gui)
    XCTAssertEqual(
      request.projectLocation,
      .wsl(
        distro: "Ubuntu",
        linuxPath: "/repo/.poracode/worktrees/mobile",
        uncPath: #"\\wsl.localhost\Ubuntu\repo\.poracode\worktrees\mobile"#,
        remoteServerID: "desktop"
      )
    )
  }

  func testGeneratedBranchUsesTheNativeMobileNamespace() {
    let id = UUID(uuidString: "ABCDEF12-3456-7890-ABCD-EF1234567890")!
    XCTAssertEqual(ThreadWorktreeBranchName.generate(id: id), "poracode/mobile-abcdef")
  }

  func testThreadMenuCoordinatesEveryMoveStepAndOffersBothModes() throws {
    let menu = try Self.source("App/Features/Threads/ThreadDetailActionMenu.swift")
    let menuContent = try Self.source(
      "App/Features/Threads/Components/ThreadDetailActionMenuContent.swift"
    )
    let controller = try Self.source(
      "App/Features/Threads/ThreadWorktreeMoveController.swift"
    )

    XCTAssertTrue(menuContent.contains("moveToWorktreeWithChanges"))
    XCTAssertTrue(menuContent.contains("moveToCleanWorktree"))
    XCTAssertTrue(menu.contains("confirmMoveToWorktree"))
    XCTAssertTrue(controller.contains("await suite.conversation.close()"))
    XCTAssertTrue(controller.contains("await git.submit(.gitAddWorktree"))
    XCTAssertTrue(controller.contains("await lifecycle.setWorktree("))
    XCTAssertTrue(controller.contains("await lifecycle.start("))
  }

  func testThreadActionStringsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let keys = [
      "thread.lifecycle.newInWorktree",
      "thread.lifecycle.removeFromGroup",
      "thread.lifecycle.moveWorktree.withChanges",
      "thread.lifecycle.moveWorktree.clean",
      "thread.lifecycle.moveWorktree.title",
      "thread.lifecycle.moveWorktree.withChanges.message",
      "thread.lifecycle.moveWorktree.clean.message",
      "thread.lifecycle.moveWorktree.confirm",
      "thread.status.launching",
      "thread.status.inactive",
      "thread.status.error",
      "thread.status.finished",
      "thread.status.needsApproval",
      "thread.status.needsReply",
      "thread.status.working",
      "thread.status.idle",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/ThreadLifecycle.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    for key in keys {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)"
        )
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  private func thread(status: String) -> RemoteThread {
    RemoteThread(
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "codex",
      config: ThreadConfig(model: "gpt-5", effort: "high"),
      status: status,
      attention: "none",
      presentationMode: "gui",
      createdAt: "2026-08-22T00:00:00Z",
      updatedAt: "2026-08-22T00:00:00Z"
    )
  }

  private func project(location: ProjectLocation) -> RemoteProject {
    RemoteProject(
      id: "project-1",
      name: "Project",
      location: location,
      createdAt: "2026-08-22T00:00:00Z"
    )
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
