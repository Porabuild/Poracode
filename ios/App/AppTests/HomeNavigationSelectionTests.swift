import XCTest
@testable import App

@MainActor final class HomeNavigationSelectionTests: XCTestCase {
  func testCompletionDismissesOnlyTheSameOpenThreadWhenItBecomesDone() {
    let a = CompositeRemoteID(connectionId: ClientConnectionID(), remoteId: "same")
    let b = CompositeRemoteID(connectionId: ClientConnectionID(), remoteId: "same")
    let open = HomeThreadCompletion(id: a, isDone: false)
    let done = HomeThreadCompletion(id: a, isDone: true)
    XCTAssertTrue(done.becameDone(after: open))
    XCTAssertFalse(done.becameDone(after: nil))
    XCTAssertFalse(done.becameDone(after: done))
    XCTAssertFalse(open.becameDone(after: done))
    XCTAssertFalse(done.becameDone(after: HomeThreadCompletion(id: b, isDone: false)))
  }

  func testRecentKeyboardCycleUsesStableOrderAndWindowLocalHistory() {
    let navigation = HomeNavigationSelection(), otherWindow = HomeNavigationSelection()
    let visible: Set<String> = ["host-a:one", "host-b:one", "host-a:two"]
    for id in ["host-a:one", "host-b:one", "host-a:two"] { navigation.viewThread(id) }
    XCTAssertTrue(navigation.hasRecentThread(otherThan: "host-a:two", visible: visible))
    XCTAssertFalse(otherWindow.hasRecentThread(otherThan: "host-a:two", visible: visible))
    XCTAssertEqual(navigation.cycleRecentThread(from: "host-a:two", visible: visible, direction: .next), "host-b:one")
    navigation.viewThread("host-b:one")
    XCTAssertEqual(navigation.cycleRecentThread(from: "host-b:one", visible: visible, direction: .next), "host-a:one")
    navigation.viewThread("host-a:one")
    XCTAssertEqual(navigation.cycleRecentThread(from: "host-a:one", visible: visible, direction: .previous), "host-b:one")
    navigation.viewThread("host-b:one")
    let filtered = visible.subtracting(["host-a:two"])
    XCTAssertEqual(navigation.cycleRecentThread(from: "host-b:one", visible: filtered, direction: .previous), "host-a:one")
    navigation.viewThread(nil)
    navigation.viewThread("host-a:two")
    XCTAssertEqual(navigation.cycleRecentThread(from: "host-a:two", visible: visible, direction: .next), "host-b:one")
  }

  func testRecentCycleRetainsItsOrderWhileTheRequestedHostInstalls() throws {
    let navigation = HomeNavigationSelection()
    let visible: Set<String> = ["host-a:terminal", "host-b:one", "host-a:one"]
    for id in ["host-a:terminal", "host-b:one", "host-a:one"] { navigation.viewThread(id) }
    let next = try XCTUnwrap(navigation.cycleRecentThread(from: "host-a:one", visible: visible, direction: .next))
    XCTAssertEqual(next, "host-b:one")
    let ticket = navigation.begin(next)
    navigation.viewThread(nil)
    XCTAssertTrue(navigation.accept(ticket))
    navigation.viewThread(next)
    XCTAssertEqual(navigation.cycleRecentThread(from: next, visible: visible, direction: .previous), "host-a:one")
  }

  func testSelectionInstalledPrecedesHandshakeAndSameHostNavigationKeepsConnecting() async throws {
    let (session, hosts, _) = try await navigationSession()
    let target = try XCTUnwrap(hosts.first { $0.desktopId == "desk-b" })
    let gate = AsyncGate()
    var installed = false, finished = false
    let switching = Task { @MainActor in
      await session.switchHost(target.connectionId, selectionInstalled: { id in
        installed = true
        XCTAssertEqual(id, target.connectionId)
        XCTAssertEqual(session.phase, .connecting)
        XCTAssertEqual(session.profile?.desktopId, "desk-b")
        XCTAssertEqual(session.state.accessToken, "token-b")
        XCTAssertFalse(session.currentRichChatAccess?.isReady == true)
        XCTAssertFalse(session.currentRichChatAccess?.isOnline == true)
        (session.state.api as? FakeRemoteAPI)?.environmentGate = gate
      })
      finished = true
    }
    try await gate.waitUntilWaiting()
    XCTAssertTrue(installed); XCTAssertFalse(finished)
    let client = try XCTUnwrap(session.state.api as? FakeRemoteAPI)
    var secondPresented = false
    await session.switchHost(target.connectionId, selectionInstalled: { _ in secondPresented = true })
    XCTAssertTrue(secondPresented); XCTAssertFalse(finished)
    XCTAssertTrue(session.state.api === client)
    XCTAssertEqual(client.environmentCalls, 1)
    await gate.resume(); await switching.value
    XCTAssertEqual(session.phase, .ready)
    XCTAssertNil(session.state.pendingHostSelection)
  }

