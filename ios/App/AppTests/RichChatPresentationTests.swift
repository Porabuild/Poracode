import XCTest

@testable import App

final class RichChatPresentationTests: XCTestCase {
  func testEditRunsPreserveFindAndLimitTheRenderedRows() {
    func node(_ id: String, _ type: String, path: String? = nil) -> RichVisibleTimelineNode {
      RichVisibleTimelineNode(item: RichRuntimeItem(id: id, type: type, state: .completed,
        payload: path.map { .object(["path": .string($0)]) }, streams: [:], parentItemID: nil), children: [])
    }
    let first = node("first", "file_change", path: " ./src//main.swift ")
    let reasoning = node("middle-thought", RichItemType.reasoning)
    let second = node("second", "file_change", path: "src\\main.swift")
    let trailing = node("trailing", RichItemType.reasoning)
    let different = node("different", "file_change", path: "docs/main.md")
    let command = node("command", "command_execution")
    let last = node("after-command", "file_change", path: "src/main.swift")
    let members = [first, reasoning, second, trailing, different, command, last]
    let rows = RichChatActivityRows(members: members, selectedItemID: nil, previewLimit: 4)
    XCTAssertTrue(rows.hasOverflow)
    XCTAssertNil(rows.wholeFile)
    XCTAssertEqual(rows.visible(showingAll: false).map(\.id), ["trailing", "different", "command", "after-command"])
    let selected = RichChatActivityRows(members: members, selectedItemID: reasoning.item.id, previewLimit: 4)
    XCTAssertTrue(selected.containsSelection)
    let run = selected.visible(showingAll: false).first
    guard case .editRun(let edits)? = run else { return XCTFail("Find must retain the combined row") }
    XCTAssertEqual(edits.members.map(\.item.id), ["first", "middle-thought", "second"])
    XCTAssertEqual(selected.visible(showingAll: true).map(\.id), ["first", "trailing", "different", "command", "after-command"])

    let sameFile = RichChatActivityRows(members: [trailing, first, reasoning, second],
      selectedItemID: trailing.item.id, previewLimit: 1)
    XCTAssertNotNil(sameFile.wholeFile)
    XCTAssertTrue(sameFile.containsSelection)
    XCTAssertFalse(sameFile.hasOverflow)
  }

  func testActivityPreviewAdaptsToTheViewportAndKeepsAnEarlierFindMatchInView() {
    func node(_ id: String, children: [RichTimelineEntry] = []) -> RichVisibleTimelineNode {
      RichVisibleTimelineNode(item: RichRuntimeItem(id: id, type: "reasoning", state: .completed,
        payload: nil, streams: [:], parentItemID: nil), children: children)
    }
    let first = node("1", children: [.item(node("nested-match"))])
    let members = [first] + (2...10).map { node(String($0)) }
    let preview = RichChatActivityRows(members: members, selectedItemID: nil)
    XCTAssertTrue(preview.hasOverflow)
    XCTAssertEqual(preview.visible(showingAll: false).map(\.item.id), (3...10).map(String.init))
    XCTAssertEqual(preview.visible(showingAll: true).count, 10)
    let compact = RichChatActivityRows.previewLimit(availableHeight: 500)
    XCTAssertEqual(compact, 4)
    XCTAssertEqual(RichChatActivityRows.previewLimit(availableHeight: 650), 8)
    let compactPreview = RichChatActivityRows(members: members, selectedItemID: nil, previewLimit: compact)
    XCTAssertEqual(compactPreview.visible(showingAll: false).map(\.item.id), ["7", "8", "9", "10"])
    XCTAssertEqual(compactPreview.visible(showingAll: true).count, 10)
    let earlier = RichChatActivityRows(members: members, selectedItemID: "nested-match", previewLimit: compact)
    XCTAssertTrue(earlier.containsSelection)
    XCTAssertEqual(earlier.visible(showingAll: false).map(\.item.id), ["1", "2", "3", "4"])
    let latest = RichChatActivityRows(members: members, selectedItemID: "10")
    XCTAssertTrue(latest.containsSelection)
    XCTAssertEqual(latest.visible(showingAll: false).count, 8)
  }

  func testOnlyTheTrailingActivityGroupDefaultsToExpandedAndEditsStayCollapsed() throws {
    func node(_ id: String, type: String, text: String = "") -> RichVisibleTimelineNode {
      RichVisibleTimelineNode(item: RichRuntimeItem(id: id, type: type, state: .started, payload: nil,
        streams: type == RichItemType.reasoning ? ["reasoning_text": text] : [:], parentItemID: nil), children: [])
    }
    let command = node("run", type: "command_execution")
    let edit = node("edit", type: "file_change")
    let thought = node("thought", type: RichItemType.reasoning)
    let group = RichTimelineEntry.group(stableID: "tools", members: [command, edit])
    let beforeReply = RichTimelineProjection(rawItems: [], rawRoots: [],
      visibleEntries: [group, .item(thought)], hiddenItemIDs: [])
    XCTAssertEqual(beforeReply.activityTailID, "tools")
    let reply = RichTimelineProjection(rawItems: [], rawRoots: [],
      visibleEntries: [group, .item(node("reply", type: RichItemType.assistantMessage))], hiddenItemIDs: [])
    XCTAssertNil(reply.activityTailID)
    XCTAssertFalse(RichChatActivityGroupSummary(members: [command, edit]).isEditOnly)
    XCTAssertTrue(RichChatActivityGroupSummary(members: [edit, thought]).isEditOnly)
    XCTAssertFalse(RichChatActivityGroupSummary(members: [thought]).isEditOnly)
  }

  func testCompletedVideoToolLeavesTheCollapsedActivityGroup() {
    let first = RichRuntimeItem(id: "first", type: "tool_call", state: .completed,
      payload: .object(["name": .string("inspect"), "status": .string("success")]), streams: [:], parentItemID: nil)
    var video = RichRuntimeItem(id: "video", type: "tool_call", state: .updated,
      payload: .object(["name": .string("record"), "status": .string("success"), "result": .object([
        "content": .array([.object(["type": .string("resource_link"), "uri": .string("/project/demo.mp4"), "mimeType": .string("video/mp4")])]),
      ])]), streams: [:], parentItemID: nil)
    XCTAssertEqual(RichTimeline.project([first, video]).visibleEntries.count, 1)
    video.state = .completed
    let entries = RichTimeline.project([first, video]).visibleEntries
    XCTAssertEqual(entries.count, 2)
    guard case .item(let standalone) = entries.last else { return XCTFail("Video must render directly") }
    XCTAssertEqual(standalone.item.id, "video")
  }

  func testVideoMarkupIncludesImagesAndVisibleHTMLInDocumentOrder() {
    let text = """
      ![First](/project/first.mp4)

      <video title="Second" src="https://example.test/second.mp4?a=1&amp;b=2"></video>

      <template>

      <video src="/project/hidden.mp4"></video>

      </template>

      ```html
      <video src="/project/example.mp4"></video>
      ```

      <video>

      <source src="/project/third" type="video/mp4">

      </video>
      """
    XCTAssertEqual(RichChatVideoPresentation.markdownVideos(text).map(\.target), [
      "/project/first.mp4", "https://example.test/second.mp4?a=1&b=2", "/project/third",
    ])
  }

