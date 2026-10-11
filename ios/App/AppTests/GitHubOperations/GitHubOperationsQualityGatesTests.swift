import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

final class GitHubOperationsQualityGatesTests: XCTestCase {
  func testProjectGitSurfaceOffersPrefilledCreatePullRequestAction() throws {
    let root = gitHubRepositoryRoot()
    let workspace = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectGitWorkspaceViews.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(workspace.contains("project.git.createPullRequest"))
    XCTAssertTrue(workspace.contains("initialBranch: controller.status.value?.branch"))
    XCTAssertTrue(workspace.contains("authoritative.sourceBranch?.sourceBranch ?? \"main\""))
    XCTAssertTrue(workspace.contains("status.ahead == 0"))
    XCTAssertTrue(workspace.contains("!status.tracking.isEmpty"))
    XCTAssertTrue(workspace.contains("hasActivePullRequest"))
    XCTAssertTrue(workspace.contains("await gitHubControllers.pullRequestMutations.submit"))
    XCTAssertTrue(workspace.contains("runCreationMode(currentCreationMode)"))
    XCTAssertTrue(workspace.contains("createPullRequestAutomatically"))
    XCTAssertTrue(workspace.contains("generatePullRequestSummary(status.branch, baseBranch)"))

    let form = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/GitHubOperations/GitHubOperationForm.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(form.contains("initialBranch: String = \"\""))
    XCTAssertTrue(form.contains("branch = initialBranch"))

    let session = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectWorkspaceSessionView.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(session.contains("settings.commitGenProvider"))
    XCTAssertTrue(session.contains("AdvancedOperationRequest.generatePrSummary"))
    XCTAssertTrue(session.contains("prGenerationComposition.gateway.call"))
    XCTAssertTrue(session.contains("settingsSelection.lease.connectionID =="))
  }

  func testCreatePullRequestModeDefaultsToDialogAndUsesVersionedStorage() {
    XCTAssertEqual(GitHubPullRequestCreationMode.resolved("unknown"), .dialog)
    XCTAssertEqual(GitHubPullRequestCreationMode.resolved("auto"), .auto)
    XCTAssertTrue(GitHubPullRequestCreationMode.storageKey.hasSuffix(".v1"))
  }

  #if canImport(App)
    func testActionsCompactParityFiltersInactiveWorkflowsAndPollsLiveRuns() {
      let active = GitHubWorkflowSummary(id: 1, name: "Build", path: "build.yml", state: "ACTIVE")
      let disabled = GitHubWorkflowSummary(
        id: 2,
        name: "Legacy",
        path: "legacy.yml",
        state: "disabled_manually"
      )
      XCTAssertEqual(GitHubWorkflowPinPresentation.active([disabled, active]), [active])

      let now = Date(timeIntervalSince1970: 100)
      XCTAssertFalse(
        GitHubActionsPollingPolicy.shouldPoll(
          runs: [workflowRun(status: "completed")],
          dispatchDiscoveryDeadline: nil,
          now: now
        )
      )
      XCTAssertTrue(
        GitHubActionsPollingPolicy.shouldPoll(
          runs: [workflowRun(status: "in_progress")],
          dispatchDiscoveryDeadline: nil,
          now: now
        )
      )
      XCTAssertTrue(
        GitHubActionsPollingPolicy.shouldPoll(
          runs: [],
          dispatchDiscoveryDeadline: now.addingTimeInterval(1),
          now: now
        )
      )
      XCTAssertFalse(
        GitHubActionsPollingPolicy.shouldPoll(
          runs: [],
          dispatchDiscoveryDeadline: now,
          now: now
        )
      )
      XCTAssertEqual(GitHubActionsPollingPolicy.interval, 5)
      XCTAssertEqual(GitHubActionsPollingPolicy.dispatchDiscoveryTimeout, 30)
    }
  #endif

