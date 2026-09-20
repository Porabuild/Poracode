import Foundation
import XCTest

@testable import App

final class GitHubOperationsIntegrationTests: XCTestCase {
  func testXcodeMembershipIsCompleteAndHarnessArtifactsAreExcluded() throws {
    let root = gitHubRepositoryRoot()
    let project = try String(
      contentsOf: root.appendingPathComponent("ios/App/App.xcodeproj/project.pbxproj"),
      encoding: .utf8
    )
    let appSources = try phase("504EC3001FED79650016851F", named: "Sources", in: project)
    let testSources = try phase("E30000000000000000000002", named: "Sources", in: project)
    let resources = try phase("504EC3021FED79650016851F", named: "Resources", in: project)
    let production =
      try swiftFiles("ios/App/App/Features/Projects/GitHubOperations")
      + swiftFiles("ios/App/App/Transport/Projects/GitHubOperations")
    let tests = try swiftFiles("ios/App/AppTests/GitHubOperations")

    for file in production {
      let membership = "/* \(file) in Sources */"
      XCTAssertEqual(appSources.components(separatedBy: membership).count - 1, 1, file)
      XCTAssertFalse(testSources.contains(membership), file)
    }
    for file in tests {
      let membership = "/* \(file) in Sources */"
      XCTAssertEqual(testSources.components(separatedBy: membership).count - 1, 1, file)
      XCTAssertFalse(appSources.contains(membership), file)
    }
    XCTAssertEqual(
      resources.components(separatedBy: "GitHubOperations.xcstrings in Resources").count - 1,
      1
    )
    XCTAssertFalse(project.contains("PackageSources"))
    XCTAssertFalse(project.contains("GitHubOperations/Package.swift"))
  }

