import XCTest

@testable import App

final class GeneratedRemoteV3ContractTests: XCTestCase {
  func testManifestSourcesExactlyMatchSynchronizedAppTargetDirectory() throws {
    let manifest = try loadManifest()
    let listed = Set(manifest.languages.swift.files.map(\.path))
    let generatedDirectory =
      repoRoot
      .appendingPathComponent("protocol/remote/v3/generated/native")
    let actual = try Set(
      FileManager.default.contentsOfDirectory(
        at: generatedDirectory.appendingPathComponent("swift"),
        includingPropertiesForKeys: nil
      )
      .filter { $0.pathExtension == "swift" }
      .map { "swift/\($0.lastPathComponent)" }
    )
    XCTAssertEqual(listed, actual, "manifest and generated Swift directory must not drift")
    XCTAssertEqual(manifest.counts.swiftFiles, listed.count)

    let project = try String(
      contentsOf: repoRoot.appendingPathComponent("ios/App/App.xcodeproj/project.pbxproj"),
      encoding: .utf8
    )
    XCTAssertTrue(project.contains("isa = PBXFileSystemSynchronizedRootGroup;"))
    XCTAssertTrue(project.contains("path = ../../protocol/remote/v3/generated/native/swift;"))
    let appTarget = try targetBlock(named: "App", in: project)
    let testsTarget = try targetBlock(named: "AppTests", in: project)
    XCTAssertTrue(appTarget.contains("fileSystemSynchronizedGroups"))
    XCTAssertTrue(appTarget.contains("F10000000000000000000001"))
    XCTAssertFalse(testsTarget.contains("fileSystemSynchronizedGroups"))
    XCTAssertFalse(testsTarget.contains("F10000000000000000000001"))
  }

  func testGeneratedAndManifestVersionsAreCompatible() throws {
    let manifest = try loadManifest()
    XCTAssertTrue(GeneratedRemoteV3Contract.isCompatible)
    XCTAssertTrue(
      GeneratedRemoteV3Contract.isCompatible(
        withNativeBundleManifest: try manifestData()
      )
    )
    XCTAssertEqual(manifest.formatVersion, 1)
    XCTAssertEqual(
      manifest.formatVersion,
      GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion
    )
    XCTAssertEqual(manifest.bindingFormatVersion, RemoteContractMetadata.bindingFormatVersion)
    XCTAssertEqual(manifest.generatorVersion, RemoteContractMetadata.generatorVersion)
    XCTAssertEqual(manifest.protocolVersion, RemoteContractMetadata.protocolVersion)
  }

  func testEnvironmentAndSnapshotFixturesCanonicalizeDefaultsAndUnknowns() throws {
    let environment = try GeneratedRemoteV3Contract.environmentResponse(
      fixture("environment-forward-compatible.json"), legacy: false
    )
    let environmentObject = try object(environment)
    XCTAssertNil(environmentObject["futureCapability"])
    let descriptor = try JSONDecoding.decode(RemoteEnvironmentDescriptor.self, from: environment)
    XCTAssertEqual(descriptor.protocolVersion, 3)
    let legacyEnvironment = try GeneratedRemoteV3Contract.environmentResponse(
      fixture("environment-forward-compatible.json"), legacy: true
    )
    XCTAssertNil(try object(legacyEnvironment)["futureCapability"])
    XCTAssertEqual(
      try JSONDecoding.decode(RemoteEnvironmentDescriptor.self, from: legacyEnvironment)
        .protocolVersion,
      descriptor.protocolVersion
    )

    let snapshot = try GeneratedRemoteV3Contract.shellSnapshotResponse(
      fixture("shell-snapshot.json")
    )
    let snapshotObject = try object(snapshot)
    let threads = try XCTUnwrap(snapshotObject["threads"] as? [[String: Any]])
    XCTAssertEqual(threads.first?["archived"] as? Bool, false)
    XCTAssertEqual(threads.first?["done"] as? Bool, false)
    XCTAssertEqual(threads.first?["starred"] as? Bool, false)
    let projected = try JSONDecoding.decode(RemoteShellSnapshot.self, from: snapshot)
    XCTAssertEqual(projected.snapshotSeq, 42)
  }

