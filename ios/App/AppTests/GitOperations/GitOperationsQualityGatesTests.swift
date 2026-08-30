import Foundation
import XCTest

@testable import App

final class GitOperationsQualityGatesTests: XCTestCase {
  func testUIActionMappingCoversExactly29Procedures() {
    XCTAssertEqual(GitOperationsPresentation.actions.count, 29)
    XCTAssertEqual(
      Set(GitOperationsPresentation.actions.map(\.procedure)),
      Set(GitOperationProcedure.allCases)
    )
    for descriptor in GitOperationsPresentation.actions {
      XCTAssertFalse(descriptor.accessibilityLabel.isEmpty)
      XCTAssertEqual(
        descriptor.role == .destructive,
        descriptor.procedure.requiresConfirmation
      )
    }
    XCTAssertEqual(
      Dictionary(grouping: GitOperationsPresentation.actions, by: \.surface).mapValues(\.count),
      [
        .authoritativeRefresh: 3,
        .repositoryQuick: 4,
        .repository: 10,
        .branch: 4,
        .worktree: 5,
        .file: 3,
      ]
    )
    XCTAssertEqual(
      Set(
        GitOperationsPresentation.actions.filter {
          $0.procedure.metadata.scope == .read
        }.map(\.surface)
      ),
      [.authoritativeRefresh, .branch]
    )
  }

