import Foundation
import XCTest

@testable import App

final class GitOperationsContractTests: XCTestCase {
  func testAll30ProceduresCrossGeneratedRequestAndResultRoots() throws {
    XCTAssertEqual(GitOperationsSamples.requests.count, 30)
    XCTAssertEqual(Set(GitOperationsSamples.requests.map(\.procedure)).count, 30)

    for request in GitOperationsSamples.requests {
      let body = try GitOperationsRemoteV3Contract.request(request)
      let object = try XCTUnwrap(
        JSONSerialization.jsonObject(with: body) as? [String: Any]
      )
      XCTAssertEqual(object["procedure"] as? String, request.procedure.rawValue)
      XCTAssertNotNil(object["payload"])

      let result = try GitOperationsRemoteV3Contract.result(
        for: request.procedure,
        response: GitOperationsSamples.response(for: request.procedure)
      )
      if request.procedure.metadata.resultKind == .omitted {
        XCTAssertEqual(result, .omitted)
      }
    }
  }

  func testMetadataExactlyMatchesGeneratedManifest() {
    XCTAssertTrue(GitOperationProcedure.gitAddWorktree.metadata.isLongRunning)
    XCTAssertEqual(GitOperationProcedure.allCases.count, 30)
    XCTAssertEqual(GitOperationProcedure.metadata.count, 30)
    XCTAssertEqual(GitOperationProcedure.metadata.filter { $0.scope == .read }.count, 6)
    XCTAssertEqual(GitOperationProcedure.metadata.filter { $0.scope == .operate }.count, 24)
    XCTAssertEqual(GitOperationProcedure.metadata.filter { $0.resultKind == .json }.count, 15)
    XCTAssertEqual(GitOperationProcedure.metadata.filter { $0.resultKind == .omitted }.count, 15)
    XCTAssertEqual(
      Set(GitOperationProcedure.metadata.filter { $0.owner == .worktreeLocation }.map(\.procedure)),
      [.gitAbortMerge, .gitFinishMerge, .gitPullFromSource]
    )

    for procedure in GitOperationProcedure.allCases {
      let expected = procedure.metadata
      let generated = RemoteContractMetadata.procedures.first {
        $0.name == procedure.rawValue
      }
      XCTAssertEqual(generated?.scope, expected.scope.rawValue)
      XCTAssertEqual(generated?.owner, expected.owner.rawValue)
      XCTAssertEqual(generated?.resultKind, expected.resultKind.rawValue)
    }
  }

  func testGeneratedDefaultsAndSemanticValidationAreAuthoritative() throws {
    let request = GitOperationRequest.gitFetch(
      .init(projectLocation: GitOperationsSamples.posix)
    )
    let body = try GitOperationsRemoteV3Contract.request(request)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    let payload = try XCTUnwrap(object["payload"] as? [String: Any])
    XCTAssertEqual(payload["remote"] as? String, "origin")
    XCTAssertEqual(payload["prune"] as? Bool, false)

    let invalid = GitOperationRequest.gitAddWorktree(
      .init(
        projectLocation: GitOperationsSamples.posix,
        branch: "feature",
        createBranch: false,
        ownerToken: "owner",
        sourceBranch: "main"
      )
    )
    XCTAssertThrowsError(try GitOperationsRemoteV3Contract.request(invalid))
  }

  func testMalformedResultsAndNonemptyOmittedResponsesAreRejected() {
    XCTAssertThrowsError(
      try GitOperationsRemoteV3Contract.result(
        for: .gitCommit,
        response: Data(#"{"result":{"message":"missing hash"}}"#.utf8)
      )
    )
    XCTAssertThrowsError(
      try GitOperationsRemoteV3Contract.result(
        for: .gitStageAll,
        response: Data(#"{"result":null}"#.utf8)
      )
    )
  }
}
