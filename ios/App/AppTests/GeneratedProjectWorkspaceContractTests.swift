import Foundation
import XCTest

@testable import App

final class GeneratedProjectWorkspaceContractTests: XCTestCase {
  func testFixtureRequestsAndResultsCrossEveryGeneratedRoot() throws {
    let fixture = try ProjectWorkspaceFixtures.load()
    XCTAssertEqual(fixture.cases.count, 11)

    for fixtureCase in fixture.cases {
      let envelope = try requestEnvelope(for: fixtureCase)
      let object = try XCTUnwrap(
        JSONSerialization.jsonObject(with: envelope) as? [String: Any],
        fixtureCase.id
      )
      XCTAssertEqual(object["procedure"] as? String, fixtureCase.procedure, fixtureCase.id)
      let payload = try XCTUnwrap(object["payload"], fixtureCase.id)
      let payloadData = try JSONSerialization.data(withJSONObject: payload)
      XCTAssertEqual(
        try JSONDecoder().decode(JSONValue.self, from: payloadData),
        fixtureCase.payload,
        fixtureCase.id
      )

      let resultEnvelope = try JSONEncoder().encode(
        JSONValue.object(["result": fixtureCase.result])
      )
      let canonical = try canonicalResult(for: fixtureCase, envelope: resultEnvelope)
      XCTAssertEqual(
        try JSONDecoder().decode(JSONValue.self, from: canonical),
        fixtureCase.result,
        fixtureCase.id
      )
      try assertDomainDecode(for: fixtureCase, canonical: canonical)
    }
  }

  func testGeneratedRequestRootsRejectInvalidLimitsBeforeTransport() throws {
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.searchProjectFilesEnvelope(
        location: .posix(path: "/repo"),
        query: "x",
        limit: 0,
        searchConfig: nil
      )
    )
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.searchProjectTreeEnvelope(
        location: .posix(path: "/repo"),
        query: "x",
        limit: 201,
        searchConfig: nil
      )
    )
  }

  private func requestEnvelope(for fixtureCase: ProjectWorkspaceFixtureCase) throws -> Data {
    switch fixtureCase.procedure {
    case "searchProjectFiles":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectWorkspaceSearchFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.searchProjectFilesEnvelope(
        location: value.projectLocation,
        query: value.query,
        limit: value.limit,
        searchConfig: value.searchConfig
      )
    case "listProjectTree":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectTreeListFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.listProjectTreeEnvelope(
        location: value.projectLocation,
        directoryPath: value.directoryPath
      )
    case "searchProjectTree":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectWorkspaceSearchFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.searchProjectTreeEnvelope(
        location: value.projectLocation,
        query: value.query,
        limit: value.limit,
        searchConfig: value.searchConfig
      )
    case "readProjectFile":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectFilePathFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.readProjectFileEnvelope(
        location: value.projectLocation,
        path: value.path
      )
    case "writeProjectFile":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectFileWriteFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.writeProjectFileEnvelope(
        location: value.projectLocation,
        path: value.path,
        content: value.content,
        baseModifiedAtMs: value.baseModifiedAtMs
      )
    case "getGitStatus":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitStatusFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.getGitStatusEnvelope(
        location: value.projectLocation,
        detail: value.detail
      )
    case "getGitDiff":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitDiffFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.getGitDiffEnvelope(
        location: value.projectLocation,
        filePath: value.filePath,
        staged: value.staged
      )
    case "getGitDiffBatch":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitDiffBatchFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.getGitDiffBatchEnvelope(
        location: value.projectLocation,
        untrackedPaths: value.untrackedPaths
      )
    case "getGitFileContent":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitFileContentFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.getGitFileContentEnvelope(
        location: value.projectLocation,
        filePath: value.filePath,
        staged: value.staged
      )
    case "gitProjectSnapshot":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitSnapshotFixturePayload.self,
        payload: fixtureCase.payload
      )
      return try GeneratedRemoteV3Contract.gitProjectSnapshotEnvelope(
        location: value.projectLocation,
        includeGhCheck: value.includeGhCheck
      )
    default:
      throw ProjectWorkspaceTestError.unimplemented
    }
  }

  private func canonicalResult(
    for fixtureCase: ProjectWorkspaceFixtureCase,
    envelope: Data
  ) throws -> Data {
    switch fixtureCase.procedure {
    case "searchProjectFiles":
      try GeneratedRemoteV3Contract.searchProjectFilesResult(envelope)
    case "listProjectTree":
      try GeneratedRemoteV3Contract.listProjectTreeResult(envelope)
    case "searchProjectTree":
      try GeneratedRemoteV3Contract.searchProjectTreeResult(envelope)
    case "readProjectFile":
      try GeneratedRemoteV3Contract.readProjectFileResult(envelope)
    case "writeProjectFile":
      try GeneratedRemoteV3Contract.writeProjectFileResult(envelope)
    case "getGitStatus":
      try GeneratedRemoteV3Contract.getGitStatusResult(envelope)
    case "getGitDiff":
      try GeneratedRemoteV3Contract.getGitDiffResult(envelope)
    case "getGitDiffBatch":
      try GeneratedRemoteV3Contract.getGitDiffBatchResult(envelope)
    case "getGitFileContent":
      try GeneratedRemoteV3Contract.getGitFileContentResult(envelope)
    case "gitProjectSnapshot":
      try GeneratedRemoteV3Contract.gitProjectSnapshotResult(envelope)
    default:
      throw ProjectWorkspaceTestError.unimplemented
    }
  }

  private func assertDomainDecode(
    for fixtureCase: ProjectWorkspaceFixtureCase,
    canonical: Data
  ) throws {
    switch fixtureCase.procedure {
    case "searchProjectFiles":
      _ = try JSONDecoder().decode(ProjectFileSearchResult.self, from: canonical)
    case "listProjectTree":
      _ = try JSONDecoder().decode(ProjectTreeResult.self, from: canonical)
    case "searchProjectTree":
      _ = try JSONDecoder().decode(ProjectTreeSearchResult.self, from: canonical)
    case "readProjectFile":
      _ = try JSONDecoder().decode(ProjectFileReadResult.self, from: canonical)
    case "writeProjectFile":
      _ = try JSONDecoder().decode(ProjectFileWriteResult.self, from: canonical)
    case "getGitStatus":
      _ = try JSONDecoder().decode(ProjectGitStatus.self, from: canonical)
    case "getGitDiff":
      _ = try JSONDecoder().decode(ProjectGitDiffResult.self, from: canonical)
    case "getGitDiffBatch":
      _ = try JSONDecoder().decode(ProjectGitDiffBatchResult.self, from: canonical)
    case "getGitFileContent":
      _ = try JSONDecoder().decode(ProjectGitFileContentResult.self, from: canonical)
    case "gitProjectSnapshot":
      _ = try JSONDecoder().decode(ProjectGitSnapshot.self, from: canonical)
    default:
      throw ProjectWorkspaceTestError.unimplemented
    }
  }
}