  func testOlderHandshakeCannotPublishCapabilitiesAfterANewerHostWins() async throws {
    let (session, hosts, _) = try await navigationSession()
    let b = try XCTUnwrap(hosts.first { $0.desktopId == "desk-b" })
    let c = try XCTUnwrap(hosts.first { $0.desktopId == "desk-c" })
    let gate = AsyncGate()
    let old = Task { @MainActor in
      await session.switchHost(b.connectionId, selectionInstalled: { _ in
        (session.state.api as? FakeRemoteAPI)?.environmentGate = gate
      })
    }
    try await gate.waitUntilWaiting()
    await session.switchHost(c.connectionId)
    let current = try XCTUnwrap(session.state.api as? FakeRemoteAPI)
    XCTAssertEqual(session.phase, .ready)
    await gate.resume(); await old.value
    XCTAssertEqual(session.selectedConnectionId, c.connectionId)
    XCTAssertEqual(session.profile?.desktopId, "desk-c")
    XCTAssertTrue(session.state.api === current)
    XCTAssertFalse(current.observedDesktopIDs.contains("desk-b"))
    XCTAssertEqual(session.phase, .ready)
  }

  func testReturningToTheOriginalHostSupersedesAnotherUncommittedSelection() async throws {
    let (session, hosts, _) = try await navigationSession()
    let b = try XCTUnwrap(hosts.first { $0.desktopId == "desk-b" })
    let original = try XCTUnwrap(session.selectedConnectionId)
    let gate = AsyncGate()
    await session.deps.hostCatalog.setMutationCheckpoint { await gate.wait() }
    var stalePresented = false
    let old = Task { @MainActor in
      await session.switchHost(b.connectionId, selectionInstalled: { _ in stalePresented = true })
    }
    try await gate.waitUntilWaiting()
    XCTAssertEqual(session.selectedConnectionId, original)
    await session.switchHost(original)
    await gate.resume(); await old.value
    XCTAssertFalse(stalePresented)
    XCTAssertEqual(session.selectedConnectionId, original)
    XCTAssertEqual(session.profile?.desktopId, "desk-c")
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selectedConnectionId, original)
    XCTAssertEqual(session.phase, .ready)
  }

  func testAThreadPageCannotRebindItsCollidingIDToAnotherHost() async throws {
    let (session, hosts, _) = try await navigationSession()
    let page = RichChatThreadPageState(session: session, threadID: "collision")
    XCTAssertEqual(page.thread?.id, "collision")
    let other = try XCTUnwrap(hosts.first { $0.desktopId == "desk-a" })
    await session.switchHost(other.connectionId)
    XCTAssertNil(page.thread); XCTAssertNil(page.projectLocation)
    XCTAssertFalse(page.canOperate); XCTAssertFalse(page.canOperateTerminal)
    XCTAssertFalse(page.canResolveRequests)
    await page.activate(); page.updateAccess()
    XCTAssertNil(page.suite.scope.target)
    page.detach()
  }

  func testLatestTapOwnsPresentationAndAnOlderCompletionCannotClearIt() {
    let selection = HomeNavigationSelection()
    let first = selection.begin("host-a:thread")
    let second = selection.begin("host-b:thread")
    XCTAssertFalse(selection.isCurrent(first))
    XCTAssertFalse(selection.accept(first))
    selection.finish(first)
    XCTAssertEqual(selection.openingID, "host-b:thread")
    XCTAssertTrue(selection.accept(second))
    XCTAssertNil(selection.openingID)
  }

  func testSupersededCredentialFailureCannotReplaceTheNewHostWithAnError() async throws {
    let (session, hosts, keychain) = try await navigationSession()
    let b = try XCTUnwrap(hosts.first { $0.desktopId == "desk-b" })
    let c = try XCTUnwrap(hosts.first { $0.desktopId == "desk-c" })
    try keychain.delete(account: HostVault.account(for: b.connectionId))
    let gate = AsyncGate()
    await session.deps.hostCatalog.setReadCheckpoint(.token) { await gate.wait() }
    var oldPresented = false
    let old = Task { @MainActor in
      await session.switchHost(b.connectionId, selectionInstalled: { _ in oldPresented = true })
    }
    try await gate.waitUntilWaiting()
    await session.switchHost(c.connectionId)
    await gate.resume(); await old.value
    XCTAssertFalse(oldPresented)
    XCTAssertEqual(session.selectedConnectionId, c.connectionId)
    XCTAssertEqual(session.phase, .ready)
    XCTAssertNil(session.state.globalError)
  }

  func testRetiredCapabilitySnapshotCannotRestoreThePreviousHost() async throws {
    let (session, hosts, _) = try await navigationSession()
    let a = try XCTUnwrap(hosts.first { $0.desktopId == "desk-a" })
    let original = try XCTUnwrap(session.selectedConnectionId)
    (session.state.api as? FakeRemoteAPI)?.hostCapabilitiesResult = .success(.init(ssh: true))
    let gate = AsyncGate()
    await session.deps.hostCatalog.setReadCheckpoint(.snapshot) { await gate.wait() }
    let old = Task { @MainActor in
      await session.refreshStoredHostCapabilities(generation: session.state.workGeneration)
    }
    try await gate.waitUntilWaiting()
    await session.switchHost(a.connectionId)
    let current = session.state.api
    await gate.resume(); await old.value
    XCTAssertNotEqual(session.selectedConnectionId, original)
    XCTAssertEqual(session.selectedConnectionId, a.connectionId)
    XCTAssertEqual(session.profile?.desktopId, "desk-a")
    XCTAssertTrue(session.state.api === current)
    XCTAssertEqual(session.phase, .ready)
  }

  func testRepeatingTheSameDestinationStillRetiresThePreviousAttempt() {
    let selection = HomeNavigationSelection()
    let first = selection.begin("same")
    let second = selection.begin("same")
    XCTAssertFalse(selection.accept(first))
    selection.finish(first)
    XCTAssertEqual(selection.openingID, "same")
    XCTAssertTrue(selection.accept(second))
  }

  func testLeavingTheIntentPreventsDelayedNavigationAndOtherWindowsAreIndependent() {
    let firstWindow = HomeNavigationSelection(), otherWindow = HomeNavigationSelection()
    let abandoned = firstWindow.begin("thread")
    let other = otherWindow.begin("project")
    firstWindow.invalidate()
    XCTAssertFalse(firstWindow.accept(abandoned))
    XCTAssertNil(firstWindow.openingID)
    XCTAssertTrue(otherWindow.accept(other))
  }

  private func navigationSession() async throws -> (AppSession, [HostRecord], InMemoryKeychainIO) {
    let suite = "host-navigation-\(UUID().uuidString)"
    let (session, repo, keychain) = try await makeSession(suite: suite) { endpoint, token in
      let name = URL(string: endpoint)?.host?.split(separator: ".").first.map(String.init) ?? "unknown"
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-\(name)", label: "Desktop \(name.uppercased())"))
      api.tokenResult = .success(.init(accessToken: "token-\(name)", tokenType: "Bearer", expiresAt: "2099-01-01T00:00:00.000Z", scopes: ProtocolConstants.standardScopes))
      api.snapshotResult = .success(makeShell(seq: 10, threads: [makeThread(id: "collision")]))
      return api
    }
    addTeardownBlock {
      await repo.wipeSuiteForTests()
      await session.deps.hostCatalog.wipeForTests()
      try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory.appendingPathComponent("poracode-composition-hosts-\(suite)"))
    }
    for name in ["a", "b", "c"] {
      await session.pair(with: .init(manualBaseURL: "https://\(name).test", manualToken: "pair-\(name)"))
      XCTAssertEqual(session.phase, .ready)
    }
    let durable = try await session.deps.hostCatalog.snapshot()
    return (session, durable.hosts, keychain)
  }
}
