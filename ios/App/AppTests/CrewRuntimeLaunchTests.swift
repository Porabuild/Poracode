import XCTest
@testable import App

@MainActor final class CrewRuntimeLaunchTests: XCTestCase {
  private func thread() -> RemoteThread {
    var row = RichChatControllerTestValues.thread()
    row.sessionRef = .init(providerSessionID: "session", discoveredAt: "today", executionIdentity: "runtime")
    row.config.crew = ThreadCrewBinding(roles: [.init(id: "review", label: "Review",
      selection: .init(agentKind: "helper", model: "review"))]).wire
    return row
  }

  private func event(_ row: RemoteThread, config: JSONValue? = .object(["model": .string("lead")])) -> [String: JSONValue] {
    var object: [String: JSONValue] = ["threadId": .string(row.id), "agentKind": .string(row.agentKind)]
    object["launchConfig"] = config
    return object
  }

  private func candidate(_ row: RemoteThread, _ launch: CrewRuntimeLaunchSnapshot?, blocked: Int? = nil,
    capabilities: [String: JSONValue] = ["mcpScope": .object(["gui": .string("launch")])]) -> CrewRuntimeRelaunch? {
    CrewRuntimeRelaunchPlanner.candidate(target: RichChatControllerTestValues.target(), thread: row,
      configuration: row.config, launch: launch, capabilities: capabilities, canOperate: blocked != 0,
      isBusy: blocked == 1, hasLoadedHistory: blocked != 2, pendingSteer: blocked == 3,
      queuedFollowUp: blocked == 4, openRequest: blocked == 5, activeSubAgent: blocked == 6)
  }

  func testOnlyKnownLiveLaunchFactsCanRequestARelaunch() throws {
    let row = thread(), state = CrewRuntimeLaunchState()
    XCTAssertNil(candidate(row, state.snapshot), "older hosts and unread snapshots remain unknown")
    state.receive(event(row, config: nil), sequence: 1, thread: row)
    XCTAssertNil(state.snapshot)
    state.receive(event(row), sequence: 2, thread: row)
    let requested = try XCTUnwrap(candidate(row, state.snapshot))
    XCTAssertTrue(state.reserve(requested))
    XCTAssertFalse(state.reserve(requested), "including after a failed or ambiguous unload")
    state.clear()
    XCTAssertNil(state.snapshot)
    state.receive(event(row), sequence: 3, thread: row)
    XCTAssertFalse(state.reserve(requested), "connectivity loss must not retry a mutation")
    state.reset()
    state.receive(event(row), sequence: 4, thread: row)
    XCTAssertTrue(state.reserve(requested), "a new view activation has a fresh attempt owner")
  }

  func testEveryPendingWorkGateAndUnknownCapabilityBlocksRuntimeUnload() {
    let row = thread(), state = CrewRuntimeLaunchState()
    state.receive(event(row), sequence: 2, thread: row)
    for gate in 0...6 { XCTAssertNil(candidate(row, state.snapshot, blocked: gate), "gate \(gate)") }
    for caps: [String: JSONValue] in [[:], ["mcpScope": .object(["gui": .string("live")])]] {
      XCTAssertNil(candidate(row, state.snapshot, capabilities: caps))
    }
    for status in ["working", "launching", "needs_approval", "needs_reply", "inactive"] {
      var busy = row; busy.status = status
      XCTAssertNil(candidate(busy, state.snapshot))
    }
    var terminal = row; terminal.presentationMode = "terminal"
    XCTAssertNil(candidate(terminal, state.snapshot))
    var noSession = row; noSession.sessionRef = nil
    XCTAssertNil(candidate(noSession, state.snapshot))
    var futureCrew = row; futureCrew.config.crew = .object(["version": .number(2)])
    XCTAssertNil(candidate(futureCrew, state.snapshot))
    state.receive(event(row, config: .object(["model": .string("lead"), "crossagentMcp": .bool(true)])), sequence: 3, thread: row)
    XCTAssertNil(candidate(row, state.snapshot), "already enabled helpers never restart")
  }

  func testStaleForeignMalformedAndReplacedRuntimeMetadataCannotTriggerUnload() {
    let row = thread(), state = CrewRuntimeLaunchState()
    state.receive(event(row, config: .object(["model": .string("lead"), "crossagentMcp": .bool(true)])), sequence: 5, thread: row)
    state.receive(event(row), sequence: 4, thread: row)
    XCTAssertEqual(state.snapshot?.configuration.crossagentMcp, true)
    var foreign = event(row); foreign["agentKind"] = .string("different-provider")
    state.receive(foreign, sequence: 6, thread: row)
    XCTAssertEqual(state.snapshot?.configuration.crossagentMcp, true)
    var replacement = row; replacement.agentInstanceId = "different-instance"
    XCTAssertNil(candidate(replacement, state.snapshot))
    state.receive(event(replacement, config: nil), sequence: 7, thread: replacement)
    XCTAssertNil(state.snapshot, "an omitted field cannot inherit a previous runtime's facts")
    state.receive(event(replacement, config: .string("malformed")), sequence: 8, thread: replacement)
    XCTAssertNil(state.snapshot)
    state.receive(event(row), sequence: 9, thread: row)
    var exited = row; exited.status = "inactive"
    state.receive(event(exited), sequence: 10, thread: exited)
    XCTAssertNil(state.snapshot)
    state.clear(through: 12)
    state.receive(event(row), sequence: 11, thread: row)
    XCTAssertNil(state.snapshot, "an exit drain keeps its sequence fence")
  }

  func testCrewFingerprintMatchesSemanticRosterChangesRatherThanSavedIdentity() throws {
    var binding = try XCTUnwrap(ThreadCrewBinding(wire: thread().config.crew))
    let first = CrewRuntimeLaunchState.fingerprint(binding)
    binding.crewID = "other-saved-crew"
    XCTAssertEqual(first, CrewRuntimeLaunchState.fingerprint(binding))
    binding.roles[0].brief = "Review correctness"
    XCTAssertNotEqual(first, CrewRuntimeLaunchState.fingerprint(binding))
  }

  func testSuiteRetiresLaunchFactsAcrossHostAndBackgroundBoundaries() {
    let suite = RichChatControllerSuite(gateway: RichChatControllerGatewayFake())
    let row = thread(), access = RichChatControllerTestValues.access()
    suite.select(access: access, threadID: row.id)
    suite.runtimeLaunch.receive(event(row), sequence: 1, thread: row)
    suite.updateAccess(RichChatControllerTestValues.access(online: false))
    XCTAssertNil(suite.runtimeLaunch.snapshot)
    suite.updateAccess(access)
    suite.runtimeLaunch.receive(event(row), sequence: 2, thread: row)
    suite.enterBackground()
    XCTAssertNil(suite.runtimeLaunch.snapshot)
    suite.leaveBackground(access: access)
    suite.runtimeLaunch.receive(event(row), sequence: 3, thread: row)
    suite.select(access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB), threadID: row.id)
    XCTAssertNil(suite.runtimeLaunch.snapshot)
    suite.runtimeLaunch.receive(event(row), sequence: 4, thread: row)
    suite.deselect()
    XCTAssertNil(suite.runtimeLaunch.snapshot)
  }
}
