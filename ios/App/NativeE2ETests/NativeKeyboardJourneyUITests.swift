import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testJumpToBottomAdaptsAcrossDisplaysAndReturnsToLatestReply() async throws {
    let (input, jump) = try await prepareFindAtAnEarlierReply()
    try await assertNativeDuoDisplayTransitions("jump-bottom", content: input, availableAction: jump) { pose in
      XCTAssertTrue(jump.exists)
      if pose == "outer" { self.assertNativeDuoToolbarRail(jump) }
    }
    try await jumpToLatestReply(jump)
    XCTAssertTrue(input.exists)
    for frame in ["runtime-live-turn-started", "runtime-live-item-started", "runtime-live-content-delta"] {
      _ = try await control(path: "/v1/frames/\(frame)", method: "POST")
    }
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("Native live update") }
  }

  func testJumpToBottomKeepsLatestAcrossDisplaysWithFindOpen() async throws {
    let (input, jump) = try await prepareFindAtAnEarlierReply()
    try await jumpToLatestReply(jump)
    try await assertNativeDuoDisplayTransitions("jump-bottom-latest", content: input, availableAction: nil) { _ in
      XCTAssertEqual(input.value as? String, "NEEDLEALPHA")
    }
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEOMEGA") && !jump.exists }
    XCTAssertTrue(input.exists)
    app.buttons["native-e2e.chat-find-next"].firstMatch.tap()
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("begins the reply") }
    keyboardProof("jump-bottom-find-revisited")
  }

  private func prepareFindAtAnEarlierReply() async throws -> (input: XCUIElement, jump: XCUIElement) {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the long conversation fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/chat-find-long-reply", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    let sidebar = app.buttons["native-e2e.sidebar-toggle"].firstMatch
    if !thread.isHittable && sidebar.exists { sidebar.tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let jump = app.descendants(matching: .any)["native-e2e.timeline-jump-bottom"].firstMatch
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEOMEGA") }
    XCTAssertFalse(jump.exists)

    app.buttons["native-e2e.thread.actions"].firstMatch.tap()
    app.buttons["Find in chat"].firstMatch.tap()
    let input = app.textFields["native-e2e.chat-find-query"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText("NEEDLEALPHA")
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("begins the reply") }
    try await poll { jump.isHittable }
    assertNativeDuoToolbarRail(jump)
    keyboardProof("jump-bottom-before")
    return (input, jump)
  }

  private func jumpToLatestReply(_ jump: XCUIElement) async throws {
    try await poll { jump.isHittable }
    try await tapNativeToolbarActionAfterDisplayTransition(jump)
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEOMEGA") }
    try await poll { !jump.exists }
    keyboardProof("jump-bottom-returned-to-latest")
  }

  func testActiveFindSurvivesDuoFoldFromProjectThread() async throws {
    let transitionURL = try duoTransitionURL()
    struct FoldState: Decodable {
      let query: String?
      let matchCount: String?
      let transcriptVisible: Bool
      let controlsInline: Bool?
    }
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await openDuoFixtureProjectThread(transitionURL)
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))

    try await driveDuo("open-find", transitionURL)
    let field = app.textFields["native-e2e.chat-find-query"]
    XCTAssertTrue(field.waitForExistence(timeout: 5)); field.typeText("e")
    let count = app.staticTexts["native-e2e.chat-find-count"]
    let next = app.buttons["native-e2e.chat-find-next"]
    try await poll { count.label == "1 of 3" }
    app.buttons["Match case"].tap()
    next.tap()
    try await poll { count.label == "2 of 3" }

    for stage in ["unfold", "partial", "fold"] {
      // XCTest can hold the outer display's hierarchy while Duo is open.
      // The transition driver reads the active display after the hinge settles.
      let state = try JSONDecoder().decode(FoldState.self, from: try await driveDuo(stage, transitionURL))
      XCTAssertEqual(state.query, "e", stage)
      XCTAssertEqual(state.matchCount, "2 of 3", stage)
      XCTAssertTrue(state.transcriptVisible, stage)
      XCTAssertEqual(state.controlsInline, stage != "fold", stage)
    }

    try await poll { field.exists && field.value as? String == "e" && count.exists && count.label == "2 of 3" }
    XCTAssertTrue(app.buttons["Match case"].isSelected)
    next.tap()
    try await poll { count.label == "3 of 3" }
    app.buttons["native-e2e.chat-find-close"].tap()
    // The outer display puts Back in Duo's vertical system bar.
    try await driveDuo("return-project", transitionURL)
    XCTAssertTrue(app.navigationBars["Fixture Project"].waitForExistence(timeout: 5))
  }

  func testLongFindSurvivesDuoFoldWithKeyboardOpen() async throws {
    let transitionURL = try duoTransitionURL()
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/chat-find-long-reply", method: "POST")
    try await openDuoFixtureProjectThread(transitionURL)
    try await driveDuo("open-find", transitionURL)

    let field = app.textFields["native-e2e.chat-find-query"]
    XCTAssertTrue(field.waitForExistence(timeout: 5)); field.typeText("needle")
    let count = app.staticTexts["native-e2e.chat-find-count"]
    try await poll { count.label == "1 of 2" }
    app.buttons["native-e2e.chat-find-next"].tap()
    try await poll { count.label == "2 of 2" }

    struct LongFindState: Decodable {
      let query: String?
      let matchCount: String?
      let matchVisible: Bool
      let keyboardVisible: Bool
    }

    func check(_ state: LongFindState, stage: String, count: String) {
      XCTAssertEqual(state.query, "needle", stage)
      XCTAssertEqual(state.matchCount, count, stage)
      XCTAssertTrue(state.keyboardVisible, "\(stage) must show the software keyboard")
      XCTAssertTrue(state.matchVisible, "\(stage) must show the selected match above the keyboard")
    }

    var observed: [(String, LongFindState)] = []
    for stage in ["outer", "unfold", "partial", "fold"] {
      let state = try JSONDecoder().decode(LongFindState.self, from: try await driveDuo(stage, transitionURL))
      observed.append((stage, state))
    }
    for (stage, state) in observed {
      check(state, stage: stage, count: "2 of 2")
    }

    app.buttons["native-e2e.chat-find-previous"].tap()
    try await poll { count.label == "1 of 2" }
    let first = try JSONDecoder().decode(LongFindState.self, from: try await driveDuo("outer-first", transitionURL))
    check(first, stage: "outer-first", count: "1 of 2")
  }

  private func duoTransitionURL() throws -> URL {
    let address = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"]
    try XCTSkipUnless(address != nil, "This journey requires the Duo transition driver.")
    return try XCTUnwrap(address.flatMap { URL(string: $0) })
  }

  @discardableResult
  private func driveDuo(_ action: String, _ transitionURL: URL) async throws -> Data {
    let (data, response) = try await URLSession.shared.data(from: transitionURL.appendingPathComponent(action))
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, action)
    return data
  }

  private func openDuoFixtureProjectThread(_ transitionURL: URL) async throws {
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    XCTAssertTrue(thread.waitForExistence(timeout: 10))
    thread.press(forDuration: 0.65)
    let project = app.buttons["Project"]
    XCTAssertTrue(project.waitForExistence(timeout: 5))
    try await driveDuo("open-project", transitionURL)
    XCTAssertTrue(app.navigationBars["Fixture Project"].waitForExistence(timeout: 5))
    thread.tap()
  }

  func testHardwareFindInChatNavigatesMatchesAndCloses() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the conversation fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()

    let field = app.textFields["native-e2e.chat-find-query"]
    func openFindByKeyboard() async throws {
      // The simulator's XCTest event can bypass the native Find command.
      if let address = ProcessInfo.processInfo.environment["NATIVE_E2E_FIND_KEY_URL"] {
        let url = try XCTUnwrap(URL(string: address))
        XCTAssertEqual(url.host, "127.0.0.1")
        let (_, response) = try await URLSession.shared.data(from: url)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      } else {
        app.typeKey("f", modifierFlags: .command)
      }
    }
    try await openFindByKeyboard()
    let openedInitially = field.waitForExistence(timeout: 5)
    keyboardProof("transcript-find-before-touch")
    XCTAssertTrue(openedInitially, "Command-F must open Find from the transcript")
    app.buttons["native-e2e.chat-find-close"].tap()
    try await poll { !field.exists }
    app.buttons["native-e2e.thread.actions"].tap()
    let openFind = app.buttons["Find in chat"]
    XCTAssertTrue(openFind.waitForExistence(timeout: 5)); openFind.tap()
    let touchOpened = field.waitForExistence(timeout: 5)
    keyboardProof("transcript-find-after-menu")
    XCTAssertTrue(touchOpened)
    app.buttons["native-e2e.chat-find-close"].tap()
    try await poll { !field.exists }
    try await openFindByKeyboard()
    let keyOpened = field.waitForExistence(timeout: 5)
    keyboardProof("transcript-find-after-command-f")
    XCTAssertTrue(keyOpened)
    field.typeText("e")
    let count = app.staticTexts["native-e2e.chat-find-count"]
    try await poll { count.label == "1 of 3" }
    app.buttons["native-e2e.chat-find-next"].tap()
    try await poll { count.label == "2 of 3" }
    app.buttons["native-e2e.chat-find-previous"].tap()
    try await poll { count.label == "1 of 3" }
    keyboardProof("transcript-find-highlight")

    app.buttons["Clear search"].tap()
    field.typeText("FIXTURE")
    try await poll { count.label == "1 of 1" }
    app.buttons["Match case"].tap()
    try await poll { count.label == "No results" }
    app.buttons["native-e2e.chat-find-close"].tap()
    XCTAssertFalse(field.exists)
    XCTAssertTrue(app.staticTexts["Fixture response"].exists)
  }

  func testFindScrollsToEachMatchWithinOneLongReply() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses a long conversation fixture.")
    XCUIDevice.shared.orientation = .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/chat-find-long-reply", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    let sidebar = app.buttons["native-e2e.sidebar-toggle"]
    if !thread.isHittable && sidebar.exists { sidebar.tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 15)); thread.tap()

    let actions = app.buttons["native-e2e.thread.actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 10)); actions.tap()
    let openFind = app.buttons["Find in chat"]
    XCTAssertTrue(openFind.waitForExistence(timeout: 5)); openFind.tap()
    let field = app.textFields["native-e2e.chat-find-query"]
    XCTAssertTrue(field.waitForExistence(timeout: 5)); field.typeText("needle")
    let count = app.staticTexts["native-e2e.chat-find-count"]
    try await poll { count.label == "1 of 2" }
    keyboardProof("long-find-first-position")
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEALPHA") }
    keyboardProof("long-find-first-visible")

    app.buttons["native-e2e.chat-find-next"].tap()
    try await poll { count.label == "2 of 2" }
    keyboardProof("long-find-last-position")
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEOMEGA") }
    keyboardProof("long-find-last-visible")

    app.buttons["native-e2e.chat-find-previous"].tap()
    try await poll { count.label == "1 of 2" }
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("NEEDLEALPHA") }
  }

  func testHardwareSearchWorkspaceAndEditorCommands() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled workspace fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/keyboard-workspace-ready", method: "POST")
    try await pairUntilHome()

    app.typeKey("k", modifierFlags: .command)
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.typeText("Open Settings")
    let settingsCommand = app.buttons["native-e2e.search-command.settings.open"]
    XCTAssertTrue(settingsCommand.waitForExistence(timeout: 5)); settingsCommand.tap()
    let closeSettings = app.buttons["native-e2e.settings.close"]
    XCTAssertTrue(closeSettings.waitForExistence(timeout: 5)); closeSettings.tap()
    app.typeKey("k", modifierFlags: .command)
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.typeText("Fixture")
    let result = app.buttons["native-e2e.search-thread.thread-fixture-001"]
    XCTAssertTrue(result.waitForExistence(timeout: 5)); result.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    keyboardProof("search-result-opened")

    app.typeKey("e", modifierFlags: [.command, .shift])
    let file = app.descendants(matching: .any)["native-e2e.project-file.README.md"].firstMatch
    let openedFiles = file.waitForExistence(timeout: 10)
    keyboardProof("workspace-after-files-shortcut")
    XCTAssertTrue(openedFiles)
    let searchFiles = app.buttons["Search files"]
    XCTAssertTrue(searchFiles.waitForExistence(timeout: 5)); searchFiles.tap()
    let fileQuery = app.textFields["Search files"]
    XCTAssertTrue(fileQuery.waitForExistence(timeout: 5))
    fileQuery.typeText("README")
    XCTAssertEqual(fileQuery.value as? String, "README")
    try await waitForObservedOperation(hostID: "primary", operationID: "procedure:searchProjectFiles")
    let cancelFileSearch = app.buttons["Cancel"].firstMatch
    XCTAssertTrue(fileQuery.isHittable)
    XCTAssertTrue(cancelFileSearch.isHittable)
    keyboardProof("workspace-files-search")
    cancelFileSearch.tap()
    XCTAssertTrue(file.waitForExistence(timeout: 5))
    func tapFile() { file.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.5)).tap() }
    tapFile()
    try await waitForObservedOperation(hostID: "primary", operationID: "procedure:readProjectFile")
    let editor = app.textViews["native-e2e.project-file-editor"]
    let openedEditor = editor.waitForExistence(timeout: 10)
    keyboardProof("file-after-row-tap")
    XCTAssertTrue(openedEditor)
    // The sheet's text view extends beneath its chrome. Focus the text line.
    if UIDevice.current.userInterfaceIdiom == .pad {
      editor.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.12)).tap()
    } else {
      editor.tap()
    }
    editor.typeText(" Keyboard save proof")
    let closeDetail = app.buttons["native-e2e.project-workspace.close-detail"]
    if !closeDetail.exists {
      closeKeyboardEditorPage()
      XCTAssertTrue(file.waitForExistence(timeout: 5))
      app.typeKey("e", modifierFlags: [.command, .shift])
      let confirmDiscard = app.alerts["Discard unsaved changes?"]
      XCTAssertTrue(confirmDiscard.waitForExistence(timeout: 5))
      confirmDiscard.buttons["Cancel"].tap()
      tapFile()
      XCTAssertTrue(editor.waitForExistence(timeout: 5))
      XCTAssertTrue((editor.value as? String)?.contains("Keyboard save proof") == true)
      editor.tap()
    }
    app.typeKey("s", modifierFlags: .command)
    try await waitForObservedOperation(hostID: "primary", operationID: "procedure:writeProjectFile")
    app.typeKey("v", modifierFlags: [.control, .shift])
    XCTAssertTrue(app.staticTexts["File contents"].waitForExistence(timeout: 5))
    XCTAssertFalse(editor.isHittable)
    keyboardProof("markdown-preview-after-keyboard-save")

    if closeDetail.exists {
      closeDetail.tap()
    } else {
      closeKeyboardEditorPage()
    }
    XCTAssertTrue(file.waitForExistence(timeout: 5))
    app.typeKey("p", modifierFlags: .command)
    try await poll { !file.isHittable && self.app.staticTexts["Fixture response"].isHittable }
    app.typeKey("g", modifierFlags: [.command, .shift])
    try await waitForObservedOperation(hostID: "primary", operationID: "procedure:getGitStatus")
    keyboardProof("git-opened-with-shortcut")
  }

  private func closeKeyboardEditorPage() {
    let back = app.navigationBars["README.md"].buttons.matching(NSPredicate(format: "label IN %@", ["Files", "Back"])).firstMatch
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    back.tap()
  }

  func testHardwareTerminalShortcutOpensTheThreadWorkspace() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the terminal fixture and its operation journal.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()

    app.typeKey("`", modifierFlags: .control)
    let send = app.buttons["native-e2e.terminal.send"]
    XCTAssertTrue(send.waitForExistence(timeout: 15))
    let input = app.descendants(matching: .any)["native-e2e.terminal.input"].firstMatch
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap()
    input.typeText("echo keyboard-terminal")
    keyboardProof("terminal-shortcut-before-send")
    try await poll { send.isHittable && send.isEnabled }
    if UIDevice.current.userInterfaceIdiom == .pad {
      let keyboard = app.keyboards.firstMatch
      XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
      XCTAssertLessThanOrEqual(send.frame.maxY, keyboard.frame.minY + 1)
    }
    keyboardProof("terminal-shortcut-keyboard")
    send.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:terminal-write", count: 1)
    keyboardProof("terminal-shortcut")
  }

  func testHardwareBrowserTabCommandReachesTheSelectedHost() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the browser fixture and its operation journal.")
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()

    try await pressNativeE2EShortcut("b", modifiers: [.command, .shift])
    let address = app.textFields["Address"].firstMatch
    XCTAssertTrue(address.waitForExistence(timeout: 10))
    let browserInput = app.descendants(matching: .any)["Type in Browser"].firstMatch
    XCTAssertTrue(browserInput.waitForExistence(timeout: 5)); browserInput.tap()
    let firstCount = try await journalCount(hostID: "primary", operationID: "route:browser-command")
    try await pressNativeE2EShortcut("l", modifiers: .command)
    address.typeText("x")
    XCTAssertTrue((address.value as? String)?.hasSuffix("x") == true)
    keyboardProof("browser-address-focused")
    try await pressNativeE2EShortcut("t", modifiers: .command)
    try await waitForJournal(hostID: "primary", operationID: "route:browser-command", count: firstCount + 1)
    try await poll { address.value as? String == "https://duckduckgo.com" }
    keyboardProof("browser-tab-created-from-address")
    browserInput.tap()
    try await pressNativeE2EShortcut("t", modifiers: .command)
    try await waitForJournal(hostID: "primary", operationID: "route:browser-command", count: firstCount + 2)
    keyboardProof("browser-tab-created-with-shortcut")
  }

  func testBrowserMirrorKeepsAddressAndTabActionsInTheIPadInspector() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real"
      || UIDevice.current.userInterfaceIdiom != .pad,
      "This journey uses the iPad project inspector with a disposable host.")
    XCUIDevice.shared.orientation = .landscapeLeft
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()

    try await pressNativeE2EShortcut("b", modifiers: [.command, .shift])
    let address = app.textFields["Address"].firstMatch
    let localNewTab = app.buttons["native-e2e.browser.inspector-new-tab"].firstMatch
    XCTAssertTrue(address.waitForExistence(timeout: 10))
    XCTAssertTrue(localNewTab.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["native-e2e.browser.new-tab"].exists)
    XCTAssertTrue(app.staticTexts["Fixture response"].exists)
    let browserCommand = "route:browser-command"
    let initialCount = try await journalCount(hostID: "primary", operationID: browserCommand)
    address.tap()
    address.typeKey("a", modifierFlags: .command)
    let destination = "https://example.test/inspector"
    address.typeText(destination)
    let go = app.buttons["native-e2e.browser.go"].firstMatch
    XCTAssertEqual(address.value as? String, destination)
    XCTAssertTrue(go.isHittable)
    keyboardProof("browser-inspector-address")
    go.tap()
    try await waitForJournal(hostID: "primary", operationID: browserCommand, count: initialCount + 1)
    let back = app.buttons["native-e2e.browser.back"].firstMatch
    try await poll { address.value as? String == destination && back.isEnabled }
    XCTAssertTrue(localNewTab.isHittable)
    localNewTab.tap()
    try await waitForJournal(hostID: "primary", operationID: browserCommand, count: initialCount + 2)
    try await poll { address.value as? String == "https://duckduckgo.com" }
    keyboardProof("browser-inspector-new-tab")
  }

  func testKeyboardBindingsEditPersistAndRouteThroughTheActiveScene() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled workspace fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()

    try await keyboardKey(0x36, command: true, shift: true)
    keyboardProof("after-settings-key")
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5), "Shift-command-comma must open Poracode settings")
    let shortcuts = app.buttons["native-e2e.settings.shortcuts"]
    XCTAssertTrue(shortcuts.waitForExistence(timeout: 5)); shortcuts.tap()
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("New Thread")
    let command = app.buttons["native-e2e.keyboard.command.thread.new"]
    XCTAssertTrue(command.waitForExistence(timeout: 5)); command.tap()
    let binding = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.keyboard.binding.thread.new.")).firstMatch
    XCTAssertTrue(binding.waitForExistence(timeout: 5)); binding.tap()
    keyboardProof("binding-editor-opened")
    let keys = app.textFields["native-e2e.keyboard.keys"]
    XCTAssertTrue(keys.waitForExistence(timeout: 5)); keys.tap()
    try await keyboardKey(0x04, command: true)
    keys.typeText("Command+Shift+J")
    let save = app.buttons["native-e2e.keyboard.save"]
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true AND hittable == true"), object: save)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
    XCTAssertEqual(keys.value as? String, "Command+Shift+J")
    XCTAssertTrue(save.isEnabled); XCTAssertTrue(save.isHittable)
    XCTAssertGreaterThanOrEqual(save.frame.height, 44)
    if app.keyboards.firstMatch.exists { XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY) }
    keyboardProof("shortcut-editor-above-keyboard")
    save.tap()
    XCTAssertTrue(binding.waitForExistence(timeout: 5))
    XCTAssertTrue(binding.label.contains("⇧⌘J"))
    binding.tap()
    app.buttons["native-e2e.keyboard.record"].tap()
    XCTAssertTrue(app.otherElements["native-e2e.keyboard.capture"].waitForExistence(timeout: 5)
      || app.staticTexts["Press a key combination. Press Escape to cancel."].exists)
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertFalse(app.buttons["native-e2e.new-thread-close"].exists, "Recording a shortcut must not execute the app action")
    XCTAssertEqual(keys.value as? String, "Shift+Command+N")
    XCTAssertTrue(save.isEnabled); save.tap()
    XCTAssertTrue(binding.waitForExistence(timeout: 5)); XCTAssertTrue(binding.label.contains("⇧⌘N"))
    keyboardProof("recorded-native-shortcut")
    let back = app.navigationBars["New Thread"].buttons["Keyboard Shortcuts"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    let close = app.buttons["native-e2e.settings.close"]
    func rect(_ frame: CGRect) -> [String: Double] {
      ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
    }
    let frameReport: [String: Any] = ["back": rect(back.frame),
      "close": close.exists ? rect(close.frame) : [:],
      "navigationBars": app.navigationBars.allElementsBoundByIndex.map(\.label)]
    let geometry = XCTAttachment(data: try JSONSerialization.data(withJSONObject: frameReport, options: [.sortedKeys]),
      uniformTypeIdentifier: "public.json")
    geometry.name = "keyboard-navigation-geometry"; geometry.lifetime = .keepAlways; add(geometry)
    back.tap()
    XCTAssertTrue(app.navigationBars["Keyboard Shortcuts"].waitForExistence(timeout: 5), "Back must return to the shortcut catalog")
    keyboardProof("back-to-shortcut-catalog")
    app.navigationBars["Keyboard Shortcuts"].buttons["Settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["native-e2e.settings.close"].waitForExistence(timeout: 5))
    app.buttons["native-e2e.settings.close"].tap()

    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    try await keyboardKey(0x11, command: true)
    XCTAssertFalse(prompt.waitForExistence(timeout: 1), "The replaced shortcut must retire")
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    prompt.tap(); prompt.typeText("Retain this native draft")
    try await keyboardKey(0x04, command: true)
    prompt.typeText("Editing shortcuts still work")
    XCTAssertEqual(prompt.value as? String, "Editing shortcuts still work")
    try await keyboardKey(0x05, command: true)
    XCTAssertTrue(prompt.exists); XCTAssertEqual(prompt.value as? String, "Editing shortcuts still work")
    keyboardProof("rebound-command-and-standard-editing")
    app.buttons["native-e2e.new-thread-close"].tap()

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-keybindings-fresh-preferences" }
    try await pairUntilHome()
    try await keyboardKey(0x11, command: true)
    XCTAssertFalse(prompt.waitForExistence(timeout: 1))
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertTrue(prompt.waitForExistence(timeout: 5), "Custom shortcuts must survive app relaunch")
    keyboardProof("shortcut-restored-after-relaunch")
  }

  func testComposerHardwareKeysUseTheFocusedDraftAndRespectModalPickers() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled capability catalog and audio capture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    app.launchArguments.append("-native-e2e-voice-fresh-preferences")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await keyboardKey(0x11, command: true)
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await setPreferenceFast(false)
    prompt.tap(); prompt.typeText("Keep this focused draft")
    XCTAssertTrue(keyboardComposerSummary.contains("Fixture Pro"))
    XCTAssertTrue(keyboardComposerSummary.contains("Low"))
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("High") }
    try await keyboardKey(0x09, command: true, shift: true)
    try await poll { self.keyboardComposerSummary.contains("Fast") }
    try await keyboardKey(0x0F, command: true, shift: true)
    try await poll { self.keyboardComposerSummary.contains("Plan") }
    XCTAssertEqual(prompt.value as? String, "Keep this focused draft", "The plan shortcut must not insert or send a newline")
    try await keyboardKey(0x13, command: true)
    try await poll { !self.keyboardComposerSummary.contains("Ask When Needed") }
    try await keyboardKey(0x13, command: true)
    try await poll { self.keyboardComposerSummary.contains("Ask When Needed") }
    keyboardProof("composer-shortcuts-edit-selections")

    try await keyboardKey(0x10, command: true, shift: true)
    let model = app.buttons["native-e2e.new-thread-model.codex.gpt-5"]
    XCTAssertTrue(model.waitForExistence(timeout: 5), "The model shortcut must open the native model chooser")
    try await keyboardKey(0x17, command: true)
    XCTAssertTrue(model.exists, "A modal model picker must block composer shortcuts behind it")
    keyboardProof("composer-shortcut-native-model-picker")
    app.buttons["Done"].tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertTrue(keyboardComposerSummary.contains("High"), "The blocked shortcut must not edit the underlying draft")
    prompt.typeText(" preserved")
    try await keyboardKey(0x07, command: true, shift: true)
    let stop = app.buttons["native-e2e.voice.stop"]
    let canStop = stop.waitForExistence(timeout: 10)
    keyboardProof("composer-shortcut-starts-dictation")
    XCTAssertTrue(canStop, "Dictation uses the existing recorder and native review sheet")
    try await keyboardKey(0x11, command: true)
    XCTAssertTrue(stop.exists, "The voice sheet must block actions behind it")
    app.buttons["native-e2e.voice.cancel"].tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertEqual(prompt.value as? String, "Keep this focused draft preserved")
    XCTAssertTrue(app.buttons["native-e2e.new-thread-start"].exists)
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  func testMainAndSideChatHardwareKeysFollowTheActualFocusedEditor() async throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad,
      "Two simultaneous docked chat editors require an iPad-sized window.")
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled side-chat capability catalog.")
    XCUIDevice.shared.orientation = .landscapeLeft
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let sidebar = app.buttons["native-e2e.sidebar-toggle"]
    if app.buttons["native-e2e.thread.thread-fixture-001"].isHittable && sidebar.exists { sidebar.tap() }
    app.buttons["native-e2e.composer-collapsed"].tap()
    let main = app.textViews["native-e2e.composer"].firstMatch
    XCTAssertTrue(main.waitForExistence(timeout: 5)); main.tap()
    try await keyboardKey(0x10, command: true, shift: true)
    let model = app.buttons["native-e2e.keyboard.model.gpt-5"]
    XCTAssertTrue(model.waitForExistence(timeout: 5))
    try await keyboardKey(0x11, command: true)
    XCTAssertTrue(model.exists, "A running-thread model picker must block background New Thread")
    model.tap()
    main.typeText("Parent keyboard draft")
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("Low") }
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("High") }
    keyboardProof("parent-composer-keyboard-controls")
    app.buttons["native-e2e.composer.add"].tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    let initial = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(initial.waitForExistence(timeout: 10)); initial.tap()
    let side = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    initial.typeText("Focused side question")
    let nextEffort = keyboardComposerSummary(in: side).contains("Low") ? "High" : "Low"
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary(in: side).contains(nextEffort) }
    if nextEffort == "High" {
      try await keyboardKey(0x17, command: true)
      try await poll { self.keyboardComposerSummary(in: side).contains("Low") }
    }
    let launch = app.buttons["native-e2e.new-thread-start"]
    keyboardProof("side-draft-before-launch")
    XCTAssertTrue(launch.isEnabled, "The edited side draft must remain sendable")
    launch.tap()
    let replied = side.staticTexts["Side reply: Focused side question"].waitForExistence(timeout: 15)
    if !replied {
      keyboardProof("side-launch-incomplete")
      let state = XCTAttachment(string: app.debugDescription)
      state.name = "keyboard-side-launch-state"; state.lifetime = .keepAlways; add(state)
    }
    XCTAssertTrue(replied)
    side.buttons["native-e2e.composer-collapsed"].tap()
    let sideInput = side.textViews["native-e2e.composer"]
    XCTAssertTrue(sideInput.waitForExistence(timeout: 5)); sideInput.tap(); sideInput.typeText("Side keyboard draft")
    let previousSideControls = keyboardComposerSummary(in: side)
    keyboardProof("side-composer-before-key")
    try await keyboardKey(0x17, command: true)
    keyboardProof("side-composer-after-key")
    let controls = XCTAttachment(string: "Before: \(previousSideControls)\nAfter: \(keyboardComposerSummary(in: side))\n\(side.debugDescription)")
    controls.name = "keyboard-side-control-state"; controls.lifetime = .keepAlways; add(controls)
    try await poll { self.keyboardComposerSummary(in: side).contains("High") }
    try hideComposerKeyboard()
    keyboardProof("both-composers-keyboard-hidden")
    let parentInput = try focusKeyboardComposer(in: app, beforeX: side.frame.minX)
    XCTAssertTrue(keyboardComposerSummary(in: app, beforeX: side.frame.minX).contains("High"))
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary(in: self.app, beforeX: side.frame.minX).contains("Low") }
    XCTAssertEqual(parentInput.value as? String, "Parent keyboard draft")
    try hideComposerKeyboard()
    let restoredSideInput = try focusKeyboardComposer(in: side)
    XCTAssertTrue(keyboardComposerSummary(in: side).contains("High"), "Changing the parent must leave the side-chat controls alone")
    XCTAssertEqual(restoredSideInput.value as? String, "Side keyboard draft")
    keyboardProof("focused-main-and-side-chat-actions")
    app.buttons["native-e2e.side-chat.hide"].tap()
  }

  private var keyboardComposerSummary: String { keyboardComposerSummary(in: app) }

  private func hideComposerKeyboard() throws {
    guard app.keyboards.firstMatch.exists else { return }
    let hide = app.keyboards.buttons["Hide keyboard"]
    XCTAssertTrue(hide.waitForExistence(timeout: 5)); hide.tap()
  }

  private func focusKeyboardComposer(in root: XCUIElement, beforeX: CGFloat? = nil) throws -> XCUIElement {
    func input() -> XCUIElement? {
      root.textViews.matching(identifier: "native-e2e.composer").allElementsBoundByIndex.first { field in
        beforeX.map { field.frame.maxX <= $0 } ?? true
      }
    }
    if input() == nil {
      let collapsed = try XCTUnwrap(root.buttons.matching(identifier: "native-e2e.composer-collapsed")
        .allElementsBoundByIndex.first { button in beforeX.map { button.frame.maxX <= $0 } ?? true })
      collapsed.tap()
    }
    let field = try XCTUnwrap(input()); field.tap(); return field
  }

  private func keyboardComposerSummary(in root: XCUIElement, beforeX: CGFloat? = nil) -> String {
    func button(_ identifier: String) -> XCUIElement? {
      root.buttons.matching(identifier: identifier).allElementsBoundByIndex.first { element in
        beforeX.map { element.frame.maxX <= $0 } ?? true
      }
    }
    if let combined = button("native-e2e.composer-selectors.combined") { return combined.value as? String ?? "" }
    return ["model", "effort", "permissions", "plan", "fast"].compactMap { name in
      guard let control = button("native-e2e.composer.\(name)") else { return nil }
      return [control.label, control.value as? String].compactMap { $0 }.joined(separator: " ")
    }.joined(separator: ", ")
  }

  private func keyboardKey(_ key: Int, command: Bool = false, shift: Bool = false) async throws {
    let names = [0x36: ",", 0x04: "a", 0x11: "n", 0x05: "b", 0x17: "t", 0x09: "f", 0x13: "p", 0x10: "m", 0x07: "d", 0x0F: "l"]
    let name = try XCTUnwrap(names[key])
    var flags: XCUIElement.KeyModifierFlags = []
    if command { flags.insert(.command) }
    if shift { flags.insert(.shift) }
    app.typeKey(XCUIKeyboardKey(rawValue: name), modifierFlags: flags)
  }

  private func keyboardProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "keyboard-\(name)"; proof.lifetime = .keepAlways; add(proof)
  }
}
