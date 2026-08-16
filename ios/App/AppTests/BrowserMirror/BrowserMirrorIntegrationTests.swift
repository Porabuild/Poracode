import Foundation
import XCTest

@testable import App

/// Production integration for Browser Mirror: Xcode membership, exact-host selection,
/// credential resolution through the real catalog/vault, the shared-socket multiplexer,
/// and reachability from the existing session navigation.
final class BrowserMirrorIntegrationTests: XCTestCase {
  func testXcodeMembershipIsCompleteAndHarnessArtifactsAreExcluded() throws {
    let project = try projectFile()
    let appSources = try phase("504EC3001FED79650016851F", named: "Sources", in: project)
    let testSources = try phase("E30000000000000000000002", named: "Sources", in: project)
    let resources = try phase("504EC3021FED79650016851F", named: "Resources", in: project)
    let production =
      try swiftFiles("ios/App/App/Features/BrowserMirror")
      + swiftFiles("ios/App/App/Transport/BrowserMirror")
    let tests = try swiftFiles("ios/App/AppTests/BrowserMirror")

    XCTAssertGreaterThanOrEqual(production.count, 17)
    XCTAssertGreaterThanOrEqual(tests.count, 6)
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
      resources.components(separatedBy: "BrowserMirror.xcstrings in Resources").count - 1,
      1
    )
    XCTAssertFalse(project.contains("BrowserMirror/Package.swift"))
    XCTAssertFalse(project.contains("BrowserMirror/PackageSources"))
  }

  func testBrowserMirrorIsReachableFromTheSessionNavigation() throws {
    // The More sheet owns the entry point into browser mirroring.
    let more = try source("ios/App/App/Features/Home/HomeMoreSheet.swift")
    XCTAssertTrue(more.contains("BrowserMirrorStrings.title"))
    XCTAssertTrue(more.contains("BrowserMirrorSessionView(session: session"))
    XCTAssertTrue(more.contains("session.currentBrowserMirrorAccess == nil"))

    let entry = try source("ios/App/App/Features/BrowserMirror/BrowserMirrorSessionView.swift")
    XCTAssertTrue(entry.contains("session.makeBrowserMirrorComposition()"))
    XCTAssertTrue(entry.contains("BrowserMirrorScreen("))
    XCTAssertTrue(entry.contains("await composition.activate()"))
    XCTAssertTrue(entry.contains("await composition.deactivate()"))
    XCTAssertTrue(entry.contains("composition.suspend()"))
  }

  @MainActor
  func testSelectionCarriesExactHostIdentityAndInvalidatesOnHostSwitch() {
    let session = AppSession(dependencies: .live)
    let connection = ClientConnectionID(
      UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    )
    let profile = profile(desktopId: "desktop-a")
    session.state.selectedConnectionId = connection
    session.state.hosts = [host(connection: connection, profile: profile)]
    session.state.profile = profile
    session.state.phase = .ready
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "memory-only")
    )
    _ = session.state.operationOwner.bumpWorkGeneration()

    let access = session.currentBrowserMirrorAccess
    XCTAssertEqual(access?.lease.connectionID.rawValue, connection.rawValue)
    XCTAssertEqual(access?.lease.connectionGeneration, UInt64(session.state.workGeneration))
    XCTAssertEqual(access?.expectedDesktopID, "desktop-a")
    XCTAssertEqual(access?.capabilities, [.read, .operate])
    XCTAssertTrue(access?.isOnline == true)
    XCTAssertTrue(access?.isReady == true)
    XCTAssertTrue(access?.isForeground == true)

    // A registry record for another desktop must not expose the previous host's access.
    session.state.hosts = [
      host(connection: connection, profile: Self.testProfile(desktopId: "other"))
    ]
    XCTAssertNil(session.currentBrowserMirrorAccess)

    session.state.hosts = [host(connection: connection, profile: profile)]
    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(session.currentBrowserMirrorAccess)
  }

  func testCatalogResolvesCredentialsOnlyForTheRequestedConnection() async throws {
    let suffix = UUID().uuidString
    let keychain = InMemoryKeychainIO()
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("poracode-browser-\(suffix)", isDirectory: true)
    let catalog = HostCatalog(
      directory: directory,
      vaultIO: keychain,
      sourceKeychain: keychain,
      defaults: HostSourceDefaults(
        value: UserDefaults(suiteName: "poracode.tests.browser.\(suffix)") ?? .standard
      )
    )
    defer { Task { await catalog.wipeForTests() } }

    let connection = ClientConnectionID()
    let record = await MainActor.run {
      HostRecord(
        connectionId: connection,
        profile: BrowserMirrorIntegrationTests.testProfile(desktopId: "desktop-a")
      )
    }
    let activated = try await catalog.activate(id: 1, kind: .add)
    XCTAssertTrue(activated)
    _ = try await catalog.pairAdd(record: record, token: "browser-token", owning: 1)

    let resolved = try await catalog.credentials(
      for: BrowserMirrorConnectionID(connection)
    )
    XCTAssertEqual(resolved?.token, "browser-token")
    XCTAssertEqual(resolved?.desktopID, "desktop-a")
    XCTAssertEqual(resolved?.connectionID.rawValue, connection.rawValue)
    XCTAssertEqual(resolved?.scopes, ["session:read", "session:operate"])

    let other = try await catalog.credentials(
      for: BrowserMirrorConnectionID(ClientConnectionID())
    )
    XCTAssertNil(other)
    let malformed = try await catalog.credentials(
      for: BrowserMirrorConnectionID(rawValue: "not-a-connection-id")
    )
    XCTAssertNil(malformed)
  }

  func testBrowserFramesAreConsumedOutOfBandAndNeverAdvanceTheCursor() async throws {
    let client = RemoteWebSocketClient(
      api: RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "memory-only")
    )
    let sink = BrowserMirrorSinkSpy()
    await client.setBrowserMirrorSink(sink)

    let frame = try BrowserMirrorFixtures.serverMessage(id: "frame")
    let consumed = await client.routeBrowserMirrorMessage(frame)
    let appliedSeq = await client.appliedSeq
    let resyncPending = await client.resyncPending
    let delivered = await sink.count()
    XCTAssertTrue(consumed)
    XCTAssertEqual(appliedSeq, 0)
    XCTAssertFalse(resyncPending)
    XCTAssertEqual(delivered, 1)

    // Replayable events and unrelated frames must stay on the cursor path.
    let event = Data(#"{"type":"event","seq":9,"event":{"kind":"browser-state"}}"#.utf8)
    let eventConsumed = await client.routeBrowserMirrorMessage(event)
    let afterEvent = await sink.count()
    let seqAfterEvent = await client.appliedSeq
    XCTAssertFalse(eventConsumed)
    XCTAssertEqual(afterEvent, 1)
    XCTAssertEqual(seqAfterEvent, 0)

    await client.setBrowserMirrorSink(nil)
    let detachedConsumed = await client.routeBrowserMirrorMessage(frame)
    let afterDetach = await sink.count()
    XCTAssertFalse(detachedConsumed)
    XCTAssertEqual(afterDetach, 1)
  }

  func testOutboundBrowserSendRequiresALiveReadySocketGeneration() async throws {
    let client = RemoteWebSocketClient(
      api: RemoteAPIClient(endpoint: "https://desktop.test", accessToken: "memory-only")
    )
    let watch = try BrowserMirrorRemoteV3Adapter.watchMessage()
    let generation = await client.browserMirrorSocketGeneration

    do {
      try await client.sendBrowserMirrorMessage(watch, socketGeneration: generation)
      XCTFail("Expected a refusal while the socket is not ready")
    } catch {
      XCTAssertEqual(error as? BrowserMirrorFailure, .transport)
    }
    do {
      try await client.sendBrowserMirrorMessage(watch, socketGeneration: generation &+ 1)
      XCTFail("Expected a refusal for a superseded generation")
    } catch {
      XCTAssertEqual(error as? BrowserMirrorFailure, .transport)
    }
  }

  func testWireClassificationAcceptsOnlyBrowserDiscriminators() throws {
    for id in ["state", "frame", "status-active", "status-unavailable"] {
      let data = try BrowserMirrorFixtures.serverMessage(id: id)
      XCTAssertNotNil(BrowserMirrorSocketWire.serverType(data), id)
      XCTAssertTrue(BrowserMirrorSocketWire.mayBeBrowserMessage(data), id)
      XCTAssertNil(BrowserMirrorSocketWire.clientType(data), id)
    }
    for id in ["watch", "unwatch", "tap", "insert-unicode", "key-enter"] {
      let data = try BrowserMirrorFixtures.clientMessage(id: id)
      XCTAssertNotNil(BrowserMirrorSocketWire.clientType(data), id)
      XCTAssertNil(BrowserMirrorSocketWire.serverType(data), id)
    }
    XCTAssertNil(
      BrowserMirrorSocketWire.serverType(Data(#"{"type":"terminal-output"}"#.utf8))
    )
    XCTAssertNil(BrowserMirrorSocketWire.serverType(Data("not json".utf8)))
    XCTAssertFalse(BrowserMirrorSocketWire.mayBeBrowserMessage(Data("{}".utf8)))
  }

  @MainActor
  func testCompositionBindsAndReleasesTheSharedSocketSink() async {
    let session = AppSession(dependencies: .live)
    let socket = BrowserMirrorLiveSocketSpy()
    let connection = ClientConnectionID()
    let profile = profile(desktopId: "desktop-a")
    session.state.selectedConnectionId = connection
    session.state.hosts = [host(connection: connection, profile: profile)]
    session.state.profile = profile
    session.state.phase = .ready
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "memory-only")
    )
    session.state.webSocket = socket

    let composition = session.makeBrowserMirrorComposition()
    await composition.activate()
    XCTAssertTrue(composition.controller.watchIntent)
    XCTAssertEqual(socket.attachments, 1)

    // Backgrounding gates sends before any asynchronous teardown runs.
    composition.suspend()
    XCTAssertNil(composition.controller.frame)
    XCTAssertFalse(composition.controller.isStreamingInputAccepted)

    await composition.deactivate()
    XCTAssertFalse(composition.controller.watchIntent)
    XCTAssertEqual(socket.detachments, 1)
  }

  // MARK: - Helpers

  private func repositoryRoot() -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .standardizedFileURL
  }

  private func projectFile() throws -> String {
    try source("ios/App/App.xcodeproj/project.pbxproj")
  }

  private func source(_ relative: String) throws -> String {
    try String(
      contentsOf: repositoryRoot().appendingPathComponent(relative),
      encoding: .utf8
    )
  }

  private func swiftFiles(_ relative: String) throws -> [String] {
    try FileManager.default.contentsOfDirectory(
      at: repositoryRoot().appendingPathComponent(relative),
      includingPropertiesForKeys: nil
    ).filter { $0.pathExtension == "swift" && $0.lastPathComponent != "Package.swift" }
      .map(\.lastPathComponent)
      .sorted()
  }

  private func phase(
    _ identifier: String,
    named name: String,
    in project: String
  ) throws -> String {
    let marker = "\n\t\t\(identifier) /* \(name) */ = {"
    let start = try XCTUnwrap(project.range(of: marker)).lowerBound
    let suffix = project[start...]
    let end = try XCTUnwrap(suffix.range(of: "\n\t\t};")).upperBound
    return String(project[start..<end])
  }

  @MainActor
  private func profile(desktopId: String) -> ConnectionProfile {
    Self.testProfile(desktopId: desktopId)
  }

  @MainActor
  fileprivate static func testProfile(desktopId: String) -> ConnectionProfile {
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
  private func host(
    connection: ClientConnectionID,
    profile: ConnectionProfile
  ) -> HostRecord {
    HostRecord(connectionId: connection, profile: profile)
  }
}
