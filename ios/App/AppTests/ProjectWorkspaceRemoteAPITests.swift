import Foundation
import XCTest

@testable import App

final class ProjectWorkspaceRemoteAPITests: XCTestCase {
  override func tearDown() {
    ProjectWorkspaceURLProtocol.reset()
    super.tearDown()
  }

  func testEveryWorkspaceMethodUsesOneCanonicalProcedureRequest() async throws {
    let fixture = try ProjectWorkspaceFixtures.load()
    let client = makeClient()

    for fixtureCase in fixture.cases {
      try ProjectWorkspaceURLProtocol.enqueue(result: fixtureCase.result)
      try await invoke(client, fixtureCase: fixtureCase)

      let request = try XCTUnwrap(ProjectWorkspaceURLProtocol.requests.last)
      XCTAssertEqual(request.url?.path, "/prefix/api/git/call", fixtureCase.id)
      XCTAssertEqual(request.httpMethod, "POST", fixtureCase.id)
      XCTAssertEqual(
        request.value(forHTTPHeaderField: "Authorization"),
        "Bearer secret",
        fixtureCase.id
      )
      let body = try XCTUnwrap(ProjectWorkspaceURLProtocol.bodies.last ?? nil)
      let envelope = try JSONDecoder().decode(JSONValue.self, from: body)
      guard case .object(let object) = envelope else {
        return XCTFail("Expected procedure object for \(fixtureCase.id)")
      }
      XCTAssertEqual(object["procedure"], .string(fixtureCase.procedure), fixtureCase.id)
      XCTAssertEqual(object["payload"], fixtureCase.payload, fixtureCase.id)
    }

    XCTAssertEqual(ProjectWorkspaceURLProtocol.requests.count, fixture.cases.count)
  }

  func testWriteMalformedSuccessIsAmbiguousAndNeverRetried() async throws {
    ProjectWorkspaceURLProtocol.responses = [
      .http(status: 200, body: Data(#"{"result":{"modifiedAtMs":"bad"}}"#.utf8))
    ]

    do {
      _ = try await write(using: makeClient())
      XCTFail("Expected ambiguous outcome")
    } catch ProjectRemoteMutationError.ambiguousOutcome {
      XCTAssertEqual(ProjectWorkspaceURLProtocol.requests.count, 1)
    }
  }

  func testWriteTransportFailureIsAmbiguousAndNeverRetried() async throws {
    ProjectWorkspaceURLProtocol.responses = [.failure(URLError(.networkConnectionLost))]

    do {
      _ = try await write(using: makeClient())
      XCTFail("Expected ambiguous outcome")
    } catch ProjectRemoteMutationError.ambiguousOutcome {
      XCTAssertEqual(ProjectWorkspaceURLProtocol.requests.count, 1)
    }
  }

  func testWriteAuthoritativeHTTPRejectionIsPreservedAndNeverRetried() async throws {
    ProjectWorkspaceURLProtocol.responses = [
      .http(
        status: 409,
        body: Data(#"{"error":{"code":"write_conflict","message":"Conflict"}}"#.utf8)
      )
    ]

    do {
      _ = try await write(using: makeClient())
      XCTFail("Expected HTTP rejection")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 409)
      XCTAssertEqual(error.code, "write_conflict")
      XCTAssertEqual(ProjectWorkspaceURLProtocol.requests.count, 1)
    }
  }

  func testInvalidGeneratedRequestNeverReachesTransport() async throws {
    do {
      _ = try await makeClient().remoteSearchProjectFiles(
        location: .posix(path: "/repo"),
        query: "x",
        limit: 0,
        searchConfig: nil
      )
      XCTFail("Expected generated request validation failure")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.code, "invalid_response")
      XCTAssertTrue(ProjectWorkspaceURLProtocol.requests.isEmpty)
    }
  }

  private func invoke(
    _ client: RemoteAPIClient,
    fixtureCase: ProjectWorkspaceFixtureCase
  ) async throws {
    switch fixtureCase.procedure {
    case "searchProjectFiles":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectWorkspaceSearchFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteSearchProjectFiles(
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
      _ = try await client.remoteListProjectTree(
        location: value.projectLocation,
        directoryPath: value.directoryPath
      )
    case "searchProjectTree":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectWorkspaceSearchFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteSearchProjectTree(
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
      _ = try await client.remoteReadProjectFile(
        location: value.projectLocation,
        path: value.path
      )
    case "writeProjectFile":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectFileWriteFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteWriteProjectFile(
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
      _ = try await client.remoteGetGitStatus(
        location: value.projectLocation,
        detail: value.detail
      )
    case "getGitDiff":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitDiffFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteGetGitDiff(
        location: value.projectLocation,
        filePath: value.filePath,
        staged: value.staged
      )
    case "getGitDiffBatch":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitDiffBatchFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteGetGitDiffBatch(
        location: value.projectLocation,
        untrackedPaths: value.untrackedPaths
      )
    case "getGitFileContent":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitFileContentFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteGetGitFileContent(
        location: value.projectLocation,
        filePath: value.filePath,
        staged: value.staged
      )
    case "gitProjectSnapshot":
      let value = try ProjectWorkspaceFixtures.decode(
        ProjectGitSnapshotFixturePayload.self,
        payload: fixtureCase.payload
      )
      _ = try await client.remoteGitProjectSnapshot(
        location: value.projectLocation,
        includeGhCheck: value.includeGhCheck
      )
    default:
      throw ProjectWorkspaceTestError.unimplemented
    }
  }

  private func write(using client: RemoteAPIClient) async throws -> ProjectFileWriteResult {
    try await client.remoteWriteProjectFile(
      location: .posix(path: "/repo"),
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1
    )
  }

  private func makeClient() -> RemoteAPIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ProjectWorkspaceURLProtocol.self]
    return RemoteAPIClient(
      endpoint: "https://relay.test/prefix",
      accessToken: "secret",
      session: URLSession(configuration: configuration)
    )
  }
}
