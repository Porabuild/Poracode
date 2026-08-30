import Foundation
import XCTest

@testable import App

private actor ProjectWorkspaceRemoteAPIFake: ProjectWorkspaceRemoteAPI {
  struct SearchCall: Sendable {
    let location: ProjectLocation
    let query: String
    let limit: Int
    let searchConfig: ProjectWorkspaceSearchConfig?
  }

  private(set) var searchCalls: [SearchCall] = []
  private(set) var writeCalls = 0
  private(set) var createCalls: [(ProjectLocation, String, AdvancedProjectEntryType)] = []
  var searchResult = ProjectFileSearchResult(entries: [], totalIndexed: 0)
  var writeResult = ProjectFileWriteResult(modifiedAtMs: 2)
  var searchGate: ProjectWorkspaceTestGate<ProjectFileSearchResult>?

  func configureSearchGate(_ gate: ProjectWorkspaceTestGate<ProjectFileSearchResult>?) {
    searchGate = gate
  }

  func remoteSearchProjectFiles(
    location: ProjectLocation,
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?
  ) async throws -> ProjectFileSearchResult {
    searchCalls.append(
      SearchCall(
        location: location,
        query: query,
        limit: limit,
        searchConfig: searchConfig
      )
    )
    if let searchGate { return try await searchGate.wait() }
    return searchResult
  }

  func remoteWriteProjectFile(
    location: ProjectLocation,
    path: String,
    content: String,
    baseModifiedAtMs: Double
  ) async throws -> ProjectFileWriteResult {
    writeCalls += 1
    return writeResult
  }

  func remoteCreateProjectEntry(
    location: ProjectLocation,
    path: String,
    type: AdvancedProjectEntryType
  ) async throws {
    createCalls.append((location, path, type))
  }
}

@MainActor
final class SelectedProjectWorkspaceGatewayTests: XCTestCase {
  func testReadRequiresSessionReadAndUsesExactProjectLocation() async throws {
    let context = makeProjectWorkspaceContext(capabilities: [.sessionRead])
    let api = ProjectWorkspaceRemoteAPIFake()
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }

    _ = try await gateway.searchProjectFiles(
      query: "résumé",
      limit: 25,
      searchConfig: nil,
      lease: context.lease
    )
    let calls = await api.searchCalls
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(calls.first?.location, context.lease.location)
    XCTAssertEqual(calls.first?.query, "résumé")

    do {
      _ = try await gateway.writeProjectFile(
        path: "README.md",
        content: "new",
        baseModifiedAtMs: 1,
        lease: context.lease
      )
      XCTFail("Expected missing operate scope")
    } catch let error as ProjectSessionGatewayError {
      XCTAssertEqual(
        error,
        .http(
          statusCode: 403,
          code: "missing_scope",
          missingScope: ProjectControllerCapability.sessionOperate.rawValue
        )
      )
      let writeCalls = await api.writeCalls
      XCTAssertEqual(writeCalls, 0)
    }
  }

  func testWriteRequiresOperateButNotReadScope() async throws {
    let context = makeProjectWorkspaceContext(capabilities: [.sessionOperate])
    let api = ProjectWorkspaceRemoteAPIFake()
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }

    let result = try await gateway.writeProjectFile(
      path: "README.md",
      content: "new",
      baseModifiedAtMs: 1,
      lease: context.lease
    )
    XCTAssertEqual(result.modifiedAtMs, 2)
    let writeCalls = await api.writeCalls
    XCTAssertEqual(writeCalls, 1)
  }

  func testEntryMutationUsesOperateScopeAndExactWorkspaceLocation() async throws {
    let context = makeProjectWorkspaceContext(capabilities: [.sessionOperate])
    let api = ProjectWorkspaceRemoteAPIFake()
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }

    try await gateway.createProjectEntry(
      path: "Sources/New.swift",
      type: .file,
      lease: context.lease
    )

    let calls = await api.createCalls
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(calls.first?.0, context.lease.location)
    XCTAssertEqual(calls.first?.1, "Sources/New.swift")
    XCTAssertEqual(calls.first?.2, .file)
  }

  func testDifferentProjectGenerationCancelsBeforeTransport() async throws {
    let context = makeProjectWorkspaceContext(projectGeneration: 3)
    let api = ProjectWorkspaceRemoteAPIFake()
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }
    let stale = ProjectWorkspaceLease(
      hostLease: context.lease.hostLease,
      project: context.lease.project,
      location: context.lease.location,
      projectGeneration: 2
    )

    do {
      _ = try await gateway.searchProjectFiles(
        query: "x",
        limit: 10,
        searchConfig: nil,
        lease: stale
      )
      XCTFail("Expected cancellation")
    } catch is CancellationError {
      let searchCalls = await api.searchCalls
      XCTAssertTrue(searchCalls.isEmpty)
    }
  }

  func testProjectSelectionChangeCancelsCompletionAfterTransport() async throws {
    let context = makeProjectWorkspaceContext(projectGeneration: 1)
    let api = ProjectWorkspaceRemoteAPIFake()
    let gate = ProjectWorkspaceTestGate<ProjectFileSearchResult>()
    await api.configureSearchGate(gate)
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }

    let operation = Task {
      try await gateway.searchProjectFiles(
        query: "x",
        limit: 10,
        searchConfig: nil,
        lease: context.lease
      )
    }
    await gate.waitUntilStarted()
    let replacement = makeProjectWorkspaceContext(
      connectionID: context.lease.hostLease.connectionId,
      hostGeneration: context.lease.hostLease.generation,
      projectID: context.lease.project.projectId,
      location: context.lease.location,
      projectGeneration: 2
    )
    box.selection = ProjectWorkspaceTransportSelection(context: replacement, api: api)
    await gate.succeed(ProjectFileSearchResult(entries: [], totalIndexed: 0))

    do {
      _ = try await operation.value
      XCTFail("Expected stale completion cancellation")
    } catch is CancellationError {
      let searchCalls = await api.searchCalls
      XCTAssertEqual(searchCalls.count, 1)
    }
  }

  func testInconsistentHostAndProjectOwnershipCancels() async throws {
    let context = makeProjectWorkspaceContext()
    let api = ProjectWorkspaceRemoteAPIFake()
    let box = ProjectWorkspaceSelectionBox()
    box.selection = ProjectWorkspaceTransportSelection(context: context, api: api)
    let gateway = SelectedProjectWorkspaceGateway { box.selection }
    let inconsistent = ProjectWorkspaceLease(
      hostLease: context.lease.hostLease,
      project: ProjectIdentity(
        connectionId: ClientConnectionID(),
        projectId: context.lease.project.projectId
      ),
      location: context.lease.location,
      projectGeneration: context.lease.projectGeneration
    )

    do {
      _ = try await gateway.gitProjectSnapshot(
        includeGhCheck: false,
        lease: inconsistent
      )
      XCTFail("Expected cancellation")
    } catch is CancellationError {
      let searchCalls = await api.searchCalls
      XCTAssertTrue(searchCalls.isEmpty)
    }
  }
}