  func testHistorySendAndPushCanonicalRoutes() throws {
    let history = try GeneratedRemoteV3Contract.threadHistoryResponse(
      fixture("thread-history.json")
    )
    XCTAssertEqual(
      try JSONDecoding.decode(RemoteThreadSnapshot.self, from: history).snapshotSeq,
      42
    )
    XCTAssertEqual(
      try GeneratedRemoteV3Contract.threadHistoryPath(threadId: "thread/one"), "thread/one")
    XCTAssertEqual(
      try GeneratedRemoteV3Contract.threadHistoryQuery(targetTimelineEntryCount: 25)
        .map { "\($0.name)=\($0.value ?? "")" },
      ["runtimePage=1", "targetTimelineEntryCount=25"]
    )

    let send = Data(
      #"{"prompt":"hello","config":{"model":"gpt-5","future":true},"future":true}"#.utf8)
    let canonicalSend = try GeneratedRemoteV3Contract.threadSendRequest(send)
    let sendObject = try object(canonicalSend)
    XCTAssertNil(sendObject["future"])
    XCTAssertNil((sendObject["config"] as? [String: Any])?["future"])
    _ = try GeneratedRemoteV3Contract.threadSendResponse(Data(#"{"ok":true}"#.utf8))

    let push = Data(
      #"{"deviceId":"device-123","platform":"ios","deviceToken":"token","routing":{"version":1,"clientConnectionId":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA","desktopId":"desktop"}}"#
        .utf8
    )
    let canonicalPush = try GeneratedRemoteV3Contract.pushRegisterRequest(push)
    let routing = try XCTUnwrap(try object(canonicalPush)["routing"] as? [String: Any])
    XCTAssertEqual(
      routing["clientConnectionId"] as? String,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    )
    _ = try GeneratedRemoteV3Contract.pushRegisterResponse(
      Data(#"{"ok":true,"routing":{"version":1}}"#.utf8)
    )
  }

  func testHistoryItemsAndInterruptBoundariesRejectInvalidInputs() throws {
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.historyItemsQuery(
        beforePosition: nil, limit: 0, targetTimelineEntryCount: nil
      )
    ) { assertInvalidResponse($0) }
    let page = try GeneratedRemoteV3Contract.historyItemsResponse(
      Data(#"{"items":[],"nextCursor":null}"#.utf8)
    )
    XCTAssertTrue(try JSONDecoding.decode(RemoteRuntimeItemsPage.self, from: page).items.isEmpty)
    XCTAssertEqual(try GeneratedRemoteV3Contract.interruptPath(threadId: "thread-1"), "thread-1")
    XCTAssertEqual(try object(GeneratedRemoteV3Contract.interruptRequest()).count, 0)
    _ = try GeneratedRemoteV3Contract.interruptResponse(Data(#"{"ok":true}"#.utf8))
  }

  func testMalformedKnownWebSocketRejectedAndUnknownPreserved() throws {
    let malformed = Data(#"{"type":"ready","seq":"secret-token"}"#.utf8)
    XCTAssertThrowsError(try RemoteWebSocketServerMessage.decode(from: malformed)) {
      assertInvalidResponse($0, excluding: "secret-token")
    }

    let unknown = Data(#"{"type":"future-widget","payload":{"secret":"kept"}}"#.utf8)
    let canonical = try GeneratedRemoteV3Contract.serverWebSocketMessage(unknown)
    XCTAssertEqual(canonical, unknown)
    guard case .unknown(let type, let raw) = try RemoteWebSocketServerMessage.decode(from: unknown)
    else { return XCTFail("expected unknown WebSocket message") }
    XCTAssertEqual(type, "future-widget")
    XCTAssertEqual(raw["payload"]?["secret"], .string("kept"))
  }

  func testCanonicalEventKeepsOpaquePayloadAndClientMessagesValidate() throws {
    let event = try GeneratedRemoteV3Contract.serverWebSocketMessage(fixture("ws-event.json"))
    guard case .event(_, let payload) = try RemoteWebSocketServerMessage.decode(from: event)
    else { return XCTFail("expected event") }
    XCTAssertEqual(payload["event"]?["delta"], .string(" live"))

    let interests = try XCTUnwrap(ThreadItemInterestsWire.jsonText(threadIds: ["b", "a", "a"]))
    let interestsObject = try object(Data(interests.utf8))
    XCTAssertEqual(interestsObject["threadIds"] as? [String], ["a", "b"])
    _ = try GeneratedRemoteV3Contract.clientWebSocketMessage(
      Data(#"{"type":"ping","id":"ping-1","sentAt":1}"#.utf8)
    )
  }

  func testCodecErrorsAreSanitizedInvalidResponses() {
    let token = "top-secret-access-token"
    let malformed = Data(
      "{\"accessToken\":\"\(token)\",\"tokenType\":\"Wrong\",\"expiresAt\":\"x\",\"scopes\":[]}"
        .utf8
    )
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.tokenExchangeResponse(malformed)) {
      assertInvalidResponse($0, excluding: token)
    }
  }

  func testAPIClientUsesCanonicalSnapshotHistoryAndSendBoundaries() async throws {
    CapturingURLProtocol.reset()
    defer { CapturingURLProtocol.reset() }
    CapturingURLProtocol.responseStatus = 200
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CapturingURLProtocol.self]
    let client = RemoteAPIClient(
      endpoint: "https://relay.example/prefix",
      accessToken: "access-token",
      session: URLSession(configuration: config)
    )

    CapturingURLProtocol.responseBody = try fixture("shell-snapshot.json")
    let snapshot = try await client.snapshot()
    XCTAssertEqual(snapshot.snapshotSeq, 42)

    CapturingURLProtocol.responseBody = try fixture("thread-history.json")
    let history = try await client.threadHistory(
      threadId: "thread/fixture", targetTimelineEntryCount: 25
    )
    XCTAssertEqual(history.snapshotSeq, 42)
    let historyURL = try XCTUnwrap(CapturingURLProtocol.lastRequest?.url)
    XCTAssertTrue(historyURL.absoluteString.contains("thread%2Ffixture/history"))
    let query = URLComponents(url: historyURL, resolvingAgainstBaseURL: false)?.queryItems
    XCTAssertEqual(query?.first(where: { $0.name == "runtimePage" })?.value, "1")
    XCTAssertEqual(
      query?.first(where: { $0.name == "targetTimelineEntryCount" })?.value,
      "25"
    )

    CapturingURLProtocol.responseBody = Data(#"{"ok":true}"#.utf8)
    try await client.sendThreadInput(
      threadId: "thread/fixture",
      prompt: "hello",
      config: ThreadConfig(model: "gpt-5")
    )
    let sendBody = try XCTUnwrap(CapturingURLProtocol.lastBody)
    XCTAssertEqual(try object(sendBody)["prompt"] as? String, "hello")
  }

  private var repoRoot: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }

  private func fixture(_ name: String) throws -> Data {
    try Data(contentsOf: repoRoot.appendingPathComponent("protocol/remote/v3/fixtures/\(name)"))
  }

  private func object(_ data: Data) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private func loadManifest() throws -> NativeBindingsManifest {
    try JSONDecoder().decode(NativeBindingsManifest.self, from: manifestData())
  }

  private func manifestData() throws -> Data {
    try Data(
      contentsOf: repoRoot.appendingPathComponent(
        "protocol/remote/v3/generated/native/native-bindings.json"
      ))
  }

  private func targetBlock(named name: String, in project: String) throws -> Substring {
    let marker = "/* \(name) */ = {\n\t\t\tisa = PBXNativeTarget;"
    let start = try XCTUnwrap(project.range(of: marker)?.lowerBound)
    let rest = project[start...]
    let end = try XCTUnwrap(rest.range(of: "\n\t\t};")?.upperBound)
    return rest[..<end]
  }

  private func assertInvalidResponse(
    _ error: Error, excluding secret: String? = nil,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    guard let remote = error as? RemoteClientError else {
      return XCTFail("expected RemoteClientError, got \(error)", file: file, line: line)
    }
    XCTAssertEqual(remote.code, "invalid_response", file: file, line: line)
    if let secret {
      XCTAssertFalse(remote.message.contains(secret), file: file, line: line)
      XCTAssertFalse(String(describing: remote).contains(secret), file: file, line: line)
    }
  }
}

private struct NativeBindingsManifest: Decodable {
  struct Counts: Decodable { let swiftFiles: Int }
  struct Source: Decodable { let path: String }
  struct SwiftLanguage: Decodable { let files: [Source] }
  struct Languages: Decodable { let swift: SwiftLanguage }

  let formatVersion: Int
  let protocolVersion: Int
  let bindingFormatVersion: Int
  let generatorVersion: Int
  let counts: Counts
  let languages: Languages
}
