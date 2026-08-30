import Foundation
import XCTest

@testable import App

final class RichChatComposerParityTests: XCTestCase {
  func testCapabilityCatalogScopesOptionsToTheSelectedModel() throws {
    let agent = try agentStatus()
    let configuration = ThreadConfig(
      model: "model-a",
      effort: "high",
      contextSize: "128k",
      fast: true,
      thinking: true,
      mode: "agent",
      approvalPolicy: "default"
    )
    let catalog = RichChatComposerControlCatalog(
      agentStatus: agent,
      presentationMode: .gui,
      configuration: configuration
    )

    XCTAssertEqual(catalog.models.map(\.id), ["model-a", "model-b"])
    XCTAssertEqual(catalog.effortOptions(for: "model-a").map(\.id), ["low", "high"])
    XCTAssertEqual(catalog.contextOptions(for: "model-a").map(\.id), ["64k", "128k"])
    XCTAssertTrue(catalog.supportsFast("model-a"))
    XCTAssertTrue(catalog.supportsThinking("model-a"))
    XCTAssertEqual(catalog.modeOptions.map(\.id), ["agent", "plan"])
    XCTAssertEqual(catalog.permissionOptions.map(\.id), ["default", "never"])
  }

  func testSlashCommandSuggestionsUseAdvertisedGUICommandsAndSkillDisplayNames() throws {
    let catalog = RichChatComposerControlCatalog(
      agentStatus: try agentStatus(),
      presentationMode: .gui,
      configuration: ThreadConfig(model: "model-a")
    )

    XCTAssertEqual(catalog.slashSuggestions(for: "/").map(\.displayID), ["review", "audit"])
    XCTAssertEqual(catalog.slashSuggestions(for: "/re").map(\.displayID), ["review"])
    XCTAssertTrue(catalog.slashSuggestions(for: "/review later").isEmpty)
    XCTAssertEqual(catalog.slashSuggestions(for: "/audit").first?.skill?.name, "audit")

    let liveCatalog = RichChatComposerControlCatalog(
      agentStatus: try agentStatus(),
      presentationMode: .gui,
      configuration: ThreadConfig(model: "model-a"),
      threadSlashCommands: [RemoteSlashCommand(id: "live", label: "Live command")]
    )
    XCTAssertEqual(liveCatalog.slashSuggestions(for: "/").map(\.displayID), ["live"])
  }

  func testRemoteThreadRetainsOptionalSessionScopedSlashCommands() throws {
    let data = try JSONSerialization.data(withJSONObject: [
      "id": "thread-1",
      "projectId": "project-1",
      "title": "Thread",
      "agentKind": "provider",
      "config": ["model": "model-a"],
      "status": "idle",
      "attention": "none",
      "createdAt": "2026-08-22T00:00:00Z",
      "updatedAt": "2026-08-22T00:00:00Z",
      "slashCommands": [["id": "live", "label": "Live command"]],
    ])

    let thread = try JSONDecoder().decode(RemoteThread.self, from: data)
    XCTAssertEqual(thread.slashCommands, [RemoteSlashCommand(id: "live", label: "Live command")])
  }

  func testMCPMentionsEnableTheMatchingConfigAndCreateStructuredSegments() throws {
    let browser = try XCTUnwrap(
      RichChatMCPMentionCatalog.suggestions(for: "@bro").first
    )
    var configuration = ThreadConfig(model: "model-a")

    RichChatMCPMentionCatalog.enable(browser.configKey, in: &configuration)
    XCTAssertEqual(configuration.browserMcp, true)
    XCTAssertEqual(browser.selection.segment, .mcp(id: "browser", name: HomeStrings.browser))
    XCTAssertEqual(
      RichChatMCPMentionCatalog.suggestions(for: "Please inspect @bro").first?.id,
      "browser"
    )
    XCTAssertTrue(RichChatMCPMentionCatalog.suggestions(for: "@browser later").isEmpty)

    RichChatMCPMentionCatalog.disable(browser.id, in: &configuration)
    XCTAssertEqual(configuration.browserMcp, false)
  }

  func testTrailingMentionTriggerMatchesCompactComposerBoundaries() throws {
    let root = try XCTUnwrap(RichChatMentionTrigger.trailing(in: "@"))
    XCTAssertEqual(root.query, "")
    XCTAssertEqual(root.removingToken(from: "@"), "")

    let inline = try XCTUnwrap(RichChatMentionTrigger.trailing(in: "Inspect @src/main"))
    XCTAssertEqual(inline.query, "src/main")
    XCTAssertEqual(inline.removingToken(from: "Inspect @src/main"), "Inspect ")

    XCTAssertNil(RichChatMentionTrigger.trailing(in: "me@example.com"))
    XCTAssertNil(RichChatMentionTrigger.trailing(in: "Inspect @src/main now"))
    XCTAssertNil(RichChatMentionTrigger.trailing(in: "Inspect @src@main"))
  }