  func testMediaIndexReusesCompletedItemsDuringUnrelatedStreaming() {
    var parsed: [String] = []
    var index = RichChatMediaIndex { item in
      parsed.append(item.id)
      return RichChatVideoPresentation.videos(for: item)
    }
    let settled = RichRuntimeItem(id: "settled", type: RichItemType.assistantMessage, state: .completed,
      payload: nil, streams: ["assistant_text": "[Watch](/project/demo.mp4)"], parentItemID: nil)
    var active = RichRuntimeItem(id: "active", type: RichItemType.assistantMessage, state: .updated,
      payload: nil, streams: ["assistant_text": "A"], parentItemID: nil)
    XCTAssertEqual(index.media(in: [settled, active]).videos.count, 1)
    active.streams["assistant_text"] = "Another streaming update"
    _ = index.media(in: [settled, active])
    XCTAssertEqual(parsed.filter { $0 == "settled" }.count, 1)
    _ = index.media(in: [])
    _ = index.media(in: [settled])
    XCTAssertEqual(parsed.filter { $0 == "settled" }.count, 2, "Removed history is released")
  }

  func testExtensionlessVideoRetainsItsMIMEInTranscriptSupplements() throws {
    let item = RichRuntimeItem(id: "video", type: RichItemType.assistantMessage, state: .completed,
      payload: .object(["content": .array([.object([
        "kind": .string("file"), "path": .string("/project/recording"), "mimeType": .string("video/mp4"),
      ])])]), streams: [:], parentItemID: nil)
    guard case .video(let video) = try XCTUnwrap(RichChatPresentation.messageSupplements(for: item).first)
    else { return XCTFail("MIME-identified video must remain a playable transcript item") }
    XCTAssertEqual(video.target, "/project/recording")
  }

