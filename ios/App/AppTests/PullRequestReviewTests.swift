import Foundation
import XCTest

@testable import App

final class PullRequestReviewTests: XCTestCase {
  func testProjectsTypedReviewDetailsFilesAndConversation() throws {
    let details = try document(
      """
      {
        "details": {
          "number": 42,
          "title": "Ship native review",
          "body": "Review inside the app.",
          "author": { "login": "octocat" },
          "baseBranch": "main",
          "headBranch": "native-review",
          "additions": 14,
          "deletions": 3,
          "changedFiles": 2,
          "commits": [{
            "oid": "abcdef123456",
            "abbreviatedOid": "abcdef1",
            "messageHeadline": "Add review page",
            "authoredDate": "2026-08-22T00:00:00Z"
          }],
          "comments": [],
          "reviews": [],
          "checks": [{
            "name": "tests",
            "state": "COMPLETED",
            "conclusion": "success"
          }]
        }
      }
      """
    )
    let files = try document(
      """
      { "files": [{ "path": "Sources/Review.swift", "additions": 14, "deletions": 3 }] }
      """
    )
    let conversation = try document(
      """
      {
        "comments": [{
          "id": "comment-1",
          "author": { "login": "reviewer" },
          "body": "Looks good.",
          "createdAt": "2026-08-22T01:00:00Z"
        }],
        "threads": []
      }
      """
    )

    let projected = try XCTUnwrap(PullRequestReviewProjection.details(details))
    XCTAssertEqual(projected.number, 42)
    XCTAssertEqual(projected.author?.login, "octocat")
    XCTAssertEqual(projected.commits.map(\.abbreviatedOID), ["abcdef1"])
    XCTAssertEqual(projected.checks.map(\.name), ["tests"])
    XCTAssertEqual(PullRequestReviewProjection.files(files).map(\.path), ["Sources/Review.swift"])
    XCTAssertEqual(
      PullRequestReviewProjection.conversation(conversation).comments.map(\.body),
      ["Looks good."]
    )
  }

  func testUnifiedDiffSelectsTheRequestedFileChunk() {
    let diff = """
      diff --git a/one.swift b/one.swift
      --- a/one.swift
      +++ b/one.swift
      +one
      diff --git a/two.swift b/two.swift
      --- a/two.swift
      +++ b/two.swift
      +two
      """

    let selected = PullRequestUnifiedDiff.chunk(for: "two.swift", in: diff)

    XCTAssertTrue(selected.contains("+two"))
    XCTAssertFalse(selected.contains("+one"))
  }

  func testNativePullRequestSearchMatchesTheSameVisibleFieldsAsCompactPWA() {
    let project = RemoteProject(
      id: "project-1",
      name: "Poracode",
      location: .posix(path: "/work/poracode"),
      createdAt: "2026-08-22T00:00:00Z"
    )
    let entry = PullRequestsEntry(
      project: project,
      summary: GitHubPullRequestSummary(
        number: 42,
        title: "Native pull request review",
        state: "open",
        isDraft: false,
        url: "https://github.com/example/poracode/pull/42",
        baseBranch: "main",
        updatedAt: "2026-08-22T00:00:00Z",
        viewerDidAuthor: true,
        headBranch: "native-review",
        authorLogin: "octocat",
        repository: "example/poracode",
        additions: 14,
        deletions: 3,
        reviewRequested: false
      ),
      viewerLogin: "octocat"
    )

    for query in ["pull request", "example/poracode", "octocat", "Poracode", "42"] {
      XCTAssertTrue(PullRequestsPresentation.matches(entry, query: query), query)
    }
    XCTAssertFalse(PullRequestsPresentation.matches(entry, query: "unrelated"))
  }

  func testPullRequestRowsPushNativeReviewAndKeepSafariSecondary() throws {
    let list = try source("App/Features/PullRequests/PullRequestsPageView.swift")
    XCTAssertTrue(list.contains("NavigationLink"))
    XCTAssertTrue(list.contains("entryPoint: .pullRequest"))
    XCTAssertTrue(list.contains("PullRequestsStrings.openExternally"))
    XCTAssertTrue(list.contains("PoracodeBottomActionBar"))
    XCTAssertTrue(list.contains("PoracodeCircleMenu"))
    XCTAssertTrue(list.contains("native-e2e.pull-requests.filter"))
    XCTAssertTrue(list.contains("native-e2e.pull-requests.refresh"))
    XCTAssertFalse(list.contains("ToolbarItemGroup(placement: .topBarTrailing)"))

    let review = try source("App/Features/PullRequests/PullRequestReviewPageView.swift")
    for token in [
      "ghGetPrDetails", "ghGetPrFiles", "ghGetPrDiff", "ghGetPrReviewComments",
      "ghSubmitPrReview", "ghPostPrComment", "ghMergePr", "ghUpdatePrBranch",
      "Button(PullRequestsStrings.refresh",
    ] {
      XCTAssertTrue(review.contains(token), token)
    }
  }

  private func document(_ json: String) throws -> GitHubDocument {
    GitHubDocument(value: try JSONDecoder().decode(GitHubJSONValue.self, from: Data(json.utf8)))
  }

  private func source(_ relative: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
    return try String(contentsOf: url, encoding: .utf8)
  }
}