  func testModelChangeResetsOnlyCapabilitiesTheNextModelCannotUse() throws {
    let agent = try agentStatus()
    var configuration = ThreadConfig(
      model: "model-a",
      effort: "high",
      contextSize: "128k",
      fast: true,
      thinking: true
    )
    let catalog = RichChatComposerControlCatalog(
      agentStatus: agent,
      presentationMode: .gui,
      configuration: configuration
    )

    catalog.applyModel("model-b", to: &configuration)

    XCTAssertEqual(configuration.model, "model-b")
    XCTAssertEqual(configuration.effort, "low")
    XCTAssertEqual(configuration.contextSize, "64k")
    XCTAssertEqual(configuration.fast, false)
    XCTAssertEqual(configuration.thinking, false)
  }

  func testThreadConfigProjectsLosslesslyIntoTheNextSend() {
    let configuration = ThreadConfig(
      model: "model-a",
      effort: "high",
      contextSize: "128k",
      fast: true,
      thinking: true,
      mode: "plan",
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandboxMode: "workspace-write",
      browserMcp: true,
      crossagentMcp: false,
      computerUse: true,
      chromeMcp: false
    )

    XCTAssertEqual(configuration.richChatObject["model"], .string("model-a"))
    XCTAssertEqual(configuration.richChatObject["effort"], .string("high"))
    XCTAssertEqual(configuration.richChatObject["contextSize"], .string("128k"))
    XCTAssertEqual(configuration.richChatObject["fast"], .bool(true))
    XCTAssertEqual(configuration.richChatObject["thinking"], .bool(true))
    XCTAssertEqual(configuration.richChatObject["mode"], .string("plan"))
    XCTAssertEqual(configuration.richChatObject["approvalPolicy"], .string("never"))
    XCTAssertEqual(configuration.richChatObject["sandboxMode"], .string("workspace-write"))
    XCTAssertEqual(configuration.richChatObject["browserMcp"], .bool(true))
    XCTAssertEqual(configuration.richChatObject["computerUse"], .bool(true))
  }

  func testHomeComposerConfigurationBridgePreservesEveryProviderField() {
    let launch = ThreadLaunchConfiguration(
      model: "model-a",
      effort: "high",
      contextSize: "128k",
      fast: true,
      thinking: true,
      mode: "plan",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxMode: "workspace-write",
      browserMcp: true,
      crossagentMcp: false,
      computerUse: true,
      chromeMcp: false
    )

    let composer = ThreadConfig(launch)
    XCTAssertEqual(ThreadLaunchConfiguration(composer), launch)
  }

  func testHomeComposerOffersTheSharedCapabilityDrivenControls() throws {
    let composer = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")
    let actions = try Self.source("App/Features/Home/HomeComposerActions.swift")
    let mentions = try Self.source("App/Features/Home/HomeComposerMentions.swift")
    let selectors = try Self.source("App/Features/Home/HomeComposerSelectorSheets.swift")
    let support = try Self.source("App/Features/Home/HomeComposerSupport.swift")

    XCTAssertTrue(composer.contains("RichChatComposerControlsSheet("))
    XCTAssertTrue(selectors.contains("RichChatStrings.composerControls"))
    XCTAssertTrue(support.contains("configuredConfiguration = ThreadLaunchConfiguration"))
    XCTAssertTrue(support.contains("contextSize: configuration.contextSize"))
    XCTAssertTrue(support.contains("thinking: configuration.thinking"))
    XCTAssertTrue(support.contains("mode: configuration.mode"))
    XCTAssertTrue(support.contains("approvalPolicy: configuration.approvalPolicy"))
    XCTAssertTrue(support.contains("approvalsReviewer: configuration.approvalsReviewer"))
    XCTAssertTrue(support.contains("sandboxMode: configuration.sandboxMode"))
    XCTAssertTrue(mentions.contains("RichChatMentionSuggestionsView("))
    XCTAssertTrue(mentions.contains("fileMentionController.selectProject(selectedProject)"))
    XCTAssertTrue(mentions.contains("fileMentions.append(entry.path)"))
    XCTAssertTrue(mentions.contains("mentionedMCPs.append(selection)"))
    XCTAssertTrue(actions.contains("ThreadPromptSegment.file(path:"))
    XCTAssertTrue(actions.contains(".mcp(id: $0.id, name: $0.name)"))
  }