  func testAssistantFinalDisplayMatchesDesktopWithoutResurrectingSuppressedStreams() {
    var item = RichRuntimeItem(id: "final", type: RichItemType.assistantMessage, state: .updated,
      payload: .object(["displayAuthoritative": .bool(true), "content": .array([
        .object(["kind": .string("text"), "text": .string("Final answer")]),
      ])]), streams: ["assistant_text": "Draft answer"], parentItemID: nil)
    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "Draft answer")
    item.state = .completed
    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "Final answer")
    XCTAssertEqual(RichChatPresentation.text(for: item), "Final answer")
    XCTAssertTrue(RichTimeline.isVisible(item))
    item.payload = .object(["displayAuthoritative": .bool(true), "content": .array([
      .object(["kind": .string("text"), "text": .string("")]),
    ])])
    XCTAssertFalse(RichTimeline.isVisible(item), "Payload-only updates must invalidate visibility")
    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "")
    item.payload = .object(["content": .array([
      .object(["kind": .string("text"), "text": .string("Legacy payload")]),
    ])])
    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "Draft answer", "Pre-flag history remains stream-first")
    XCTAssertTrue(RichTimeline.isVisible(item))
  }

  func testVideoGalleryMatchesTypedFilesAndSuccessfulToolResources() throws {
    let file = RichRuntimeItem(id: "file", type: RichItemType.assistantMessage, state: .completed,
      payload: .object(["content": .array([
        .object(["kind": .string("file"), "path": .string("/project/demo.mp4"), "mimeType": .string("video/mp4")]),
      ])]), streams: [:], parentItemID: nil)
    var tool = RichRuntimeItem(id: "tool", type: "tool_call", state: .completed,
      payload: .object(["name": .string("record"), "status": .string("success"), "result": .object([
        "content": .array([.object(["type": .string("resource_link"), "uri": .string("https://example.test/demo.mov"), "mimeType": .string("video/quicktime")])]),
      ])]), streams: [:], parentItemID: nil)
    XCTAssertTrue(RichTimeline.isVisible(file), "A video-only assistant message is visible on desktop")
    XCTAssertEqual(RichChatVideoPresentation.videos(in: [file, file, tool]).map(\.target), ["https://example.test/demo.mov", "/project/demo.mp4"])
    tool.state = .updated
    XCTAssertTrue(RichChatVideoPresentation.videos(for: tool).isEmpty)
    XCTAssertNil(RichVideoPresentation.resolve("javascript:demo.mp4"))
    XCTAssertNil(RichVideoPresentation.resolve("data:video/mp4;base64,AAAA"))
    XCTAssertNil(RichVideoPresentation.resolve("https://example.test/\nsecret.mp4"))
  }

  func testVideoMarkdownSkipsCodeAndHandlesReferenceLinks() {
    let source = "[Watch](</project/demo clip.mp4>)\n\n`[Fake](/secret/fake.mp4)`\n\n[Recording][clip]\n\n[clip]: https://example.test/recording.mp4"
    XCTAssertEqual(RichChatVideoPresentation.markdownVideos(source).map(\.target), ["/project/demo clip.mp4", "https://example.test/recording.mp4"])
  }

  func testInspectorPreferencesPreserveCollapseAndOrderAcrossLaunches() {
    var preferences = RichChatInspectorPreferences(stored: "")
    XCTAssertTrue(preferences.collapsed.contains(.context))
    preferences.collapsed.insert(.goal)
    preferences.move(.media, to: .goal)
    let restored = RichChatInspectorPreferences(stored: preferences.encoded)
    XCTAssertEqual(restored, preferences)
    XCTAssertEqual(restored.order.first, .media)
    XCTAssertEqual(Set(restored.order), Set(RichChatInspectorSectionID.allCases))
    let older = RichChatInspectorPreferences(stored: #"{"order":["info","info"],"collapsed":["info"]}"#)
    XCTAssertEqual(older.order.first, .info)
    XCTAssertEqual(older.order.count, RichChatInspectorSectionID.allCases.count)
  }

  func testGoalMetadataAndActionsBelongToTheCurrentProviderEra() throws {
    let goal = RichRuntimeItem(id: "goal", type: RichItemType.goal, state: .completed,
      payload: .object(["objective": .string("Ship"), "status": .string("active"),
        "availableActions": .array(["edit", "pause", "clear"].map(RichJSON.string)),
        "tokenBudget": .number(1000), "tokensUsed": .number(250), "iterations": .number(3),
        "lastReason": .string("Still testing")]), streams: [:], parentItemID: nil)
    let value = try XCTUnwrap(RichChatPresentation.latestGoal(in: [goal]))
    XCTAssertEqual(value.availableActions, ["edit", "pause", "clear"])
    XCTAssertEqual(value.tokensUsed, 250)
    XCTAssertEqual(value.tokenBudget, 1000)
    XCTAssertEqual(value.iterations, 3)
    XCTAssertEqual(value.lastReason, "Still testing")
    let handoff = RichRuntimeItem(id: "handoff", type: "provider_handoff", state: .completed, payload: nil, streams: [:], parentItemID: nil)
    XCTAssertNil(RichChatPresentation.latestGoal(in: [goal, handoff]))
  }

  func testMediaIndexKeepsLoadedImagesNewestFirstAndTracksHistoryChanges() {
    func item(_ id: String, _ path: String, parent: String? = nil) -> RichRuntimeItem {
      RichRuntimeItem(
        id: id,
        type: RichItemType.userMessage,
        state: .completed,
        payload: .object([
          "content": .array([.object([
            "kind": .string("file"), "path": .string(path), "mimeType": .string("image/png"),
          ])]),
        ]),
        streams: [:],
        parentItemID: parent
      )
    }

    var index = RichChatMediaIndex()
    let first = item("first", "/project/first.png")
    let second = item("second", "/project/second.png")
    let nested = item("nested", "/project/nested.png", parent: "first")
    XCTAssertEqual(index.images(in: [first, second, nested]), [
      .local(path: "/project/second.png"), .local(path: "/project/first.png"),
    ])
    XCTAssertEqual(index.images(in: [first, item("second", "/project/updated.png")]), [
      .local(path: "/project/updated.png"), .local(path: "/project/first.png"),
    ])
    XCTAssertEqual(index.images(in: [first]), [.local(path: "/project/first.png")])
    XCTAssertTrue(index.images(in: []).isEmpty)
  }

  func testRemoteMediaIDsDistinguishPathsWithTheSameDepth() {
    func image(_ path: [RichImagePathPart]) -> RichImagePresentation {
      .remote(RichRemoteImageReference(
        threadID: "thread", itemID: "item", path: path, mimeType: "image/png",
        bytes: 10, width: nil, height: nil, preview: nil
      ))
    }
    XCTAssertNotEqual(image([.key("first")]).id, image([.key("second")]).id)
    XCTAssertNotEqual(image([.index(0)]).id, image([.index(1)]).id)
  }

  func testGoalElapsedUsesTheReportedTimeAndTimestamp() {
    let now = Date(timeIntervalSince1970: 2_000)
    let active = RichGoalPresentation(
      objective: "Ship", status: "active", availableActions: [],
      timeUsedSeconds: 120, updatedAt: 1_990_000
    )
    // Values below the milliseconds threshold are seconds.
    XCTAssertEqual(active.elapsedSeconds(at: now), 120)
    var seconds = active
    seconds.updatedAt = 1_990
    XCTAssertEqual(seconds.elapsedSeconds(at: now), 130)
    var milliseconds = active
    milliseconds.updatedAt = 1_700_000_000_000
    XCTAssertEqual(milliseconds.elapsedSeconds(at: Date(timeIntervalSince1970: 1_700_000_010)), 130)
    var paused = RichGoalPresentation(
      objective: "Ship", status: "paused", availableActions: [],
      timeUsedSeconds: 120, updatedAt: 1_700_000_000_000
    )
    XCTAssertEqual(paused.elapsedSeconds(at: now), 120)
    paused.timeUsedSeconds = -.infinity
    XCTAssertNil(paused.elapsedSeconds(at: now))
  }

  func testTimelineScrollPolicyReleasesHistoryButFollowsTheUsersOwnSend() {
    XCTAssertTrue(
      RichChatTimelineScrollPolicy.shouldFollowBottom(
        isFollowingBottom: true,
        latestItemType: RichItemType.assistantMessage
      )
    )
    XCTAssertFalse(
      RichChatTimelineScrollPolicy.shouldFollowBottom(
        isFollowingBottom: false,
        latestItemType: RichItemType.assistantMessage
      )
    )
    XCTAssertTrue(
      RichChatTimelineScrollPolicy.shouldFollowBottom(
        isFollowingBottom: false,
        latestItemType: RichItemType.userMessage
      )
    )
  }

  func testCompletedTurnDurationsUseLocalizedSystemUnits() throws {
    XCTAssertNil(RichChatPresentation.completedTurnDuration(999))
    let duration = try XCTUnwrap(RichChatPresentation.completedTurnDuration(125_000))
    XCTAssertFalse(duration.isEmpty)
    XCTAssertFalse(RichChatMessageActionStrings.workedFor(duration).isEmpty)
  }

  func testContextIndicatorOnlyRendersOnAuthoritativeOccupancy() {
    // No usage at all, and no reported window: nothing to show.
    XCTAssertNil(RichChatPresentation.contextUsage(nil))
    XCTAssertNil(RichChatPresentation.contextUsage(RichContextUsage()))
    XCTAssertNil(
      RichChatPresentation.contextUsage(RichContextUsage(usedTokens: 128, maxTokens: nil)))
    // A window with no reported occupancy is never turned into an estimate.
    XCTAssertNil(
      RichChatPresentation.contextUsage(RichContextUsage(usedTokens: nil, maxTokens: 8192)))
    XCTAssertNil(
      RichChatPresentation.contextUsage(
        RichContextUsage(usedTokens: nil, maxTokens: 8192, breakdown: [])))

    let summary = RichChatPresentation.contextUsage(
      RichContextUsage(usedTokens: 128, maxTokens: 8192))
    XCTAssertEqual(summary?.percent, 2)
    XCTAssertEqual(summary?.remainingTokens, 8064)
    XCTAssertEqual(summary?.maxTokens, 8192)

    // Breakdown-only occupancy renders the window without a fabricated percent.
    let breakdownOnly = RichChatPresentation.contextUsage(
      RichContextUsage(
        usedTokens: nil,
        maxTokens: 8192,
        breakdown: [RichContextBreakdownEntry(id: "system", label: "System", tokens: 40)]
      ))
    XCTAssertNotNil(breakdownOnly)
    XCTAssertNil(breakdownOnly?.percent)
    XCTAssertNil(breakdownOnly?.remainingTokens)

    // Overflowing reports clamp instead of exceeding the window.
    let overflow = RichChatPresentation.contextUsage(
      RichContextUsage(usedTokens: 20_000, maxTokens: 8192))
    XCTAssertEqual(overflow?.percent, 100)
    XCTAssertEqual(overflow?.remainingTokens, 0)
  }

  func testContextStringsAreLocalizedWithFullCatalogParity() throws {
    let catalog = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Localizable.xcstrings")
    let root = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: Data(contentsOf: catalog)) as? [String: Any])
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    var allLocales: Set<String> = []
    for entry in strings.values {
      guard let object = entry as? [String: Any],
        let localizations = object["localizations"] as? [String: Any]
      else { continue }
      allLocales.formUnion(localizations.keys)
    }
    XCTAssertEqual(allLocales.count, 13, "en plus the 12 shipped translations")

    let contextKeys = [
      "common.action.retry", "common.error.title", "common.state.loading",
      "home.project.threads.empty.description",
      "rich_chat_context_window", "rich_chat_context_unknown",
      "rich_chat_context_reload_body", "rich_chat_context_reload_stops_subagents",
      "rich_chat_context_percent", "rich_chat_context_tokens",
      "rich_chat_scroll_to_bottom",
      "rich_chat_continue_in_provider", "rich_chat_handoff_fork", "rich_chat_handoff_prompt",
    ]
    for key in contextKeys {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), allLocales, "\(key) locale parity")
      for locale in allLocales {
        let localization = try XCTUnwrap(
          localizations[locale] as? [String: Any], "\(key)/\(locale)")
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], "\(key)/\(locale)")
        let value = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
        let state = try XCTUnwrap(unit["state"] as? String, "\(key)/\(locale)")
        XCTAssertFalse(value.isEmpty, "\(key)/\(locale) must not ship empty")
        XCTAssertEqual(state, "translated", "\(key)/\(locale)")
      }
    }

    XCTAssertFalse(RichChatStrings.contextWindow.isEmpty)
    XCTAssertFalse(RichChatStrings.contextUsageUnknown.isEmpty)
    XCTAssertTrue(RichChatStrings.contextPercent(42).contains("42"))
    let tokens = RichChatStrings.contextTokens(used: 128, maxTokens: 8192)
    XCTAssertFalse(tokens.contains("%"), "format specifiers must be substituted")
    XCTAssertFalse(tokens.isEmpty)
  }

  func testRequestResolutionPreservesWireIDAndMultiSelection() throws {
    let request = RichOpenRequest(
      requestID: .number(1),
      threadID: "thread",
      type: .toolUserInput,
      payload: RichRequestPayload(
        summary: "Choose",
        details: nil,
        options: nil,
        multiSelect: true
      ),
      receivedAtMilliseconds: 0
    )

    let result = try XCTUnwrap(
      RichChatPresentation.requestResolution(request: request, optionIDs: ["a", "b"])
    )

    XCTAssertEqual(result.requestID, .number(1))
    XCTAssertEqual(result.method, "requestPermission")
    XCTAssertEqual(
      result.response,
      .object([
        "optionId": .string("a"),
        "optionIds": .array([.string("a"), .string("b")]),
      ])
    )
  }

  func testComposerDeniesRegularApprovalBeforeSendingButPreservesPlanReview() throws {
    let denial = RichRequestOption(optionID: "reject_once", label: "Reject", description: nil)
    let approval = RichOpenRequest(
      requestID: .text("approval"),
      threadID: "thread",
      type: .commandExecutionApproval,
      payload: RichRequestPayload(
        summary: "Run command?",
        details: nil,
        options: [
          RichRequestOption(optionID: "allow", label: "Allow", description: nil), denial,
        ],
        multiSelect: false
      ),
      receivedAtMilliseconds: 0
    )

    XCTAssertEqual(
      RichChatPresentation.composerDenyResolution(for: approval),
      RichChatRequestResolution(
        requestID: .text("approval"),
        method: "requestPermission",
        response: .object(["optionId": .string("reject_once")])
      )
    )

    let planReview = RichOpenRequest(
      requestID: .text("plan"),
      threadID: "thread",
      type: .toolCallApproval,
      payload: RichRequestPayload(
        summary: "Approve plan?",
        details: .object(["toolName": .string("ExitPlanMode")]),
        options: [denial],
        multiSelect: false
      ),
      receivedAtMilliseconds: 0
    )
    XCTAssertNil(RichChatPresentation.composerDenyResolution(for: planReview))

    let question = RichOpenRequest(
      requestID: .text("question"),
      threadID: "thread",
      type: .toolUserInput,
      payload: RichRequestPayload(
        summary: "Choose",
        details: nil,
        options: [denial],
        multiSelect: false
      ),
      receivedAtMilliseconds: 0
    )
    XCTAssertNil(RichChatPresentation.composerDenyResolution(for: question))
  }

  func testTimelineTextPrefersStreamsAndGoalUsesLatestPayload() {
    let assistant = RichRuntimeItem(
      id: "assistant",
      type: RichItemType.assistantMessage,
      state: .completed,
      payload: .object([
        "content": .array([.object(["kind": .string("text"), "text": .string("old")])])
      ]),
      streams: ["assistant_text": "streamed"],
      parentItemID: nil
    )
    let goal = RichRuntimeItem(
      id: "goal",
      type: RichItemType.goal,
      state: .completed,
      payload: .object([
        "objective": .string("Ship native chat"),
        "status": .string("active"),
        "availableActions": .array([.string("edit"), .string("pause"), .string("unknown")]),
      ]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(RichChatPresentation.text(for: assistant), "streamed")
    XCTAssertEqual(
      RichChatPresentation.latestGoal(in: [assistant, goal]),
      RichGoalPresentation(
        objective: "Ship native chat",
        status: "active",
        availableActions: ["edit", "pause"]
      )
    )
  }

  func testQuestionAnswersProjectIntoTheSameStructuredPromptContentAsThePWA() {
    let item = RichRuntimeItem(
      id: "answer-1",
      type: "question_answer",
      state: .completed,
      payload: .object([
        "questions": .array([
          .object([
            "header": .string("Framework"),
            "question": .string("Which framework?"),
            "selected": .array([
              .object([
                "label": .string("SwiftUI"),
                "description": .string("Native Apple UI"),
              ])
            ]),
            "customAnswer": .string("Use system surfaces"),
          ])
        ])
      ]),
      streams: [:],
      parentItemID: nil
    )

    let entries = RichQuestionAnswerPresentation.entries(for: item)
    XCTAssertEqual(entries.count, 1)
    XCTAssertEqual(entries.first?.header, "Framework")
    XCTAssertEqual(entries.first?.question, "Which framework?")
    XCTAssertEqual(entries.first?.selected.first?.label, "SwiftUI")
    XCTAssertEqual(entries.first?.selected.first?.description, "Native Apple UI")
    XCTAssertEqual(entries.first?.customAnswer, "Use system surfaces")
    XCTAssertEqual(
      RichChatPresentation.text(for: item),
      "Framework\nWhich framework?\nSwiftUI\nUse system surfaces"
    )
    XCTAssertTrue(RichTimeline.isVisible(item))
  }

  func testPlanAndRecentErrorDocksUseAuthoritativeRuntimeItems() throws {
    let plan = RichRuntimeItem(
      id: "plan",
      type: RichItemType.plan,
      state: .updated,
      payload: .object([
        "steps": .array([
          .object(["step": .string("Inspect"), "status": .string("completed")]),
          .object(["step": .string("Implement"), "status": .string("in_progress")]),
          .object(["step": .string("Verify"), "status": .string("pending")]),
        ])
      ]),
      streams: [:],
      parentItemID: nil
    )
    let error = RichRuntimeItem(
      id: "error",
      type: RichItemType.error,
      state: .completed,
      payload: .object(["message": .string("Provider failed")]),
      streams: [:],
      parentItemID: nil
    )
    let abort = RichRuntimeItem(
      id: "abort",
      type: RichItemType.error,
      state: .completed,
      payload: .object(["message": .string("AbortError: Aborted.")]),
      streams: [:],
      parentItemID: nil
    )

    let presentation = try XCTUnwrap(RichChatPresentation.latestActivePlan(in: [plan]))
    XCTAssertEqual(presentation.completedCount, 1)
    XCTAssertTrue(presentation.isActive)
    XCTAssertEqual(presentation.steps.map(\.text), ["Inspect", "Implement", "Verify"])
    XCTAssertEqual(
      RichChatPresentation.recentErrors(in: [error, abort]).map(\.message),
      ["Provider failed"]
    )

    let nextUser = RichRuntimeItem(
      id: "next-user",
      type: RichItemType.userMessage,
      state: .completed,
      payload: nil,
      streams: [:],
      parentItemID: nil
    )
    XCTAssertTrue(RichChatPresentation.recentErrors(in: [error, nextUser]).isEmpty)
  }

  func testPlanTextFallbackAcceptsStandaloneCheckboxes() throws {
    let plan = RichRuntimeItem(
      id: "plan-text",
      type: RichItemType.plan,
      state: .updated,
      payload: nil,
      streams: ["plan_text": "[x] Inspect\n[>] Implement\n[ ] Verify"],
      parentItemID: nil
    )

    let presentation = try XCTUnwrap(RichChatPresentation.latestActivePlan(in: [plan]))
    XCTAssertEqual(presentation.steps.map(\.text), ["Inspect", "Implement", "Verify"])
    XCTAssertEqual(presentation.steps.map(\.status), [.completed, .inProgress, .pending])
  }

  func testAuthenticationDockUsesGuiAuthAndConsumesAuthenticationErrors() throws {
    let agent = try AgentStatusRecord(
      wire: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "presentationAuthStates": .object(["gui": .string("missing")]),
        "capabilities": .object([:]),
      ])
    )
    let errors = [
      RichRuntimeErrorPresentation(id: "auth", message: "API Error: 401 unauthorized"),
      RichRuntimeErrorPresentation(id: "tool", message: "Tool failed"),
    ]

    XCTAssertTrue(
      RichChatPresentation.authenticationRequired(agentStatus: agent, recentErrors: errors)
    )
    XCTAssertEqual(
      RichChatPresentation.visibleRecentErrors(errors, agentStatus: agent).map(\.message),
      ["Tool failed"]
    )
  }

  func testActiveDelegatedAgentsOnlyPinsRunningRootItems() {
    let running = RichRuntimeItem(
      id: "agent",
      type: "tool_call",
      state: .updated,
      payload: .object([
        "name": .string("Agent"),
        "isSubAgent": .bool(true),
        "args": .object(["description": .string("Inspect mobile parity")]),
      ]),
      streams: [:],
      parentItemID: nil
    )
    let child = RichRuntimeItem(
      id: "child",
      type: "tool_call",
      state: .updated,
      payload: .object(["name": .string("Read")]),
      streams: [:],
      parentItemID: "agent"
    )
    let roleCrossagent = RichRuntimeItem(
      id: "crossagent",
      type: "tool_call",
      state: .updated,
      payload: .object([
        "name": .string("Crossagent"),
        "isCrossagent": .bool(true),
        "subAgentType": .string("Builder"),
        "args": .object(["description": .string("Inspect the patch")]),
      ]),
      streams: [:],
      parentItemID: nil
    )
    let completed = RichRuntimeItem(
      id: "completed",
      type: "tool_call",
      state: .completed,
      payload: .object(["name": .string("Workflow")]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(
      RichChatPresentation.activeDelegatedAgents(in: [running, child, completed, roleCrossagent]),
      [
        RichDelegatedAgentPresentation(
          id: "agent",
          kind: .subagent,
          title: "Inspect mobile parity",
          stepCount: 1
        ),
        RichDelegatedAgentPresentation(
          id: "crossagent",
          kind: .crossagent,
          title: "Builder: Inspect the patch",
          stepCount: 0
        )
      ]
    )
  }

  func testStructuredMessagePresentationSeparatesProseFromNativeContextCards() {
    let item = RichRuntimeItem(
      id: "user",
      type: RichItemType.userMessage,
      state: .completed,
      payload: .object([
        "content": .array([
          .object(["kind": .string("text"), "text": .string("Review ")]),
          .object([
            "kind": .string("skill"),
            "name": .string("review"),
            "invocation": .string("/review"),
            "pluginId": .string("plugin"),
            "pluginName": .string("Reviewer"),
          ]),
          .object(["kind": .string("text"), "text": .string(" this file")]),
          .object([
            "kind": .string("file"),
            "path": .string("Sources/App.swift"),
            "source": .string("mention"),
          ]),
          .object([
            "kind": .string("diff_comment"),
            "path": .string("Sources/App.swift"),
            "lineNumber": .number(42),
            "side": .string("new"),
            "staged": .bool(false),
            "body": .string("Keep this native."),
          ]),
          .object(["kind": .string("mcp"), "name": .string("github")]),
        ])
      ]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "Review this file")
    XCTAssertEqual(
      RichChatPresentation.messageSupplements(for: item),
      [
        .skill(name: "review", pluginName: "Reviewer"),
        .file(path: "Sources/App.swift", name: nil, isAttachment: false),
        .diffComment(target: "Sources/App.swift:42", body: "Keep this native."),
        .mcp(name: "github"),
      ]
    )
    XCTAssertTrue(RichChatPresentation.text(for: item).contains("/review"))
    XCTAssertTrue(RichChatPresentation.text(for: item).contains("Sources/App.swift"))
  }

  func testInlineDataImageDecodesButUnsupportedRawSVGSkipsBitmapDecode() throws {
    let dataURL = "data:image/png;base64,aGVsbG8="
    let dataClassification = try XCTUnwrap(RichImagePolicy.classify(dataURL))
    XCTAssertEqual(
      RichChatPresentation.inlineImageData(
        source: dataURL,
        classification: dataClassification
      ),
      Data("hello".utf8)
    )

    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
    let svgClassification = try XCTUnwrap(RichImagePolicy.classify(svg))
    XCTAssertNil(
      RichChatPresentation.inlineImageData(source: svg, classification: svgClassification),
    )
  }

  func testProviderHandoffBuildsTranscriptContextAndFallsBackToTerminalScrollback() {
    let user = RichRuntimeItem(
      id: "user",
      type: RichItemType.userMessage,
      state: .completed,
      payload: .object([
        "content": .array([
          .object(["kind": .string("text"), "text": .string("Fix the tests")]),
          .object(["kind": .string("file"), "path": .string("src/app.ts")]),
        ])
      ]),
      streams: [:],
      parentItemID: nil
    )
    let assistant = RichRuntimeItem(
      id: "assistant",
      type: RichItemType.assistantMessage,
      state: .completed,
      payload: nil,
      streams: ["assistant_text": "The tests are green."],
      parentItemID: nil
    )
    let child = RichRuntimeItem(
      id: "child",
      type: RichItemType.assistantMessage,
      state: .completed,
      payload: nil,
      streams: ["assistant_text": "Do not duplicate nested output."],
      parentItemID: "assistant"
    )

    let summary = ThreadProviderHandoffPresentation.transcriptSummary(
      items: [user, assistant, child],
      terminalScrollback: "ignored terminal text",
      sourceLabel: "Codex"
    )
    XCTAssertTrue(summary?.contains("User:\nFix the tests\n@src/app.ts") == true)
    XCTAssertTrue(summary?.contains("Assistant:\nThe tests are green.") == true)
    XCTAssertFalse(summary?.contains("Do not duplicate") == true)

    let terminal = ThreadProviderHandoffPresentation.transcriptSummary(
      items: [],
      terminalScrollback: "shell output",
      sourceLabel: "Claude"
    )
    XCTAssertTrue(terminal?.contains("shell output") == true)
    XCTAssertNil(
      ThreadProviderHandoffPresentation.transcriptSummary(
        items: [], terminalScrollback: "  ", sourceLabel: "Claude")
    )
  }

  func testProviderHandoffTruncatesContextAndSelectsDifferentInstalledAgent() throws {
    let longText = String(repeating: "x", count: 50_100)
    let summary = try XCTUnwrap(
      ThreadProviderHandoffPresentation.transcriptSummary(
        items: [], terminalScrollback: longText, sourceLabel: "Codex")
    )
    XCTAssertTrue(summary.contains("[earlier transcript truncated]"))
    XCTAssertFalse(summary.contains(String(repeating: "x", count: 50_001)))

    let source = try handoffAgent(kind: "codex", installed: true, model: "gpt-5")
    let unavailable = try handoffAgent(kind: "claude", installed: false, model: "sonnet")
    let target = try handoffAgent(kind: "gemini", installed: true, model: "gemini-pro")
    XCTAssertEqual(
      ThreadProviderHandoffPresentation.initialTarget(
        agents: [source, unavailable, target],
        sourceAgentKind: "codex",
        sourceMode: .gui
      ),
      ThreadProviderHandoffTarget(
        agentKind: "gemini", modelID: "gemini-pro", presentationMode: .gui)
    )
    XCTAssertNil(
      ThreadProviderHandoffPresentation.initialTarget(
        agents: [source, unavailable],
        sourceAgentKind: "codex",
        sourceMode: .gui
      )
    )

    let terminalOnly = try handoffAgent(
      kind: "qwen", installed: true, model: "qwen-code", modes: ["terminal"])
    XCTAssertEqual(
      ThreadProviderHandoffPresentation.initialTarget(
        agents: [source, terminalOnly],
        sourceAgentKind: "codex",
        sourceMode: .gui
      )?.presentationMode,
      .terminal
    )
  }

  func testThreadProviderUsagePreservesExactProfileOwnership() {
    let base = providerUsageSnapshot("codex", percent: 20)
    let work = providerUsageSnapshot("codex:work", percent: 80)
    let usage = SettingsProviderUsage(snapshots: [base, work], fromCache: false)

    let exact = RichChatProviderUsagePresentation.resolve(
      agentKind: "codex",
      agentInstanceID: "work",
      label: "Codex Work",
      usage: usage
    )
    XCTAssertEqual(exact.providerID, "codex:work")
    XCTAssertEqual(exact.snapshot?.windows.first?.usedPercent, 80)

    let scoped = RichChatProviderUsagePresentation.resolve(
      agentKind: "codex:work",
      agentInstanceID: "work",
      label: nil,
      usage: usage
    )
    XCTAssertEqual(scoped.providerID, "codex:work")
    XCTAssertEqual(scoped.snapshot?.windows.first?.usedPercent, 80)

    let fallback = RichChatProviderUsagePresentation.resolve(
      agentKind: "codex:missing",
      agentInstanceID: nil,
      label: nil,
      usage: SettingsProviderUsage(snapshots: [base], fromCache: false)
    )
    XCTAssertEqual(fallback.providerID, "codex:missing")
    XCTAssertNil(fallback.snapshot)
  }

  func testPreviousProviderUsageResponseKeepsUnknownRingsAndDetailedWindows() throws {
    let value = try JSONDecoder().decode(SettingsProviderUsage.self, from: Data("{\"snapshots\":[],\"fromCache\":true}".utf8))
    XCTAssertNil(value.ringLayouts)
    let presentation = RichChatProviderUsagePresentation(providerID: "agent", label: "Agent", snapshot: providerUsageSnapshot("agent", percent: 75))
    XCTAssertEqual(presentation.rings, RichChatUsageRings(outerPercent: nil, innerPercent: nil))
    XCTAssertEqual(presentation.snapshot?.windows.first?.usedPercent, 75)
  }

  func testUsageStalenessPreservesQuotaDataAndUsesTheDesktopThreshold() {
    let presentation = RichChatProviderUsagePresentation(
      providerID: "agent", label: "Agent",
      snapshot: providerUsageSnapshot("agent", percent: 12, fetchedAt: 1_000_000)
    )
    XCTAssertFalse(presentation.isStale(at: Date(timeIntervalSince1970: 1_119.999)))
    XCTAssertTrue(presentation.isStale(at: Date(timeIntervalSince1970: 1_120)))
    XCTAssertEqual(presentation.snapshot?.windows.first?.usedPercent, 12)
    XCTAssertFalse(RichChatProviderUsagePresentation(providerID: "missing", label: "Missing", snapshot: nil).isStale())
  }

  func testCanonicalActivityCategoriesMatchTheSharedPwaFixture() throws {
    let fixture = try loadRichChatFixture("rich-activity-categories.json")
    XCTAssertEqual(fixture["version"]?.exactInt64Value, 1)
    for value in try richFixtureArray(XCTUnwrap(fixture["cases"])) {
      let row = try richFixtureObject(value)
      let rawItem = try XCTUnwrap(row["item"])
      let item = try XCTUnwrap(RichContentDecoder.decodeRuntimeItems(.array([rawItem])).first)
      XCTAssertEqual(
        RichChatActivityGroupSummary.category(for: item).rawValue,
        row["category"]?.stringValue,
        row["name"]?.stringValue ?? "activity category"
      )
    }
  }

  func testCursorUsageRingsShowTheSharedWeeklyPool() {
    for providerID in ["cursor", "cursor:work"] {
      let presentation = RichChatProviderUsagePresentation(
        providerID: providerID,
        label: "Cursor",
        snapshot: providerUsageSnapshot(providerID, percent: 9),
        ringLayout: SettingsUsageRingLayout(outerWindowId: "weekly")
      )
      XCTAssertEqual(presentation.rings, RichChatUsageRings(outerPercent: 9, innerPercent: nil))
    }
  }

  func testBackgroundTaskPresentationDeduplicatesPurposeProgressAndCommand() {
    let task = RemoteBackgroundTaskIdentity(
      taskId: "task-1",
      kind: "command",
      description: "Run tests",
      startedAt: 1_700_000_000_000,
      lastProgressAt: 1_700_000_010_000,
      progress: "Run tests",
      category: "command",
      command: "pnpm test"
    )
    let presentation = RichBackgroundTaskPresentation(task: task)
    XCTAssertEqual(presentation.label, "Run tests")
    XCTAssertNil(presentation.progress, "progress equal to the purpose must not repeat")
    XCTAssertEqual(presentation.command, "pnpm test")
    XCTAssertTrue(presentation.showsCommandSection)
    XCTAssertFalse(presentation.commandIsLabel)
    XCTAssertEqual(presentation.category, .command)
    XCTAssertEqual(presentation.category.label, RichChatStrings.command)
    XCTAssertEqual(presentation.startedAtMilliseconds, 1_700_000_000_000)

    // Progress equal to the command is not genuine either; a distinct report
    // is kept exactly once.
    var duplicate = task
    duplicate.progress = "pnpm test"
    XCTAssertNil(RichBackgroundTaskPresentation(task: duplicate).progress)
    duplicate.progress = "Server ready"
    XCTAssertEqual(RichBackgroundTaskPresentation(task: duplicate).progress, "Server ready")

    // The command becomes the single label when no purpose was reported.
    let legacy = RemoteBackgroundTaskIdentity(
      taskId: "legacy",
      kind: "other",
      description: "",
      command: "tail -f log"
    )
    let legacyPresentation = RichBackgroundTaskPresentation(task: legacy)
    XCTAssertEqual(legacyPresentation.category, .other)
    XCTAssertEqual(legacyPresentation.label, "tail -f log")
    XCTAssertFalse(legacyPresentation.showsCommandSection)
    XCTAssertTrue(legacyPresentation.commandIsLabel)
    XCTAssertNil(legacyPresentation.progress)
    XCTAssertNil(legacyPresentation.startedAtMilliseconds)

    // An unknown/absent category falls back to the legacy kind, never a guess.
    let unknown = RemoteBackgroundTaskIdentity(
      taskId: "u",
      kind: "command",
      description: "d",
      category: "watched"
    )
    XCTAssertEqual(RichBackgroundTaskPresentation(task: unknown).category, .command)

    let elapsed = RichBackgroundTaskElapsed.text(
      startedAtMilliseconds: 1_000,
      now: Date(timeIntervalSince1970: 66)
    )
    XCTAssertFalse(elapsed.isEmpty)
  }

  func testBackgroundTaskMissingReportProvisionalErrorShowsLocalizedString() {
    let item = RichRuntimeItem(
      id: "task-row",
      type: "tool_call",
      state: .completed,
      payload: .object([
        "name": .string("Task"),
        "title": .string("Review the fixture"),
        "status": .string("error"),
        "result": .object([
          "error": .string("The task ended without a completion report.")
        ]),
      ]),
      streams: ["command_output": "launching task"],
      parentItemID: nil
    )

    // The check precedes streams and title so the provisional outcome is
    // actually visible rather than hidden by the launch text.
    XCTAssertEqual(
      RichChatPresentation.text(for: item),
      RichChatStrings.backgroundTaskReportMissing
    )
    XCTAssertEqual(
      RichChatPresentation.text(for: item),
      NSLocalizedString(
        "rich_chat_background_task_report_missing",
        tableName: nil,
        bundle: .main,
        value: "missing catalog key",
        comment: ""
      )
    )
    XCTAssertNotEqual(RichChatPresentation.text(for: item), "launching task")
    XCTAssertNotEqual(RichChatPresentation.text(for: item), "Review the fixture")
    XCTAssertEqual(
      RichChatPresentation.messageBody(for: item),
      RichChatStrings.backgroundTaskReportMissing
    )
  }

  func testBackgroundTaskUnrelatedToolErrorKeepsNormalPresentation() {
    let item = RichRuntimeItem(
      id: "task-row",
      type: "tool_call",
      state: .completed,
      payload: .object([
        "name": .string("Task"),
        "title": .string("Deploy"),
        "status": .string("error"),
        "result": .object(["error": .string("Task crashed: disk full")]),
      ]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(RichChatPresentation.text(for: item), "Deploy")
    XCTAssertNotEqual(
      RichChatPresentation.text(for: item),
      RichChatStrings.backgroundTaskReportMissing
    )
  }

  func testBackgroundTaskLateCompletionWithNullResultClearsProvisionalReport() {
    var item = RichRuntimeItem(
      id: "task-row",
      type: "tool_call",
      state: .completed,
      payload: .object([
        "name": .string("Task"),
        "title": .string("Review the fixture"),
        "status": .string("error"),
        "result": .object([
          "error": .string("The task ended without a completion report.")
        ]),
      ]),
      streams: ["command_output": "launching task"],
      parentItemID: nil
    )
    XCTAssertEqual(
      RichChatPresentation.text(for: item),
      RichChatStrings.backgroundTaskReportMissing
    )

    // A late terminal notification rewrites the same row with no provisional
    // result; the normal stream/title projection must return.
    item.payload = .object([
      "name": .string("Task"),
      "title": .string("Review the fixture"),
      "status": .string("success"),
      "result": .null,
    ])
    XCTAssertEqual(RichChatPresentation.text(for: item), "launching task")
    XCTAssertEqual(RichChatPresentation.messageBody(for: item), "launching task")
    XCTAssertNotEqual(
      RichChatPresentation.text(for: item),
      RichChatStrings.backgroundTaskReportMissing
    )
  }

  func testBackgroundTaskElapsedClampsAdversarialTimestamps() {
    let now = Date(timeIntervalSince1970: 1_000)
    let zero = RichBackgroundTaskElapsed.text(startedAtMilliseconds: 1_000_000, now: now)
    let future = RichBackgroundTaskElapsed.text(startedAtMilliseconds: 1e300, now: now)
    XCTAssertEqual(future, zero, "A huge future timestamp must display as zero age")
    XCTAssertFalse(future.isEmpty)
    // A huge past timestamp must not trap in the Double-to-Int conversion.
    XCTAssertFalse(
      RichBackgroundTaskElapsed.text(startedAtMilliseconds: -1e300, now: now).isEmpty
    )
  }

  func testCompactElapsedUsesLocalizedNarrowUnitsAndSafeTimestampClamping() {
    let now = Date(timeIntervalSince1970: 1_000)
    let locale = Locale(identifier: "en_US")
    XCTAssertEqual(RichBackgroundTaskElapsed.compactText(startedAtMilliseconds: 710_000, now: now, locale: locale), "4m 50s")
    XCTAssertEqual(RichBackgroundTaskElapsed.compactText(startedAtMilliseconds: 1e300, now: now, locale: locale), "0s")
    XCTAssertFalse(RichBackgroundTaskElapsed.compactText(startedAtMilliseconds: -1e300, now: now, locale: locale).isEmpty)
  }

  private func providerUsageSnapshot(
    _ providerID: String,
    percent: Double,
    fetchedAt: Int64 = 0
  ) -> SettingsUsageSnapshot {
    SettingsUsageSnapshot(
      providerId: providerID,
      status: .ok,
      windows: [
        SettingsUsageWindow(
          id: "weekly",
          label: "Weekly",
          usedPercent: percent,
          used: nil,
          limit: nil,
          unit: nil,
          currency: nil,
          resetsAt: nil
        )
      ],
      fetchedAt: fetchedAt,
      authenticatedAs: nil,
      plan: nil,
      error: nil,
      rateLimitedUntil: nil,
      cost: nil,
      credits: nil,
      tokens: nil
    )
  }

  private func handoffAgent(
    kind: String,
    installed: Bool,
    model: String,
    modes: [String]? = nil
  ) throws -> AgentStatusRecord {
    var capabilities: [String: JSONValue] = [
      "models": .array([
        .object(["id": .string(model), "label": .string(model)])
      ])
    ]
    if let modes { capabilities["presentationModes"] = .array(modes.map(JSONValue.string)) }
    return try AgentStatusRecord(
      wire: .object([
        "kind": .string(kind),
        "label": .string(kind.capitalized),
        "installed": .bool(installed),
        "authState": .string("authenticated"),
        "capabilities": .object(capabilities),
      ]))
  }
}

@MainActor
final class RichChatRequestFormTests: XCTestCase {
  func testAgentQuestionRequiresEveryAnswerAndKeepsChoiceIdentifiers() throws {
    let request = try question("""
      {"userInputForm":{"questions":[
        {"id":"color","question":"Choose a color","options":[{"optionId":"green","label":"Green"}]},
        {"id":"caption","question":"Caption"}
      ]}}
      """)
    let form = try XCTUnwrap(RichChatRequestForm(request: request))
    XCTAssertEqual(form.fields.map(\.id), ["color", "caption"])
    XCTAssertNil(form.submit(["color": .string("green"), "caption": .string("   ")]))
    XCTAssertEqual(form.submit(["color": .string("green"), "caption": .string("Gallery draft")]),
      .object(["answers": .object(["color": .string("green"), "caption": .string("Gallery draft")])]))
    XCTAssertEqual(form.cancelResponse, .object(["action": .string("cancel")]))
  }

  func testLegacyPendingQuestionKeepsArrayEnvelopeAndSecureInput() throws {
    let formRequest = try question("""
      {"codexUserInput":{"questions":[{"id":"secret","question":"Code","isSecret":true}]}}
      """)
    let form = try XCTUnwrap(RichChatRequestForm(request: formRequest))
    XCTAssertTrue(form.fields[0].secret)
    XCTAssertEqual(form.submit(["secret": .string("test-only")]),
      .object(["answers": .object(["secret": .object(["answers": .array([.string("test-only")])])])]))
  }

  func testCustomMultiAnswerUsesTheCanonicalScalarShape() throws {
    let formRequest = try question("""
      {"userInputForm":{"questions":[
        {"id":"kit","question":"Choose components","multiSelect":true,"options":[{"label":"Motor"}]}
      ]}}
      """)
    let form = try XCTUnwrap(RichChatRequestForm(request: formRequest))
    let draft = RichChatRequestFormDraft(request: formRequest, form: form)
    let field = try XCTUnwrap(form.fields.first)
    draft.choose("Motor", in: field)
    XCTAssertEqual(draft.response, .object(["answers": .object(["kit": .array([.string("Motor")])])]))
    draft.editCustom("  My kit  ", in: field)
    XCTAssertEqual(draft.response, .object(["answers": .object(["kit": .string("My kit")])]))
  }

  func testElicitationValidatesOnlyVisibleFieldsAndPreservesMetadata() throws {
    let formRequest = try question("""
      {"structuredElicitation":{
        "mode":"form","sourceText":"Fixture MCP","message":"Preferences","_meta":null,
        "requestedSchema":{"type":"object","required":["mode","limit","accepted"],"properties":{
          "mode":{"type":"string","enum":["brief","detailed"]},
          "limit":{"type":"integer","minimum":1,"maximum":3,"visibleWhen":[{"field":"mode","equals":"detailed"}]},
          "accepted":{"type":"boolean","default":false},
          "items":{"type":"array","items":{"oneOf":[{"const":"a","title":"Option A"}]},"minItems":1}
        }}
      }}
      """)
    let form = try XCTUnwrap(RichChatRequestForm(request: formRequest))
    let draft = RichChatRequestFormDraft(request: formRequest, form: form)
    let limit = try XCTUnwrap(form.fields.first { $0.id == "limit" })
    draft.values["mode"] = .string("detailed")
    XCTAssertNil(draft.response)
    draft.editNumber("2x", in: limit)
    XCTAssertNil(draft.response)
    draft.values["limit"] = .number(4)
    XCTAssertNil(draft.response)
    draft.values["limit"] = .number(2)
    draft.values["items"] = .array([.string("a")])
    XCTAssertEqual(draft.response, .object([
      "action": .string("accept"),
      "content": .object(["mode": .string("detailed"), "limit": .number(2),
        "accepted": .bool(false), "items": .array([.string("a")])]),
      "_meta": .null,
    ]))
    draft.values["mode"] = .string("brief")
    XCTAssertNil(draft.response?.objectValue?["content"]?.objectValue?["limit"])
    XCTAssertEqual(form.cancelResponse, .object(["action": .string("decline")]))
  }

  func testURLRequestRequiresAWebLinkAndOffersExplicitDecline() throws {
    let allowed = try question("""
      {"mcpElicitation":{"mode":"url","message":"Open the connector","serverName":"Fixture",
        "url":"https://example.com/authorize","elicitationId":"one"}}
      """)
    let form = try XCTUnwrap(RichChatRequestForm(request: allowed))
    XCTAssertEqual(form.links.first?.url.host, "example.com")
    XCTAssertEqual(form.links.first?.description, "example.com")
    XCTAssertEqual(form.links.first?.title, RichChatStrings.openRequiredURL)
    XCTAssertNil(form.submit([:]))
    XCTAssertEqual(form.cancelResponse, .object(["action": .string("decline")]))
    let malformed = try question("""
      {"mcpElicitation":{"mode":"url","message":"Open","serverName":"Fixture","url":"file:///tmp/path"}}
      """)
    XCTAssertTrue(RichChatRequestForm.recognizesPayload(malformed))
    XCTAssertNil(RichChatRequestForm(request: malformed))
    let missingID = try question("""
      {"mcpElicitation":{"mode":"url","message":"Open","serverName":"Fixture","url":"https://example.com/authorize"}}
      """)
    XCTAssertNil(RichChatRequestForm(request: missingID))
  }

  private func question(_ json: String) throws -> RichOpenRequest {
    RichOpenRequest(
      requestID: .text("form"), threadID: "thread", type: .toolUserInput,
      payload: .init(summary: "Input requested", details: try RichJSON.decode(Data(json.utf8)),
        options: nil, multiSelect: nil),
      receivedAtMilliseconds: 0
    )
  }
}