  func testAllTwentySevenActionsReachTheProductionFormSurface() throws {
    XCTAssertEqual(GitHubOperationsPresentation.actions.count, 27)
    XCTAssertEqual(
      Set(GitHubOperationsPresentation.actions.map(\.procedure)),
      Set(GitHubProcedure.allCases)
    )
    let root = gitHubRepositoryRoot()
    let panel = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/GitHubOperations/GitHubOperationsPanel.swift"
      ), encoding: .utf8
    )
    let form = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/GitHubOperations/GitHubOperationForm.swift"
      ), encoding: .utf8
    )
    let gitUI = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectGitWorkspaceViews.swift"
      ), encoding: .utf8
    )
    XCTAssertTrue(panel.contains("github.action.\\(descriptor.procedure.rawValue)"))
    XCTAssertTrue(panel.contains("GitHubOperationFormView"))
    XCTAssertTrue(form.contains("switch procedure"))
    XCTAssertTrue(gitUI.contains("GitHubOperationsPanel"))
  }

  @MainActor
  func testProductionContextMapsExactSelectionAndLiveState() {
    let session = AppSession(dependencies: .live)
    let connection = ClientConnectionID(
      UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    )
    let location = ProjectLocation.wsl(
      distro: "Ubuntu-24.04",
      linuxPath: "/home/dev/repo",
      uncPath: #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#,
      remoteServerId: "server-1"
    )
    let profile = profile(desktopId: "desktop-a")
    session.state.selectedConnectionId = connection
    session.state.hosts = [host(connection: connection, profile: profile)]
    session.state.profile = profile
    session.state.phase = .ready
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "memory-only")
    )
    session.state.snapshot = snapshot(location: location)
    _ = session.state.operationOwner.bumpWorkGeneration()

    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: .init(connectionId: connection, projectId: "project-1"),
      location: location
    )
    let context = source.gitHubOperationsContext
    XCTAssertEqual(context?.lease.clientConnectionId, connection.uuid)
    XCTAssertEqual(context?.lease.desktopId, "desktop-a")
    XCTAssertEqual(context?.lease.hostGeneration, UInt64(session.state.workGeneration))
    XCTAssertEqual(context?.lease.project.projectId, "project-1")
    XCTAssertEqual(context?.lease.location, GitHubProjectLocation(location))
    XCTAssertEqual(context?.lease.projectGeneration, 1)
    XCTAssertEqual(context?.grantedScopes, ["session:read"])
    XCTAssertTrue(context?.isOnline == true)
    XCTAssertTrue(context?.isReady == true)
    XCTAssertTrue(context?.isForeground == true)

    source.synchronize(identity: source.identity, location: .posix(path: "/moved"))
    XCTAssertNil(source.gitHubOperationsContext)
    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(source.gitHubOperationsContext)
  }

  @MainActor
  func testBackgroundAndReadinessGateEveryAction() async {
    let read = GitHubOperationsPresentation.actions.first { $0.procedure == .ghListAccounts }!
    let write = GitHubOperationsPresentation.actions.first { $0.procedure == .ghMergePr }!
    var gating = GitHubActionGating(
      grantedScopes: ["session:read"],
      isReady: false,
      isAvailable: true,
      hasBranch: true,
      hasAccount: true,
      hasPullRequest: true,
      hasWorkflow: true,
      hasWorkflowRun: true
    )
    XCTAssertFalse(gating.permitsEntry(read))
    gating.isReady = true
    XCTAssertTrue(gating.permitsEntry(read))
    XCTAssertFalse(gating.permitsEntry(write))
    gating = GitHubActionGating(
      grantedScopes: ["session:read", "session:operate"],
      isReady: true,
      isAvailable: true,
      hasBranch: true,
      hasAccount: true,
      hasPullRequest: true,
      hasWorkflow: true,
      hasWorkflowRun: true
    )
    XCTAssertTrue(gating.permits(write))

    let controller = GitHubPullRequestController(
      gateway: GitHubStubGateway { request, _ in
        GitHubOperationsSamples.result(request.procedure)
      }
    )
    controller.activate(GitHubOperationsSamples.context)
    controller.enterBackground()
    await controller.load(
      .ghListPullRequests(.init(projectLocation: GitHubOperationsSamples.wsl))
    )
    XCTAssertEqual(controller.failure, .notReady)
  }

  @MainActor
  func testExactCredentialOwnerBuildsOnlySelectedHostTransport() async throws {
    let credentials = GitHubCredentialsProbe()
    let contextBox = GitHubContextBox(GitHubOperationsSamples.context)
    let factory = GitHubFactoryProbe()
    let source = GitHubOperationsExactHostTransportSource(
      credentials: credentials,
      contextProvider: { contextBox.context },
      makeAPI: { endpoint, token in
        factory.endpoint = endpoint
        factory.token = token
        return GitHubNoopRemoteAPI()
      }
    )
    await credentials.install(
      .init(
        connectionId: ClientConnectionID(GitHubOperationsSamples.lease.clientConnectionId),
        desktopId: GitHubOperationsSamples.lease.desktopId,
        endpoint: "https://selected.test/prefix",
        token: "selected-token",
        protocolVersion: ProtocolConstants.remoteProtocolVersion,
        scopes: ["session:read"]
      )
    )
    let selection = try await source.selection(for: GitHubOperationsSamples.lease)
    XCTAssertNotNil(selection)
    XCTAssertEqual(factory.endpoint?.absoluteString, "https://selected.test/prefix")
    XCTAssertEqual(factory.token, "selected-token")
    XCTAssertEqual(selection?.context.grantedScopes, ["session:read"])

    contextBox.context = nil
    do {
      _ = try await source.selection(for: GitHubOperationsSamples.lease)
      XCTFail("Expected stale selection cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error")
    }
    let requested = await credentials.requestedConnections()
    XCTAssertEqual(requested, [GitHubOperationsSamples.lease.clientConnectionId])
  }

  private func swiftFiles(_ relative: String) throws -> [String] {
    try FileManager.default.contentsOfDirectory(
      at: gitHubRepositoryRoot().appendingPathComponent(relative),
      includingPropertiesForKeys: nil
    ).filter { $0.pathExtension == "swift" && $0.lastPathComponent != "Package.swift" }
      .map(\.lastPathComponent)
  }

  private func phase(_ identifier: String, named name: String, in project: String) throws -> String
  {
    let marker = "\n\t\t\(identifier) /* \(name) */ = {"
    let start = try XCTUnwrap(project.range(of: marker)).lowerBound
    let suffix = project[start...]
    let end = try XCTUnwrap(suffix.range(of: "\n\t\t};")).upperBound
    return String(project[start..<end])
  }

  @MainActor
  private func profile(desktopId: String) -> ConnectionProfile {
    .init(
      desktopId: desktopId,
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: ProtocolConstants.remoteProtocolVersion
    )
  }

  @MainActor
  private func host(connection: ClientConnectionID, profile: ConnectionProfile) -> HostRecord {
    .init(
      connectionId: connection,
      desktopId: profile.desktopId,
      label: profile.label,
      httpBaseURL: profile.httpBaseURL,
      wsBaseURL: profile.wsBaseURL,
      appVersion: profile.appVersion,
      scopes: ["session:read"],
      pairedAt: profile.pairedAt,
      protocolVersion: profile.protocolVersion
    )
  }

  @MainActor
  private func snapshot(location: ProjectLocation) -> RemoteShellSnapshot {
    .init(
      snapshotSeq: 1,
      projects: [
        .init(
          id: "project-1",
          remoteServerId: location.remoteServerId,
          remoteId: nil,
          name: "Project",
          location: location,
          createdAt: "2026-08-12T00:00:00Z"
        )
      ],
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }
}

private actor GitHubCredentialsProbe: GitHubOperationsCredentialRepository {
  private var credential: GitHubOperationsHostCredentials?
  private(set) var requested: [UUID] = []

  func install(_ credential: GitHubOperationsHostCredentials) { self.credential = credential }

  func requestedConnections() -> [UUID] { requested }

  func gitHubOperationsCredentials(
    for connectionId: ClientConnectionID
  ) -> GitHubOperationsHostCredentials? {
    requested.append(connectionId.uuid)
    return credential
  }
}

@MainActor
private final class GitHubContextBox {
  var context: GitHubControllerContext?
  init(_ context: GitHubControllerContext?) { self.context = context }
}

private final class GitHubFactoryProbe: @unchecked Sendable {
  var endpoint: URL?
  var token: String?
}

private actor GitHubNoopRemoteAPI: GitHubOperationsRemoteAPI {
  func remoteGitHubOperation(_ request: GitHubOperationRequest) -> GitHubOperationResult {
    GitHubOperationsSamples.result(request.procedure)
  }
}