  func testComposerSurfaceOffersNativeControlsAndAllAttachmentSources() throws {
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerView.swift")
    let controls = try Self.source(
      "App/Features/RichChat/UI/RichChatComposerConfiguration.swift"
    )
    let attachments = try Self.source(
      "App/Features/RichChat/UI/RichChatComposerAttachments.swift"
    )
    let context = try Self.source("App/Features/RichChat/UI/RichChatComposerContextBar.swift")

    XCTAssertTrue(composer.contains("RichChatComposerControlsSheet("))
    XCTAssertTrue(composer.contains("configuration.richChatObject"))
    XCTAssertTrue(composer.contains("slashCommandPanel"))
    XCTAssertTrue(composer.contains(#"draft = "/\(command.displayID) ""#))
    XCTAssertTrue(composer.contains("skills.append(skill)"))
    XCTAssertTrue(composer.contains("queuedSegments.append(.file(path: entry.path))"))
    XCTAssertTrue(context.contains("case .file(let path): \"@\\(path)\""))
    XCTAssertTrue(composer.contains("!skills.isEmpty || !mcps.isEmpty"))
    XCTAssertTrue(controls.contains("capabilities[\"slashCommands\"]"))
    XCTAssertTrue(controls.contains("if let threadSlashCommands"))
    XCTAssertTrue(controls.contains("Picker(HomeStrings.model"))
    XCTAssertTrue(controls.contains("Toggle(HomeStrings.fast"))
    XCTAssertTrue(controls.contains("Toggle(RichChatStrings.thinking"))
    XCTAssertTrue(controls.contains("optionalBooleanBinding(\\.browserMcp)"))
    XCTAssertTrue(controls.contains("optionalBooleanBinding(\\.crossagentMcp)"))
    XCTAssertTrue(controls.contains("optionalBooleanBinding(\\.chromeMcp)"))
    XCTAssertTrue(controls.contains("optionalBooleanBinding(\\.computerUse)"))
    for source in [
      "HomeStrings.photos", "HomeStrings.screenshots", "HomeStrings.camera", "HomeStrings.files",
    ] {
      XCTAssertTrue(attachments.contains(source), source)
    }
  }

  func testActiveTurnComposerQueuesSteerAndOnlyShowsStopWhileEmpty() throws {
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerView.swift")
    let inlineControls = try Self.source(
      "App/Features/RichChat/UI/RichChatComposerInlineControls.swift"
    )
    let thread = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadView.swift")

    XCTAssertTrue(
      inlineControls.contains("(isTurnActive || isSending) && !hasPrompt")
    )
    XCTAssertTrue(composer.contains("let queuesSteer = isTurnActive"))
    XCTAssertTrue(composer.contains("controller.setPendingSteer("))
    XCTAssertTrue(composer.contains("RichSetPendingSteerInput("))
    XCTAssertTrue(composer.contains("RichChatPresentation.composerDenyResolution"))
    XCTAssertTrue(composer.contains("requestController.resolve(denial"))
    XCTAssertTrue(thread.contains("thread?.status == \"working\""))
    XCTAssertFalse(thread.contains("\"needs_reply\"].contains(status)"))
  }

  func testNewComposerStringsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Localizable.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    for key in [
      "rich_chat_composer_controls", "rich_chat_thinking", "rich_chat_remove_skill_action",
      "rich_chat_remove_file_action",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)"
        )
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  func testCompactConversationKeepsTranscriptPrimaryAndDocksActionsAtTheComposer() throws {
    let thread = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadView.swift")
    let layout = try Self.source(
      "App/Features/RichChat/UI/Components/RichChatResponsiveLayout.swift"
    )
    let transcript = try Self.source(
      "App/Features/RichChat/UI/Views/RichChatTranscriptSurface.swift"
    )
    let timeline = try Self.source("App/Features/RichChat/UI/RichChatTimelineView.swift")
    let pageState = try Self.source(
      "App/Features/RichChat/UI/Pages/RichChatThreadPageState.swift"
    )
    let dock = try Self.source("App/Features/RichChat/UI/RichChatCompactControlDock.swift")
    let infoControls = try Self.source(
      "App/Features/RichChat/UI/RichChatCompactInfoControls.swift"
    )
    let providerUsage = try Self.source("App/Features/RichChat/UI/RichChatProviderUsage.swift")
    let checkpoints = try Self.source("App/Features/RichChat/UI/RichChatCheckpointView.swift")

    XCTAssertTrue(thread.contains("RichChatResponsiveLayout"))
    XCTAssertTrue(thread.contains(".toolbarBackground(.hidden, for: .navigationBar)"))
    XCTAssertFalse(thread.contains(".toolbarBackground(.ultraThinMaterial"))
    XCTAssertTrue(thread.contains("PoracodeToolbarInfoBubble {"))
    XCTAssertTrue(layout.contains("if width >= breakpoint"))
    XCTAssertTrue(layout.contains("maximumSidebarWidth: CGFloat = 350"))
    XCTAssertTrue(layout.contains("VStack(spacing: 0)"))
    XCTAssertTrue(layout.contains("RichChatCompactOverlayHeightPreferenceKey"))
    XCTAssertTrue(layout.contains("proxy.size.height"))
    XCTAssertTrue(
      layout.contains(".environment(\\.richChatCompactOverlayClearance, compactOverlayHeight)")
    )
    XCTAssertTrue(timeline.contains("@Environment(\\.richChatCompactOverlayClearance)"))
    XCTAssertTrue(timeline.contains(".padding(.bottom, compactOverlayClearance + 12)"))
    XCTAssertTrue(thread.contains("RichChatCompactControlDock("))
    XCTAssertFalse(thread.contains(".frame(maxHeight: 250)"))
    XCTAssertEqual(thread.components(separatedBy: "RichChatControlPanel(").count - 1, 1)
    XCTAssertTrue(transcript.contains("RichChatTimelineView("))
    XCTAssertLessThan(thread.split(separator: "\n").count, 300)
    XCTAssertTrue(dock.contains("prefix(1)"), "Only the first actionable request is docked")
    XCTAssertTrue(dock.contains("suite.conversation.clearPendingSteer()"))
    for destination in [
      "destination: .context", "destination: .usage", "destination: .plan",
      "destination: .errors", "destination: .goal",
      "destination: .git(projectLocation)",
    ] {
      XCTAssertTrue(dock.contains(destination), destination)
    }
    XCTAssertTrue(dock.contains(".sheet(item: $destination)"))
    XCTAssertTrue(infoControls.contains("PoracodeCompactControlGroup"))
    XCTAssertTrue(infoControls.contains(".buttonStyle(.plain)"))
    XCTAssertTrue(layout.contains(".overlay(alignment: .bottom)"))
    XCTAssertFalse(layout.contains("compactScrimPresented"))
    XCTAssertFalse(layout.contains("Color.black.opacity(0.22)"))
    XCTAssertTrue(infoControls.contains("Image(systemName: control.systemImage)"))
    XCTAssertTrue(infoControls.contains("RichChatGitChanges"))
    XCTAssertTrue(dock.contains("gitSummary.totalInsertions"))
    XCTAssertTrue(dock.contains("gitSummary.totalDeletions"))
    XCTAssertTrue(dock.contains("thread?.worktreePath?.isEmpty == false"))
    XCTAssertTrue(dock.contains("point.3.connected.trianglepath.dotted"))
    XCTAssertTrue(infoControls.contains(".frame(width: 28, height: 28)"))
    XCTAssertTrue(infoControls.contains("struct RichChatProgressRing: View"))
    XCTAssertTrue(
      infoControls.contains(
        "RichChatProgressRing(percent: control.progressPercent, diameter: 22, lineWidth: 2)"
      )
    )
    XCTAssertTrue(
      infoControls.contains(
        "RichChatProgressRing(percent: rings.outerPercent, diameter: 22, lineWidth: 2)"
      )
    )
    XCTAssertTrue(
      infoControls.contains(
        "RichChatProgressRing(percent: rings.innerPercent, diameter: 14, lineWidth: 2)"
      )
    )
    XCTAssertTrue(infoControls.contains("controls.filter { !isContext($0.destination)"))
    XCTAssertGreaterThanOrEqual(
      infoControls.components(separatedBy: "PoracodeCompactControlGroup {").count - 1,
      3
    )
    XCTAssertFalse(infoControls.contains(".poracodeGlassBackground(in: Circle())"))
    XCTAssertTrue(dock.contains("progressPercent: contextSummary.percent.map(Double.init)"))
    XCTAssertFalse(dock.contains("badge: contextSummary.percent.map(percentBadge)"))
    XCTAssertTrue(infoControls.contains(".accessibilityLabel(control.accessibilityLabel)"))
    XCTAssertTrue(checkpoints.contains("struct RichChatCheckpointSheet"))
    XCTAssertTrue(checkpoints.contains("@Environment(\\.dismiss)"))
    XCTAssertTrue(checkpoints.contains(".sheet(item: $presentation)"))
    XCTAssertTrue(pageState.contains("SettingsHostInformationController"))
    XCTAssertTrue(pageState.contains("activateGitInterest()"))
    XCTAssertTrue(pageState.contains("releaseGitInterest()"))
    XCTAssertTrue(pageState.contains("providerUsageController.refresh(.usage)"))
    XCTAssertTrue(providerUsage.contains("SettingsMoreRouteView(session: session, route: .usage)"))
    XCTAssertTrue(providerUsage.contains("snapshot.windows"))
  }

  func testCompactComposerUsesNativeNeutralIconControlsOnOneBottomRow() throws {
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerView.swift")
    let status = try Self.source("App/Features/RichChat/UI/RichChatControlPanel.swift")
    let actions = try Self.source("App/Features/Components/ActionComponents.swift")
    let attachments = try Self.source(
      "App/Features/RichChat/UI/RichChatComposerAttachments.swift"
    )
    let context = try Self.source("App/Features/RichChat/UI/RichChatComposerContextBar.swift")
    let glass = try Self.source("App/Features/Components/GlassHelpers.swift")
    let homeActions = try Self.source("App/Features/Home/HomeComposerActions.swift")
    let homeComposer = try Self.source("App/Features/Home/Views/HomeQuickComposeContent.swift")
    let home = try Self.source("App/Features/Home/HomeView.swift")

    XCTAssertTrue(composer.contains("let canOpenControls = agentStatus != nil && canConfigure"))
    XCTAssertTrue(composer.contains("RichChatAdaptiveComposer("))
    XCTAssertTrue(composer.contains("PoracodeStatusBubble {"))
    XCTAssertTrue(actions.contains("struct PoracodeStatusBubble<Content: View>"))
    XCTAssertTrue(actions.contains("struct PoracodeToolbarInfoBubble<Content: View>"))
    XCTAssertTrue(actions.contains("func poracodeNativeBubbleSurface"))
    XCTAssertTrue(actions.contains("glassEffect(.regular.interactive(), in: shape)"))
    XCTAssertTrue(actions.contains("glassEffect(.regular, in: shape)"))
    XCTAssertTrue(
      actions.contains(".poracodeNativeBubbleSurface(in: Capsule(), interactive: true)")
    )
    XCTAssertFalse(status.contains("RichChatStrings.readOnly"))
    XCTAssertTrue(attachments.contains("PoracodeCircleMenu {"))
    XCTAssertTrue(
      attachments.contains(
        "Button(RichChatStrings.composerControls, systemImage: \"slider.horizontal.3\")"
      )
    )
    XCTAssertTrue(context.contains("struct RichChatComposerContextBar: View"))
    XCTAssertTrue(glass.contains("color: Color = .secondary"))
    XCTAssertTrue(homeComposer.contains("collapseComposer()"))
    XCTAssertTrue(homeComposer.contains("if supportsFast { fastButton }"))
    let fastIndex = try XCTUnwrap(
      homeComposer.range(of: "if supportsFast { fastButton }")?.lowerBound)
    let effortIndex = try XCTUnwrap(
      homeComposer.range(of: "if !effortOptions.isEmpty { effortMenu }")?.lowerBound)
    XCTAssertLessThan(fastIndex, effortIndex)
    XCTAssertTrue(homeActions.contains("promptFocused = false"))
    XCTAssertTrue(homeActions.contains("window.endEditing(true)"))
    XCTAssertTrue(homeActions.contains("#selector(UIResponder.resignFirstResponder)"))
    XCTAssertTrue(homeActions.contains("DispatchQueue.main.async"))
    XCTAssertTrue(home.contains("if path.isEmpty"))
    XCTAssertTrue(home.contains("dismissComposer(animated: false)"))
    XCTAssertLessThan(composer.split(separator: "\n").count, 300)
  }

  func testHomeComposerUsesComponentViewPageLayers() throws {
    let page = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")
    let content = try Self.source("App/Features/Home/Views/HomeQuickComposeContent.swift")
    let components = try Self.source("App/Features/Home/Components/HomeComposerComponents.swift")

    XCTAssertTrue(page.contains("composerSurface"))
    XCTAssertTrue(content.contains("HomeComposerSurface(isExpanded: isExpanded)"))
    XCTAssertTrue(content.contains("HomeComposerCompactSurface("))
    XCTAssertTrue(content.contains("HomeComposerExpandedSurface"))
    XCTAssertTrue(content.contains("HomeComposerActionBar"))
    XCTAssertTrue(content.contains("HomeComposerStartButton("))
    XCTAssertTrue(components.contains("struct HomeComposerSurface<Content: View>: View"))
    XCTAssertTrue(components.contains("struct HomeComposerStartButton: View"))
    XCTAssertLessThan(page.split(separator: "\n").count, 300)
  }

  func testCompactThreadHeaderShowsNativeStatusWithoutDuplicateWorkspaceBar() throws {
    let thread = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadView.swift")
    let title = try Self.source("App/Features/Threads/ThreadDetailTitleView.swift")
    let workspace = try Self.source("App/Features/Threads/ThreadWorkspaceBar.swift")

    XCTAssertTrue(thread.contains("ToolbarItem(placement: .principal)"))
    XCTAssertTrue(thread.contains("ThreadDetailTitleView("))
    XCTAssertTrue(title.contains("HomeProviderIcon(kind: thread.agentKind)"))
    XCTAssertTrue(title.contains("ThreadLifecycleStrings.status(resolvedStatus)"))
    XCTAssertTrue(title.contains("ThreadLifecycleStrings.supportSource(thread.threadStatusSource)"))
    XCTAssertTrue(
      title.contains("ThreadLifecycleStrings.supportDescription(thread.threadStatusSource)")
    )
    XCTAssertTrue(title.contains(".poracodeDrawerListStyle()"))
    XCTAssertTrue(thread.contains("hasBackgroundActivity: suite.transcript.state.transcript"))
    XCTAssertTrue(title.contains("HomeStrings.projectOnHost(project.name, hostLabel)"))
    XCTAssertTrue(title.contains(".popover(isPresented: $showsStatus"))
    XCTAssertTrue(title.contains(".presentationCompactAdaptation(.sheet)"))
    XCTAssertFalse(thread.contains("ThreadWorkspaceBar("))
    XCTAssertFalse(thread.contains("compactWorkspaceHeader"))
    XCTAssertTrue(workspace.contains("isRepository ? .git : .files"))
    XCTAssertTrue(workspace.contains("pullRequest.state != .closed"))
  }

  func testThreadHeaderTreatsLiveBackgroundWorkAsWorking() {
    XCTAssertEqual(
      ThreadStatusPresentation.resolvedStatus(
        status: "finished",
        attention: "none",
        hasBackgroundActivity: true
      ),
      "working"
    )
    XCTAssertEqual(
      ThreadStatusPresentation.resolvedStatus(
        status: "idle",
        attention: "needs_approval",
        hasBackgroundActivity: true
      ),
      "needs_approval"
    )
    XCTAssertEqual(
      ThreadStatusPresentation.resolvedStatus(
        status: "finished",
        attention: "none",
        hasBackgroundActivity: false
      ),
      "finished"
    )
  }

  @MainActor
  func testComposerDraftStoreIsolatesMatchingThreadIDsByHostAndConsumesRestores() throws {
    let hostA = ClientConnectionID(UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!)
    let hostB = ClientConnectionID(UUID(uuidString: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")!)
    let keyA = RichChatComposerDraftKey(connectionID: hostA, threadID: "shared-thread")
    let keyB = RichChatComposerDraftKey(connectionID: hostB, threadID: "shared-thread")
    let attachment = RichChatUploadedAttachment(
      name: "reference.png",
      mimeType: "image/png",
      remotePath: "/remote/reference.png"
    )
    let store = RichChatComposerDraftStore()

    store.save(RichChatComposerDraft(text: "host A", attachments: [attachment]), for: keyA)
    store.save(RichChatComposerDraft(text: "host B", attachments: []), for: keyB)

    XCTAssertTrue(store.hasDraft(for: keyA))
    XCTAssertTrue(store.hasDraft(for: keyB))
    XCTAssertEqual(store.take(for: keyA)?.text, "host A")
    XCTAssertFalse(store.hasDraft(for: keyA))
    XCTAssertNil(store.take(for: keyA), "Restore must consume the parked entry")
    XCTAssertTrue(store.hasDraft(for: keyB), "A matching thread id on another host stays isolated")
    XCTAssertEqual(store.take(for: keyB)?.text, "host B")
  }

  @MainActor
  func testComposerDraftStoreDropsEmptyAndRemovedHostContent() {
    let hostA = ClientConnectionID(UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!)
    let hostB = ClientConnectionID(UUID(uuidString: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")!)
    let keyA = RichChatComposerDraftKey(connectionID: hostA, threadID: "thread-a")
    let keyB = RichChatComposerDraftKey(connectionID: hostB, threadID: "thread-b")
    let store = RichChatComposerDraftStore()

    store.save(RichChatComposerDraft(text: "keep", attachments: []), for: keyA)
    store.save(RichChatComposerDraft(text: "other", attachments: []), for: keyB)
    store.save(RichChatComposerDraft(text: "", attachments: []), for: keyA)
    XCTAssertFalse(store.hasDraft(for: keyA))
    XCTAssertNil(store.take(for: keyA))

    store.save(RichChatComposerDraft(text: "remove", attachments: []), for: keyA)
    store.clear(connectionID: hostA)
    XCTAssertNil(store.take(for: keyA))
    XCTAssertEqual(store.take(for: keyB)?.text, "other")
  }

  @MainActor
  func testReviewCommentCanBeQueuedIntoAnExistingThreadDraft() {
    let host = ClientConnectionID(UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!)
    let key = RichChatComposerDraftKey(connectionID: host, threadID: "thread-a")
    let store = RichChatComposerDraftStore()
    let segment = RichPromptSegment.diffComment(
      path: "Sources/App.swift",
      lineNumber: 42,
      side: .new,
      staged: false,
      body: "Handle the nil case"
    )

    store.enqueue(segment, for: key)

    XCTAssertTrue(store.hasDraft(for: key))
    XCTAssertEqual(store.take(for: key)?.segments, [segment])
  }

  func testThreadComposerParksNavigationDraftsAndTracksConfirmedSubmission() throws {
    let pageState = try Self.source(
      "App/Features/RichChat/UI/Pages/RichChatThreadPageState.swift"
    )
    let draftState = try Self.source(
      "App/Features/RichChat/UI/Pages/RichChatThreadDraftState.swift"
    )
    let surface = try Self.source(
      "App/Features/RichChat/UI/Views/RichChatThreadComposerSurface.swift"
    )
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerView.swift")
    let store = try Self.source("App/Features/RichChat/RichChatComposerDraftStore.swift")

    XCTAssertTrue(pageState.contains("RichChatComposerDraftKey("))
    XCTAssertTrue(pageState.contains("draft.park()"))
    XCTAssertTrue(draftState.contains("submittingKey == nil"))
    XCTAssertTrue(surface.contains("onSubmissionStarted: state.beginSubmission"))
    XCTAssertTrue(surface.contains("state.finishSubmission(succeeded: $0)"))
    XCTAssertTrue(composer.contains("succeeded = await controller.send("))
    XCTAssertTrue(composer.contains("onSubmissionFinished(succeeded)"))
    XCTAssertTrue(store.contains("connectionID: ClientConnectionID"))
    XCTAssertTrue(store.contains("@Observable"))
    XCTAssertTrue(store.contains("func hasDraft(for key:"))
  }

  @MainActor
  func testThreadDraftStateRestoresAndIsolatesSubmissionLifecycle() throws {
    let host = ClientConnectionID(UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!)
    let key = RichChatComposerDraftKey(connectionID: host, threadID: "thread-a")
    let store = RichChatComposerDraftStore()
    let state = RichChatThreadDraftState(store: store)

    state.prepare(for: key, baseConfiguration: .empty)
    state.text = "park me"
    state.segments = [.file(path: "README.md")]
    state.park()

    let restored = RichChatThreadDraftState(store: store)
    restored.prepare(for: key, baseConfiguration: .empty)
    XCTAssertEqual(restored.text, "park me")
    XCTAssertEqual(restored.segments, [.file(path: "README.md")])

    restored.beginSubmission()
    restored.text = "retry me"
    restored.finishSubmission(succeeded: false)
    let retry = RichChatThreadDraftState(store: store)
    retry.prepare(for: key, baseConfiguration: .empty)
    XCTAssertEqual(retry.text, "retry me")

    retry.beginSubmission()
    retry.finishSubmission(succeeded: true)
    XCTAssertFalse(store.hasDraft(for: key))
  }

  func testComposerSkillSelectionUsesTheProviderInvocationAndWireMetadata() {
    let skill = SettingsSkillEntry(
      id: "project:review",
      name: "review",
      descriptionText: "Review the current changes",
      folderName: "review",
      absolutePath: "/repo/.agents/skills/review",
      skillFilePath: "/repo/.agents/skills/review/SKILL.md",
      rootPath: "/repo/.agents/skills",
      providerID: "codex",
      providerLabel: "Codex",
      providerGroupID: nil,
      providerGroupLabel: nil,
      providerGroupOrder: nil,
      scope: .project,
      scopeLabel: "Project",
      availability: .poracode,
      origin: .plugin,
      pluginID: "review-plugin",
      pluginName: "Review Plugin",
      enabled: true,
      mutable: true,
      valid: true,
      portable: true,
      linked: false,
      importState: nil,
      sourcePath: nil,
      invalidReason: nil
    )

    let selected = RichChatSkillSelectionFactory.make(
      skill: skill,
      invocationKind: "dollar"
    )

    XCTAssertEqual(selected.invocation, "$review")
    XCTAssertEqual(selected.provider, "Review Plugin")
    XCTAssertEqual(selected.scope, .project)
    XCTAssertEqual(
      selected.segment,
      .skill(
        name: "review",
        path: "/repo/.agents/skills/review/SKILL.md",
        invocation: "$review",
        provider: "Review Plugin",
        scope: "project",
        pluginID: "review-plugin",
        pluginName: "Review Plugin"
      )
    )
  }

  func testComposerExposesEffectiveSkillsAndPersistsThemWithDraftContext() throws {
    let composer = try Self.source("App/Features/RichChat/UI/RichChatComposerView.swift")
    let mentions = try Self.source("App/Features/RichChat/UI/RichChatComposerMentions.swift")
    let picker = try Self.source("App/Features/RichChat/UI/RichChatComposerSkills.swift")
    let controller = try Self.source("App/Features/SettingsIntegrations/SkillsController.swift")
    let draftStore = try Self.source("App/Features/RichChat/RichChatComposerDraftStore.swift")

    XCTAssertTrue(composer.contains("RichChatComposerSkillPicker("))
    XCTAssertTrue(
      composer.contains(
        "skills.map(\\.segment) + mcps.map(\\.segment) + attachmentSegments"
      )
    )
    XCTAssertTrue(composer.contains("mcps.map(\\.segment)"))
    XCTAssertTrue(composer.contains("mentionSuggestionsPanel"))
    XCTAssertTrue(mentions.contains("RichPromptSegment { .mcp(id: id, name: name) }"))
    XCTAssertTrue(picker.contains("controller.effectiveSkillIDs.contains($0.id)"))
    XCTAssertTrue(controller.contains("self.invocation = result.invocation"))
    XCTAssertTrue(draftStore.contains("var skills: [RichChatSelectedSkill] = []"))
    XCTAssertTrue(draftStore.contains("var mcps: [RichChatSelectedMCP] = []"))
    XCTAssertTrue(draftStore.contains("var configuration: ThreadConfig? = nil"))
  }

  func testHomeComposerSelectsAndLaunchesWithEffectiveSkills() throws {
    let home = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")
    let selectors = try Self.source("App/Features/Home/HomeComposerSelectorSheets.swift")
    let actions = try Self.source("App/Features/Home/HomeComposerActions.swift")
    let picker = try Self.source("App/Features/RichChat/UI/RichChatComposerSkills.swift")

    XCTAssertTrue(home.contains("@State var skills: [RichChatSelectedSkill] = []"))
    XCTAssertTrue(home.contains("var skillPickerContext: RichChatSkillPickerContext?"))
    XCTAssertTrue(selectors.contains("RichChatComposerSkillPicker("))
    XCTAssertTrue(selectors.contains("embeddedInNavigationStack: true"))
    XCTAssertTrue(actions.contains("+ skills.map(\\.threadSegment)"))
    XCTAssertTrue(picker.contains("var threadSegment: ThreadPromptSegment"))
  }

  func testThreadWorktreeActionOpensTheFullComposerWithItsExistingWorktreePinned() throws {
    let actionMenu = try Self.source("App/Features/Threads/ThreadDetailActionMenu.swift")
    let menuContent = try Self.source(
      "App/Features/Threads/Components/ThreadDetailActionMenuContent.swift"
    )
    let worktreeSheet = try Self.source(
      "App/Features/Threads/Views/ThreadWorktreeComposeSheet.swift"
    )
    let composer = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")
    let launchSeed = try Self.source("App/Features/Home/Pages/HomeThreadLaunchSeed.swift")

    XCTAssertTrue(menuContent.contains("ThreadLifecycleStrings.newInWorktree"))
    XCTAssertTrue(actionMenu.contains("ThreadWorktreeComposeSheet("))
    XCTAssertTrue(worktreeSheet.contains("worktreePath: worktreePath"))
    XCTAssertTrue(actionMenu.contains("openedThreadID = threadID"))
    XCTAssertTrue(launchSeed.contains("initialWorktree: HomeComposerBranchSelection? = nil"))
    XCTAssertTrue(composer.contains("_branchSelection = State(initialValue: seededWorktree)"))
  }

  func testHomeComposerFiltersPresentationModesAtTheProviderBoundary() throws {
    let guiOnly = try AgentStatusRecord(
      wire: .object([
        "kind": .string("gui"),
        "label": .string("GUI"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "presentationModes": .array([.string("gui")]),
          "models": .array([.object(["id": .string("model"), "label": .string("Model")])]),
        ]),
      ])
    )

    XCTAssertTrue(HomeComposerCatalog.supportsPresentation(guiOnly, mode: .gui))
    XCTAssertFalse(HomeComposerCatalog.supportsPresentation(guiOnly, mode: .terminal))
    XCTAssertEqual(
      HomeComposerCatalog.availableAgents(from: [guiOnly], presentationMode: .gui).map(\.kind),
      ["gui"]
    )
    XCTAssertTrue(
      HomeComposerCatalog.availableAgents(from: [guiOnly], presentationMode: .terminal).isEmpty
    )
    XCTAssertEqual(HomeComposerCatalog.preferredPresentationMode(from: [guiOnly]), .gui)

    let terminalOnly = try AgentStatusRecord(
      wire: .object([
        "kind": .string("terminal"),
        "label": .string("Terminal"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "presentationModes": .array([.string("terminal")]),
          "models": .array([.object(["id": .string("model"), "label": .string("Model")])]),
        ]),
      ])
    )
    XCTAssertEqual(HomeComposerCatalog.preferredPresentationMode(from: [terminalOnly]), .terminal)

    let legacy = try AgentStatusRecord(
      wire: .object([
        "kind": .string("legacy"),
        "label": .string("Legacy"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([:]),
      ])
    )
    XCTAssertEqual(
      HomeComposerCatalog.availableAgents(from: [legacy], presentationMode: .gui).map(\.kind),
      ["legacy"]
    )
  }

  func testHomeComposerFallsBackToACompatibleAgentForFreshProjectsAndModeChanges() throws {
    let home = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")
    let support = try Self.source("App/Features/Home/HomeComposerSupport.swift")
    let actions = try Self.source("App/Features/Home/HomeComposerActions.swift")

    XCTAssertTrue(
      home.contains("availableAgents.first { $0.kind == kind } ?? availableAgents.first")
    )
    XCTAssertTrue(support.contains("guard let agent = availableAgents.first"))
    XCTAssertTrue(support.contains("private func launchModel("))
    XCTAssertTrue(support.contains("presentationMode: presentationMode"))
    XCTAssertTrue(actions.contains("let launchAgentKind = selectedAgent?.kind"))
    XCTAssertTrue(actions.contains("agentKind: launchAgentKind"))
  }

  func testProviderHandoffIsReachableThroughTheNativeThreadMenu() throws {
    let actionMenu = try Self.source("App/Features/Threads/ThreadDetailActionMenu.swift")
    let menuContent = try Self.source(
      "App/Features/Threads/Components/ThreadDetailActionMenuContent.swift"
    )
    let handoff = try Self.source("App/Features/Threads/ThreadProviderHandoff.swift")
    let composer = try Self.source("App/Features/Home/Pages/HomeQuickComposeView.swift")

    XCTAssertTrue(menuContent.contains("RichChatStrings.continueInProvider"))
    XCTAssertTrue(actionMenu.contains("prepareHandoff(.fork)"))
    XCTAssertTrue(actionMenu.contains("prepareHandoff(.move)"))
    XCTAssertTrue(handoff.contains("static func transcriptSummary("))
    XCTAssertTrue(handoff.contains("excludedAgentKind: thread.agentKind"))
    XCTAssertTrue(composer.contains("launchSeed?.defaultPrompt"))
  }

  func testThreadLifecycleParityCopyIsTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/ThreadLifecycle.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    for key in [
      "thread.lifecycle.newInWorktree",
      "thread.status.support.title",
      "thread.status.support.hooks.description",
      "thread.status.support.cli.description",
      "thread.status.support.acp.description",
      "thread.status.support.pending.description",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)")
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  private func agentStatus() throws -> AgentStatusRecord {
    try AgentStatusRecord(
      wire: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "models": .array([
            .object(["id": .string("model-a"), "label": .string("Model A")]),
            .object(["id": .string("model-b"), "label": .string("Model B")]),
          ]),
          "efforts": .array([.string("low"), .string("high")]),
          "modelEfforts": .object([
            "model-a": .array([.string("low"), .string("high")]),
            "model-b": .array([.string("low")]),
          ]),
          "modelDefaultEfforts": .object([
            "model-a": .string("high"), "model-b": .string("low"),
          ]),
          "contextSizes": .array([
            .object(["id": .string("64k"), "label": .string("64K")]),
            .object(["id": .string("128k"), "label": .string("128K")]),
          ]),
          "modelContextSizes": .object([
            "model-a": .array([.string("64k"), .string("128k")]),
            "model-b": .array([.string("64k")]),
          ]),
          "fastModels": .array([.string("model-a")]),
          "thinkingModels": .array([.string("model-a")]),
          "modes": .array([.string("agent"), .string("plan")]),
          "approvalPolicies": .array([
            .object(["id": .string("default"), "label": .string("Default")]),
            .object(["id": .string("never"), "label": .string("Full Access")]),
          ]),
          "slashCommands": .array([
            .object([
              "id": .string("review"),
              "label": .string("Review changes"),
              "description": .string("Review the current changes"),
            ]),
            .object([
              "id": .string("plugin:audit"),
              "label": .string("Audit"),
              "section": .string("skills"),
              "skillName": .string("audit"),
              "skillInvocation": .string("$audit"),
              "skillProvider": .string("Audit Plugin"),
              "skillScope": .string("project"),
            ]),
          ]),
        ]),
      ])
    )
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
