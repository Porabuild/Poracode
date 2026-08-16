import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

final class GitHubOperationsContractTests: XCTestCase {
  func testAll27ProceduresCrossExactGeneratedRequestAndResultRoots() throws {
    XCTAssertEqual(GitHubProcedure.allCases.count, 27)
    XCTAssertEqual(GitHubOperationsSamples.allRequests.count, 27)
    XCTAssertEqual(Set(GitHubOperationsSamples.allRequests.map(\.procedure)).count, 27)

    for request in GitHubOperationsSamples.allRequests {
      let body = try GitHubOperationsRemoteV3Contract.request(request)
      let envelope = try XCTUnwrap(
        JSONSerialization.jsonObject(with: body) as? [String: Any]
      )
      XCTAssertEqual(envelope["procedure"] as? String, request.procedure.rawValue)
      XCTAssertNotNil(envelope["payload"])

      let result: GitHubOperationResult
      do {
        result = try GitHubOperationsRemoteV3Contract.result(
          for: request.procedure,
          response: GitHubOperationsSamples.response(for: request.procedure)
        )
      } catch {
        XCTFail("Result fixture failed for \(request.procedure.rawValue)")
        throw error
      }
      XCTAssertEqual(result.procedure, request.procedure)
      XCTAssertEqual(
        result.document == nil,
        request.procedure.metadata.resultKind == .omitted
      )
    }
  }

  func testMetadataExactlyMatchesCommittedManifestMetadata() {
    XCTAssertEqual(GitHubProcedure.metadata.count, 27)
    XCTAssertEqual(GitHubProcedure.metadata.filter { $0.scope == .read }.count, 15)
    XCTAssertEqual(GitHubProcedure.metadata.filter { $0.scope == .operate }.count, 12)
    XCTAssertEqual(GitHubProcedure.metadata.filter { $0.owner == .runtime }.count, 2)
    XCTAssertEqual(GitHubProcedure.metadata.filter { $0.resultKind == .json }.count, 17)
    XCTAssertEqual(GitHubProcedure.metadata.filter { $0.resultKind == .omitted }.count, 10)

    for procedure in GitHubProcedure.allCases {
      let generated = RemoteContractMetadata.procedures.first { $0.name == procedure.rawValue }
      XCTAssertEqual(generated?.scope, procedure.metadata.scope.rawValue)
      XCTAssertEqual(generated?.owner, procedure.metadata.owner.rawValue)
      XCTAssertEqual(generated?.resultKind, procedure.metadata.resultKind.rawValue)
    }
  }

  func testWSLAndAllLocationIdentitiesRemainLossless() throws {
    for location in [
      GitHubOperationsSamples.posix,
      GitHubOperationsSamples.windows,
      GitHubOperationsSamples.wsl,
    ] {
      let data = try JSONEncoder().encode(location)
      XCTAssertEqual(try JSONDecoder().decode(GitHubProjectLocation.self, from: data), location)
    }

    let body = try GitHubOperationsRemoteV3Contract.request(
      .ghCheckAvailable(.init(projectLocation: GitHubOperationsSamples.wsl, detail: .full))
    )
    let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
    let location = try XCTUnwrap(payload["projectLocation"] as? [String: Any])
    XCTAssertEqual(location["distro"] as? String, "Ubuntu-24.04")
    XCTAssertEqual(location["linuxPath"] as? String, "/home/dev/repo")
    XCTAssertEqual(
      location["uncPath"] as? String,
      #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#
    )
    XCTAssertEqual(location["remoteServerId"] as? String, "server-wsl")
  }

  func testOmittedAndMalformedResultsAreExact() {
    XCTAssertNoThrow(
      try GitHubOperationsRemoteV3Contract.result(
        for: .ghClosePr,
        response: Data("{}".utf8)
      )
    )
    XCTAssertThrowsError(
      try GitHubOperationsRemoteV3Contract.result(
        for: .ghClosePr,
        response: Data(#"{"result":null}"#.utf8)
      )
    )
    XCTAssertThrowsError(
      try GitHubOperationsRemoteV3Contract.result(
        for: .ghCheckAvailable,
        response: Data("{}".utf8)
      )
    )
  }
}
