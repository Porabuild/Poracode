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
}
