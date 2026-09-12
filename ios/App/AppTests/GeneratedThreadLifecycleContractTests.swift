import XCTest

@testable import App

final class GeneratedThreadLifecycleContractTests: XCTestCase {
  func testGeneratedMetadataPinsBothLifecycleRoutes() throws {
    let start = try GeneratedRemoteV3Contract.threadLifecycleRouteContract(
      id: "thread-start-existing")
    XCTAssertEqual(start.method, "POST")
    XCTAssertEqual(start.path, "/api/threads/start")
    XCTAssertEqual(start.requiredScope, "session:operate")
    XCTAssertEqual(start.successStatus, 200)

    let command = try GeneratedRemoteV3Contract.threadLifecycleRouteContract(id: "thread-command")
    XCTAssertEqual(command.method, "POST")
    XCTAssertEqual(command.path, "/api/threads/{threadId}/command")
    XCTAssertEqual(command.requiredScope, "session:operate")
    XCTAssertEqual(command.successStatus, 200)
  }

  func testStartExistingUsesCanonicalBodyAndAuthoritativeCommandID() throws {
    var request = ThreadLifecycleTestValues.startExisting(threadID: "thread-existing")
    request.agentInstanceID = "agent_1"
    request.presentationMode = .gui
    request.sessionReference = ThreadSessionReference(
      providerSessionID: "provider-session",
      discoveredAt: "2026-08-12T12:00:00Z"
    )
    request.mcpServers = [
      ThreadMCPServer(
        id: "server-1",
        name: "project_server",
        transport: .http(url: "https://mcp.example/rpc")
      )
    ]
    request.disabledBuiltInMCPServerIDs = [.browser, .computerUse]
    request.disabledBuiltInMCPTools = ["browser": ["navigate"]]

    let prepared = try GeneratedRemoteV3Contract.threadStartExistingRequest(
      request, commandID: "start-command-1")
    let body = try threadLifecycleJSONObject(prepared.body)

    XCTAssertEqual(prepared.method, "POST")
    XCTAssertEqual(prepared.path, "/api/threads/start")
    XCTAssertEqual(
      prepared.headers[ProtocolConstants.commandIdHeader],
      "start-command-1"
    )
    XCTAssertEqual(body["threadId"] as? String, "thread-existing")
    XCTAssertEqual(body["agentInstanceId"] as? String, "agent_1")
    XCTAssertEqual(body["presentationMode"] as? String, "gui")
    XCTAssertEqual((body["initialSize"] as? [String: Any])?["cols"] as? Int, 120)
    XCTAssertEqual((body["mcpServers"] as? [[String: Any]])?.count, 1)
    XCTAssertEqual(body["disabledBuiltInMcpServerIds"] as? [String], ["browser", "computer-use"])
  }

  func testEveryCommandVariantUsesCanonicalProjectionAndIdempotencyPolicy() throws {
    let variants: [(String, ThreadRemoteCommand, Bool)] = [
      (
        "prepare-worktree",
        .prepareWorktree(projectID: "project-1", worktreePath: "worktree"),
        false
      ),
      ("start", .start(ThreadLifecycleTestValues.relaunch()), true),
      ("set-group", .setGroup(groupID: "group-1", groupName: "Group"), false),
      ("clear-group", .clearGroup, false),
      ("rename", .rename(title: "Renamed"), false),
      ("acknowledge", .acknowledge, false),
      ("set-done", .setDone(true), false),
      ("set-starred", .setStarred(true), false),
      (
        "set-worktree",
        .setWorktree(path: "worktree", branch: "feature", isNew: true),
        false
      ),
      (
        "delete-worktree-group",
        .deleteWorktreeGroup(
          projectID: "project-1",
          worktreePath: "worktree",
          threadIDs: ["thread-1", "thread-2"]
        ),
        false
      ),
      ("archive", .archive, false),
      ("unarchive", .unarchive, false),
      ("delete", .delete, false),
    ]

    for (kind, command, expectsCommandID) in variants {
      let prepared = try GeneratedRemoteV3Contract.threadCommandRequest(
        threadID: "thread/a b",
        command: command,
        commandID: "command-1"
      )
      let body = try threadLifecycleJSONObject(prepared.body)
      XCTAssertEqual(body["kind"] as? String, kind)
      XCTAssertEqual(prepared.path, "/api/threads/thread%2Fa%20b/command")
      XCTAssertEqual(prepared.method, "POST")
      XCTAssertEqual(
        prepared.headers[ProtocolConstants.commandIdHeader],
        expectsCommandID ? "command-1" : nil,
        kind
      )
    }
  }

