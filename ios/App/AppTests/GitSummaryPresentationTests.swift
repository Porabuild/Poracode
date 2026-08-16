import XCTest

@testable import App

/// The thread-row Git surface consumes only authoritative cached summaries and
/// renders nothing when none exists.
final class GitSummaryPresentationTests: XCTestCase {
  private func fixtureSummaries() throws -> [String: GitThreadSummary] {
    let root = try remoteFixtureObject("replayable-state-events.json")
    for entry in try fixtureArray(root["events"]) {
      let object = try fixtureObject(entry)
      guard try fixtureString(object["id"]) == "remote-git-summaries" else { continue }
      let event = try fixtureObject(object["event"])
      return try GitThreadSummary.map(wire: try XCTUnwrap(event["summaries"]))
    }
    throw CocoaError(.fileNoSuchFile)
  }

  func testRepositoryThreadShowsBranchChangesDivergenceAndPullRequest() throws {
    let summaries = try fixtureSummaries()
    let presentation = ThreadGitSummaryPresentation(summary: summaries["thread-gui-1"])
    XCTAssertFalse(presentation.isEmpty)
    XCTAssertEqual(presentation.branch, GitSummaryStrings.branch("feature/native-parity"))
    XCTAssertEqual(
      presentation.changes, GitSummaryStrings.changes(insertions: 42, deletions: 7)
    )
    XCTAssertEqual(presentation.divergence, GitSummaryStrings.divergence(ahead: 2, behind: 1))
    XCTAssertEqual(presentation.pullRequestLabel, GitSummaryStrings.pullRequest(314))
    XCTAssertEqual(presentation.pullRequestState, .open)
  }

  func testNonRepositoryThreadRendersNothing() throws {
    let summaries = try fixtureSummaries()
    let presentation = ThreadGitSummaryPresentation(summary: summaries["thread-terminal-1"])
    XCTAssertTrue(presentation.isEmpty)
    XCTAssertNil(presentation.branch)
    XCTAssertNil(presentation.pullRequestLabel)
  }

  func testMissingSummaryRendersNothingRatherThanAPlaceholder() {
    let presentation = ThreadGitSummaryPresentation(summary: nil)
    XCTAssertTrue(presentation.isEmpty)
  }

  func testCleanRepositorySuppressesChangeAndDivergenceRows() throws {
    let summary = try GitThreadSummary(
      wire: .object([
        "isRepo": .bool(true), "branch": .string("main"), "totalInsertions": .number(0),
        "totalDeletions": .number(0), "ahead": .number(0), "behind": .number(0), "pr": .null,
      ])
    )
    let presentation = ThreadGitSummaryPresentation(summary: summary)
    XCTAssertEqual(presentation.branch, GitSummaryStrings.branch("main"))
    XCTAssertNil(presentation.changes)
    XCTAssertNil(presentation.divergence)
    XCTAssertNil(presentation.pullRequestLabel)
    XCTAssertFalse(presentation.isEmpty)
  }

  func testEveryPullRequestStateHasALocalizedLabel() {
    for state in GitThreadSummary.PullRequest.State.allCases {
      let label = GitSummaryStrings.state(state)
      XCTAssertFalse(label.isEmpty)
      XCTAssertFalse(
        label.hasPrefix("workspace.git."), "\(state) is missing a String Catalog entry"
      )
    }
  }

  func testStringCatalogCarriesEveryNewKeyInEveryLocale() throws {
    let catalog = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/ProjectWorkspace.xcstrings")
    let root = try JSONDecoding.decode(JSONValue.self, from: try Data(contentsOf: catalog))
    let strings = try fixtureObject(root["strings"])
    let reference = try XCTUnwrap(strings["workspace.git.branch"]?["localizations"]?.objectValue)
    let locales = Set(reference.keys)
    XCTAssertTrue(locales.count >= 13, "expected the full locale set, found \(locales.count)")
    for key in [
      "workspace.git.pr.format", "workspace.git.pr.state.open",
      "workspace.git.pr.state.draft", "workspace.git.pr.state.merged",
      "workspace.git.pr.state.closed",
    ] {
      let entry = try XCTUnwrap(strings[key]?["localizations"]?.objectValue, key)
      XCTAssertEqual(Set(entry.keys), locales, key)
      for (locale, value) in entry {
        let unit = try XCTUnwrap(value["stringUnit"]?.objectValue, "\(key)/\(locale)")
        XCTAssertEqual(unit["state"]?.stringValue, "translated", "\(key)/\(locale)")
        XCTAssertFalse(
          (unit["value"]?.stringValue ?? "").isEmpty, "\(key)/\(locale) is untranslated"
        )
      }
    }
  }
}