  func testRealWorkspaceUIReachesPanelAndContextualFileActions() throws {
    let root = repositoryRoot()
    let sessionView = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectWorkspaceSessionView.swift"
      ),
      encoding: .utf8
    )
    let workspaceView = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectWorkspaceView.swift"
      ),
      encoding: .utf8
    )
    let gitView = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectGitWorkspaceViews.swift"
      ),
      encoding: .utf8
    )
    let gitDetailView = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Projects/ProjectGitDetailView.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(sessionView.contains("@State private var gitOperationsController"))
    XCTAssertTrue(sessionView.contains("SelectedGitOperationsGateway"))
    XCTAssertTrue(workspaceView.contains("gitOperationsController:"))
    XCTAssertTrue(gitView.contains("NavigationLink"))
    XCTAssertTrue(gitView.contains("GitOperationsPanel"))
    XCTAssertTrue(gitDetailView.contains("GitOperationsFileActions"))
    XCTAssertTrue(gitView.contains(".contextMenu"))
    XCTAssertTrue(gitView.contains(".swipeActions"))
    XCTAssertTrue(gitView.contains(".gitStageAll"))
    XCTAssertTrue(gitView.contains(".gitUnstageAll"))
    XCTAssertTrue(gitView.contains(".gitRevertAll"))
    XCTAssertTrue(workspaceView.contains("gitConfirmationPresented"))
    XCTAssertTrue(workspaceView.contains("confirmPendingMutation"))
    XCTAssertTrue(workspaceView.contains("openChangeInEditor"))
  }

  func testExplicitXcodeTargetAndGroupMembershipIsCompleteAndAdditive() throws {
    let project = try String(
      contentsOf: repositoryRoot().appendingPathComponent(
        "ios/App/App.xcodeproj/project.pbxproj"
      ),
      encoding: .utf8
    )
    let appSources = try phase("504EC3001FED79650016851F", in: project)
    let testSources = try phase("E30000000000000000000002", in: project)
    let appResources = try phase("504EC3021FED79650016851F", in: project)
    let featureFiles = try swiftFileNames(
      at: "ios/App/App/Features/Projects/GitOperations"
    )
    let transportFiles = try swiftFileNames(
      at: "ios/App/App/Transport/Projects/GitOperations"
    )
    let testFiles = try swiftFileNames(at: "ios/App/AppTests/GitOperations")

    XCTAssertEqual(featureFiles.count, 16)
    XCTAssertEqual(transportFiles.count, 5)
    XCTAssertEqual(testFiles.count, 7)
    for file in featureFiles + transportFiles {
      let membership = "/* \(file) in Sources */"
      XCTAssertEqual(appSources.components(separatedBy: membership).count - 1, 1, file)
      XCTAssertFalse(testSources.contains(membership), file)
    }
    for file in testFiles {
      let membership = "/* \(file) in Sources */"
      XCTAssertEqual(testSources.components(separatedBy: membership).count - 1, 1, file)
      XCTAssertFalse(appSources.contains(membership), file)
    }
    XCTAssertEqual(
      appResources.components(separatedBy: "GitOperations.xcstrings in Resources").count - 1,
      1
    )
    for groupID in [
      "F83000000000000000000001",
      "F83000000000000000000002",
      "F83000000000000000000003",
    ] {
      XCTAssertTrue(project.contains("\(groupID) /* GitOperations */"), groupID)
    }
    for preserved in [
      "SettingsIntegrationsScreen.swift in Sources",
      "RichChatThreadView.swift in Sources",
      "ThreadDetailActionMenu.swift in Sources",
      "ThreadDetailDestinations.swift in Sources",
      "ProjectWorkspaceView.swift in Sources",
      "ProjectGitDetailView.swift in Sources",
      "NativeUnifiedDiffView.swift in Sources",
      "RemoteIntegrationsScreen.swift in Sources",
    ] {
      XCTAssertTrue(appSources.contains(preserved), preserved)
    }
  }

  @MainActor
  func testRealCompositionRequiresExactHostProjectForegroundScopesAndAuthenticatedClient() {
    let session = AppSession(dependencies: .live)
    let connectionID = ClientConnectionID(
      UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    )
    let identity = ProjectIdentity(connectionId: connectionID, projectId: "project-1")
    let profile = gitOperationsProfile()
    session.state.selectedConnectionId = connectionID
    session.state.hosts = [gitOperationsHost(connectionID: connectionID, profile: profile)]
    session.state.profile = profile
    session.state.accessToken = "secret"
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "secret")
    )
    session.state.phase = .ready
    session.state.snapshot = gitOperationsSnapshot(location: GitOperationsSamples.wsl)
    _ = session.state.operationOwner.bumpWorkGeneration()

    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: identity,
      location: GitOperationsSamples.wsl
    )
    let selection = source.gitOperationsSelection
    XCTAssertEqual(selection?.context.lease.hostLease.connectionId, connectionID)
    XCTAssertEqual(
      selection?.context.lease.hostLease.generation,
      UInt64(session.state.workGeneration)
    )
    XCTAssertEqual(selection?.context.lease.project, identity)
    XCTAssertEqual(selection?.context.lease.location, GitOperationsSamples.wsl)
    XCTAssertEqual(selection?.context.lease.projectGeneration, 1)
    XCTAssertEqual(selection?.context.session.capabilities, [.sessionRead])
    XCTAssertTrue(selection?.context.session.isOnline == true)
    XCTAssertTrue(selection?.context.session.isReady == true)

    source.synchronize(identity: identity, location: GitOperationsSamples.windows)
    XCTAssertNil(source.gitOperationsSelection)
    session.state.snapshot = gitOperationsSnapshot(location: GitOperationsSamples.windows)
    XCTAssertEqual(
      source.gitOperationsSelection?.context.lease.location, GitOperationsSamples.windows)
    XCTAssertEqual(source.gitOperationsSelection?.context.lease.projectGeneration, 2)

    session.state.liveLifecycle.noteEnteredBackground(
      sessionExpired: false,
      resyncPending: false
    )
    XCTAssertNil(source.gitOperationsSelection)
    XCTAssertFalse(source.gitOperationsContext?.session.isOnline == true)
    _ = session.state.liveLifecycle.noteForeground()
    XCTAssertNotNil(source.gitOperationsSelection)

    session.state.accessToken = nil
    XCTAssertNil(source.gitOperationsSelection)
    session.state.accessToken = "secret"
    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(source.gitOperationsContext)
  }

  func testCatalogHasCompleteRealTranslations() throws {
    let url = repositoryRoot()
      .appendingPathComponent(
        "ios/App/App/Features/Projects/GitOperations/GitOperations.xcstrings"
      )
    let data = try Data(contentsOf: url)
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: data) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    let expectedLocales = Set([
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi",
      "zh-Hans",
    ])
    XCTAssertFalse(strings.isEmpty)
    for (key, rawEntry) in strings {
      let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), expectedLocales, key)
      for (locale, rawLocalization) in localizations {
        let localization = try XCTUnwrap(rawLocalization as? [String: Any], key)
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], key)
        let value = try XCTUnwrap(unit["value"] as? String, "\(key) \(locale)")
        XCTAssertFalse(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        XCTAssertEqual(unit["state"] as? String, "translated")
      }
    }
  }

  func testEveryProductionFileIsUnder500Lines() throws {
    let root = repositoryRoot()
    let directories = [
      "ios/App/App/Features/Projects/GitOperations",
      "ios/App/App/Transport/Projects/GitOperations",
    ]
    for directory in directories {
      let url = root.appendingPathComponent(directory)
      let files = try FileManager.default.contentsOfDirectory(
        at: url,
        includingPropertiesForKeys: nil
      ).filter { $0.pathExtension == "swift" }
      for file in files {
        let lineCount = try String(contentsOf: file, encoding: .utf8)
          .split(separator: "\n", omittingEmptySubsequences: false).count
        XCTAssertLessThan(lineCount, 500, file.lastPathComponent)
      }
    }
    for path in [
      "ios/App/App/Features/Projects/ProjectWorkspaceSessionView.swift",
      "ios/App/App/Features/Projects/ProjectWorkspaceView.swift",
      "ios/App/App/Features/Projects/ProjectGitWorkspaceViews.swift",
      "ios/App/App/Features/Projects/ProjectGitDetailView.swift",
      "ios/App/App/Features/Projects/NativeUnifiedDiffView.swift",
    ] {
      let file = root.appendingPathComponent(path)
      let lineCount = try String(contentsOf: file, encoding: .utf8)
        .split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lineCount, 500, file.lastPathComponent)
    }
  }

  func testNoRawUserFacingViewStrings() throws {
    let directory = repositoryRoot().appendingPathComponent(
      "ios/App/App/Features/Projects/GitOperations"
    )
    let files = try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil
    ).filter { $0.pathExtension == "swift" && $0.lastPathComponent != "GitOperationsStrings.swift" }
    let pattern = #"(?:Text|Button|Label|Toggle|TextField|Menu)\(\s*\"[A-Za-z]"#
    let regex = try NSRegularExpression(pattern: pattern)
    for file in files {
      let source = try String(contentsOf: file, encoding: .utf8)
      let range = NSRange(source.startIndex..., in: source)
      XCTAssertNil(regex.firstMatch(in: source, range: range), file.lastPathComponent)
    }
  }

  private func repositoryRoot() -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }

  private func swiftFileNames(at path: String) throws -> [String] {
    try FileManager.default.contentsOfDirectory(
      at: repositoryRoot().appendingPathComponent(path),
      includingPropertiesForKeys: nil
    )
    .filter { $0.pathExtension == "swift" }
    .map(\.lastPathComponent)
    .sorted()
  }

  private func phase(_ identifier: String, in project: String) throws -> String {
    let marker = "\n\t\t\(identifier) /*"
    let markerRange = try XCTUnwrap(project.range(of: marker), identifier)
    let start = project.index(after: markerRange.lowerBound)
    let suffix = project[start...]
    let end = try XCTUnwrap(suffix.range(of: "\n\t\t};"), identifier).upperBound
    return String(project[start..<end])
  }

  @MainActor
  private func gitOperationsProfile() -> ConnectionProfile {
    ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://desktop.test",
      wsBaseURL: "wss://desktop.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: 8
    )
  }

  @MainActor
  private func gitOperationsHost(
    connectionID: ClientConnectionID,
    profile: ConnectionProfile
  ) -> HostRecord {
    HostRecord(
      connectionId: connectionID,
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
  private func gitOperationsSnapshot(location: ProjectLocation) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
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
