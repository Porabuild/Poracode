import XCTest

@testable import App

final class RichChatPresentationTests: XCTestCase {
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
    let completed = RichRuntimeItem(
      id: "completed",
      type: "tool_call",
      state: .completed,
      payload: .object(["name": .string("Workflow")]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(
      RichChatPresentation.activeDelegatedAgents(in: [running, child, completed]),
      [
        RichDelegatedAgentPresentation(
          id: "agent",
          kind: .subagent,
          title: "Inspect mobile parity",
          stepCount: 1
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

  func testThreadProviderUsagePrefersExactInstanceThenFallsBackToBaseProvider() {
    let base = providerUsageSnapshot("codex", percent: 20)
    let work = providerUsageSnapshot("codex:work", percent: 80)
    let usage = SettingsProviderUsage(snapshots: [base, work], fromCache: false)

    let exact = RichChatProviderUsagePresentation.resolve(
      agentKind: "codex",
      agentInstanceID: "work",
      label: "Codex Work",
      usage: usage
    )
    XCTAssertEqual(exact.providerID, "codex")

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
    XCTAssertEqual(fallback.providerID, "codex")
  }

  private func providerUsageSnapshot(
    _ providerID: String,
    percent: Double
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
      fetchedAt: 0,
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