  func testGeneratedPreflightRejectsInvalidBodiesAndPaths() throws {
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.threadCommandRequest(
        threadID: "thread-1",
        command: .rename(title: ""),
        commandID: nil
      ))
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.threadCommandRequest(
        threadID: "",
        command: .acknowledge,
        commandID: nil
      ))

    var invalidStart = ThreadLifecycleTestValues.startExisting()
    invalidStart.agentKind = ""
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.threadStartExistingRequest(
        invalidStart, commandID: "command-1"))
  }

  func testGeneratedPostflightRejectsInvalidResponses() throws {
    XCTAssertEqual(
      try GeneratedRemoteV3Contract.threadStartExistingResponse(
        Data(#"{"threadId":"thread-1","future":true}"#.utf8)),
      "thread-1"
    )
    XCTAssertNoThrow(
      try GeneratedRemoteV3Contract.validateThreadCommandResponse(
        Data(#"{"ok":true,"future":true}"#.utf8)))
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.threadStartExistingResponse(Data(#"{"ok":true}"#.utf8)))
    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.validateThreadCommandResponse(Data(#"{"ok":false}"#.utf8)))
  }

  // MARK: - v9 pinned execution environment (shared fixture round-trip)

  /// The host replaces thread configs wholesale on every config-carrying
  /// mutation. These tests pin that the WSL distro selected on the desktop
  /// (`thread-config-execution-environment.json`) survives the native
  /// snapshot → launch-config → wire-encode path, on the encoded JSON.
  private func pinnedConfig() throws -> ThreadConfig {
    try JSONDecoding.decode(
      ThreadConfig.self,
      from: try remoteFixtureData("thread-config-execution-environment.json")
    )
  }

  private func pinnedEnvironment(_ config: [String: Any]) throws {
    let environment = try XCTUnwrap(config["executionEnvironment"] as? [String: Any])
    XCTAssertEqual(environment["kind"] as? String, "wsl")
    XCTAssertEqual(environment["distro"] as? String, "Ubuntu-22.04")
  }

  func testPinnedExecutionEnvironmentSurvivesThreadDecodeAndStartEncoding() throws {
    let configJSON = try XCTUnwrap(
      JSONSerialization.jsonObject(
        with: try remoteFixtureData("thread-config-execution-environment.json")
      ) as? [String: Any]
    )
    var threadJSON: [String: Any] = ["config": configJSON]
    threadJSON["id"] = "thread-pinned"
    threadJSON["projectId"] = "project-1"
    threadJSON["title"] = "Pinned"
    threadJSON["agentKind"] = "claude"
    threadJSON["status"] = "idle"
    threadJSON["attention"] = "none"
    threadJSON["createdAt"] = "2026-09-01T00:00:00Z"
    threadJSON["updatedAt"] = "2026-09-01T00:00:00Z"

    let thread = try JSONDecoding.decode(
      RemoteThread.self, from: JSONSerialization.data(withJSONObject: threadJSON))
    XCTAssertEqual(
      thread.config.executionEnvironment,
      RemoteExecutionEnvironment(kind: "wsl", distro: "Ubuntu-22.04"))

    let request = ThreadStartExistingRequest(
      threadID: thread.id,
      projectLocation: .wsl(
        distro: "Ubuntu-22.04",
        linuxPath: "/repo",
        uncPath: #"\\wsl.localhost\Ubuntu-22.04\repo"#
      ),
      agentKind: thread.agentKind,
      config: thread.config.lifecycleLaunchConfiguration
    )
    let body = try threadLifecycleJSONObject(
      try GeneratedRemoteV3Contract.threadStartExistingRequest(request, commandID: "start-1").body)
    try pinnedEnvironment(try XCTUnwrap(body["config"] as? [String: Any]))
  }

  func testPinnedExecutionEnvironmentSurvivesRelaunchCommandEncoding() throws {
    let request = ThreadRelaunchRequest(
      projectID: "project-1",
      agentKind: "claude",
      config: try pinnedConfig().lifecycleLaunchConfiguration,
      prompt: "continue"
    )
    let body = try threadLifecycleJSONObject(
      try GeneratedRemoteV3Contract.threadCommandRequest(
        threadID: "thread-pinned",
        command: .start(request),
        commandID: "start-2"
      ).body)
    try pinnedEnvironment(try XCTUnwrap(body["config"] as? [String: Any]))
  }

  func testPinnedExecutionEnvironmentSurvivesFastAndModelChangesThroughSendEncoding() throws {
    // applyComposerControls projects the thread config into the launch model,
    // the composer overrides model/fast on it, and openComposerControls maps
    // it back before send/steer. The pinned distro must survive every hop.
    var launch = try pinnedConfig().lifecycleLaunchConfiguration
    launch.model = "next-model"
    launch.fast = true
    let edited = ThreadConfig(launch)

    XCTAssertEqual(
      edited.executionEnvironment, RemoteExecutionEnvironment(kind: "wsl", distro: "Ubuntu-22.04"))
    XCTAssertEqual(edited.model, "next-model")
    XCTAssertEqual(edited.fast, true)

    let configObject = try XCTUnwrap(
      JSONSerialization.jsonObject(with: try JSONDecoding.encoder.encode(edited))
        as? [String: Any])
    let body: [String: Any] = ["prompt": "hi", "config": configObject]
    let sent = try threadLifecycleJSONObject(
      try GeneratedRemoteV3Contract.threadSendRequest(
        JSONSerialization.data(withJSONObject: body)))
    try pinnedEnvironment(try XCTUnwrap(sent["config"] as? [String: Any]))
  }

  func testNonWSLConfigOmitsExecutionEnvironmentOnTheWire() throws {
    let request = ThreadStartExistingRequest(
      threadID: "thread-native",
      projectLocation: .posix(path: "/repo"),
      agentKind: "claude",
      config: ThreadLaunchConfiguration(model: "fixture-model")
    )
    let body = try threadLifecycleJSONObject(
      try GeneratedRemoteV3Contract.threadStartExistingRequest(request, commandID: "start-3").body)
    let config = try XCTUnwrap(body["config"] as? [String: Any])
    XCTAssertFalse(
      config.keys.contains("executionEnvironment"),
      "native execution must not invent an execution environment")
  }
}