  func testUIActionMappingAndGatingCoverExactly27Procedures() {
    let actions = GitHubOperationsPresentation.actions
    XCTAssertEqual(actions.count, 27)
    XCTAssertEqual(Set(actions.map(\.procedure)), Set(GitHubProcedure.allCases))
    XCTAssertEqual(actions.filter { $0.role == .destructive }.count, 4)

    let noSelection = GitHubActionGating(
      grantedScopes: ["session:read"],
      isAvailable: true,
      hasBranch: false,
      hasAccount: false,
      hasPullRequest: false,
      hasWorkflow: false,
      hasWorkflowRun: false
    )
    XCTAssertTrue(noSelection.permits(actions.first { $0.procedure == .ghListPullRequests }!))
    XCTAssertFalse(noSelection.permits(actions.first { $0.procedure == .ghMergePr }!))
    XCTAssertFalse(noSelection.permits(actions.first { $0.procedure == .ghGetPrDetails }!))
  }

  func testCatalogHasParityAndRealTranslations() throws {
    let url = gitHubRepositoryRoot().appendingPathComponent(
      "ios/App/App/Features/Projects/GitHubOperations/GitHubOperations.xcstrings"
    )
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    let locales = Set([
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi",
      "zh-Hans",
    ])
    XCTAssertTrue(Set(GitHubProcedure.allCases.map(\.rawValue)).isSubset(of: Set(strings.keys)))

    for (key, rawEntry) in strings {
      let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, rawLocalization) in localizations {
        let localization = try XCTUnwrap(rawLocalization as? [String: Any])
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any])
        let value = try XCTUnwrap(unit["value"] as? String)
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key) \(locale)")
        XCTAssertFalse(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }

  func testProductionSourceSizeAndNoRawVisibleStrings() throws {
    let root = gitHubRepositoryRoot()
    for relative in [
      "ios/App/App/Features/Projects/GitHubOperations",
      "ios/App/App/Transport/Projects/GitHubOperations",
    ] {
      let files = try FileManager.default.contentsOfDirectory(
        at: root.appendingPathComponent(relative),
        includingPropertiesForKeys: nil
      ).filter { $0.pathExtension == "swift" }
      for file in files {
        let source = try String(contentsOf: file, encoding: .utf8)
        let lines = source.split(separator: "\n", omittingEmptySubsequences: false).count
        XCTAssertLessThan(lines, 500, file.lastPathComponent)
        if file.lastPathComponent != "GitHubOperationsStrings.swift" {
          let pattern = #"(?:Text|Button|Label|ContentUnavailableView)\(\s*\"[A-Za-z]"#
          XCTAssertNil(
            try NSRegularExpression(pattern: pattern).firstMatch(
              in: source,
              range: NSRange(source.startIndex..., in: source)
            ), file.lastPathComponent)
        }
      }
    }
  }

  func testSwiftPMHarnessExplicitlyIncludesEveryTestFile() throws {
    let directory = gitHubRepositoryRoot().appendingPathComponent(
      "ios/App/AppTests/GitHubOperations"
    )
    let manifest = try String(
      contentsOf: directory.appendingPathComponent("Package.swift"),
      encoding: .utf8
    )
    let tests = try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil
    ).filter {
      $0.pathExtension == "swift" && $0.lastPathComponent != "Package.swift"
        && $0.lastPathComponent != "GitHubOperationsIntegrationTests.swift"
    }
    for test in tests {
      XCTAssertTrue(manifest.contains("\"\(test.lastPathComponent)\""), test.lastPathComponent)
    }

    for link in ["Feature", "Transport", "Generated"] {
      let values =
        try directory
        .appendingPathComponent("PackageSources/GitHubOperations/\(link)")
        .resourceValues(forKeys: [.isSymbolicLinkKey])
      XCTAssertEqual(values.isSymbolicLink, true, link)
    }
  }

  #if canImport(App)
    private func workflowRun(status: String) -> GitHubWorkflowRun {
      GitHubWorkflowRun(
        id: 1,
        workflowId: 2,
        workflowName: "Build",
        name: "Build",
        number: 3,
        attempt: 1,
        title: "Build",
        event: "push",
        headBranch: "main",
        headSha: "abcdef0",
        status: status,
        conclusion: status == "completed" ? "success" : "",
        createdAt: "2026-08-22T00:00:00Z",
        startedAt: "2026-08-22T00:00:00Z",
        updatedAt: "2026-08-22T00:00:00Z",
        url: "https://example.com",
        jobs: []
      )
    }
  #endif
}
