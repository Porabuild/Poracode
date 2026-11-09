import Foundation
import XCTest

@testable import App

/// A feature that compiles but is not registered in the Xcode project is not
/// shipped. These gates fail the moment a production source, a test source, or
/// a String Catalog stops being a member of the target it belongs to — and
/// equally when a harness artefact leaks into a shipping target.
final class AdvancedAndPortRegistrationTests: XCTestCase {
  private static let locales: Set<String> = [
    "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  // MARK: - Source registration

  func testEveryAdvancedProductionSourceIsCompiledIntoTheAppTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["App/Features/AdvancedOperations", "App/Transport/AdvancedOperations"]
    ) {
      XCTAssertTrue(
        project.contains("\(name) in Sources"),
        "\(name) is not a member of the App target"
      )
    }
  }

  func testEveryPortForwardingProductionSourceIsCompiledIntoTheAppTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["App/Features/PortForwarding", "App/Transport/PortForwarding"]
    ) {
      XCTAssertTrue(
        project.contains("\(name) in Sources"),
        "\(name) is not a member of the App target"
      )
    }
  }

  func testEveryGenuineTestSourceIsCompiledIntoTheTestTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["AppTests/AdvancedOperations", "AppTests/PortForwarding"]
    ) where name != "Package.swift" {
      XCTAssertTrue(project.contains("\(name) in Sources"), "\(name) is not a test member")
    }
  }

  func testBothStringCatalogsAreCopiedAsAppResources() throws {
    let project = try Self.project()
    XCTAssertTrue(project.contains("AdvancedOperations.xcstrings in Resources"))
    XCTAssertTrue(project.contains("PortForwarding.xcstrings in Resources"))
  }

  /// The isolated SwiftPM harnesses are development tools. Registering them
  /// would compile shim types into the app and duplicate real symbols.
  func testHarnessArtefactsAreNotRegisteredInAnyTarget() throws {
    let project = try Self.project()
    for forbidden in [
      "Package.swift in Sources", "HarnessShims.swift", "PackageSources", ".build",
    ] {
      XCTAssertFalse(project.contains(forbidden), forbidden)
    }
  }

  func testEveryProductionSourceStaysUnderTheFileSizeBudget() throws {
    for url in try Self.sources(
      in: [
        "App/Features/AdvancedOperations", "App/Transport/AdvancedOperations",
        "App/Features/PortForwarding", "App/Transport/PortForwarding",
      ]
    ) {
      let lines = try String(contentsOf: url, encoding: .utf8)
        .split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lines, 500, url.lastPathComponent)
    }
  }

  // MARK: - Reachability

  /// Advanced Operations must not be reachable as a context-free host-global
  /// entry, and port forwarding must be reachable from the session menu.
  func testEntryPointsAreWiredToTheIntendedSurfaces() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    let more = try Self.source("App/Features/Home/HomeMoreSheet.swift")
    XCTAssertTrue(more.contains("PortForwardingSessionView("))
    XCTAssertTrue(more.contains("embeddedInNavigationStack: true"))
    XCTAssertFalse(more.contains("session.canOpenPortForwarding"))
    XCTAssertTrue(more.contains(".disabled(session.currentProjectControllerSession == nil)"))
    XCTAssertFalse(more.contains("currentProjectControllerSession?.gate(.projectsManage)"))
    XCTAssertTrue(more.contains("SettingsMoreIndexView(session: session)"))
    XCTAssertTrue(more.contains("initialRoute: .schedules"))
    XCTAssertTrue(more.contains("HomeTerminalProjectsView(session: session)"))
    XCTAssertTrue(more.contains("ProjectShellTerminalView("))
    XCTAssertTrue(more.contains("session.projectSyncPreferences.isSynced"))
    XCTAssertTrue(more.contains("await session.switchHost(option.connectionID)"))
    XCTAssertFalse(
      home.contains("AdvancedOperationsSessionView"),
      "Advanced Operations must stay contextual, not a host-global menu item"
    )

    let ports = try Self.source("App/Features/PortForwarding/PortForwardingView.swift")
    XCTAssertTrue(ports.contains(".disabled(!row.canOpen || row.isBusy)"))
    XCTAssertTrue(ports.contains(".disabled(!row.canStop || row.isBusy)"))
    XCTAssertTrue(ports.contains("PoracodeBottomActionBar"))
    XCTAssertTrue(ports.contains("PoracodeCircleButton"))
    XCTAssertTrue(ports.contains("port-forwarding.scan"))
    XCTAssertTrue(ports.contains("port-forwarding.manual"))
    XCTAssertFalse(ports.contains("ToolbarItemGroup(placement: .primaryAction)"))

    let project = try Self.source("App/Features/Projects/ProjectEditView.swift")
    XCTAssertTrue(project.contains("AdvancedOperationsSessionView("))
    XCTAssertTrue(project.contains("surface: .project(identity, expectedLocation:"))

    let threadDestinations = try Self.source("App/Features/Threads/ThreadDetailDestinations.swift")
    XCTAssertTrue(threadDestinations.contains("AdvancedOperationsSessionView("))
    XCTAssertTrue(threadDestinations.contains("surface: .thread(threadID: thread.id)"))
  }

  func testHomeMoreRoutesStayInsideItsSingleNavigationStack() throws {
    let more = try Self.source("App/Features/Home/HomeMoreSheet.swift")
    XCTAssertTrue(more.contains(".poracodeDrawerListStyle()"))

    for destination in [
      "SettingsMoreRouteView(session: session, route: .profile)",
      "SettingsMoreRouteView(session: session, route: .usage)",
      "HostSwitcherView(session: session)",
      "ProjectManagementView(session: session, embeddedInNavigationStack: true)",
      "BrowserMirrorSessionView(session: session, embeddedInNavigationStack: true)",
      "SettingsMoreIndexView(session: session)",
    ] {
      XCTAssertTrue(more.contains(destination), destination)
    }
    XCTAssertTrue(more.contains("initialRoute: .schedules"))
    XCTAssertTrue(more.contains("embeddedInNavigationStack: true"))
    XCTAssertFalse(more.contains("SettingsSessionView(session: session"))

    let settingsComposition = try Self.source(
      "App/Features/Settings/UI/SettingsSessionComposition.swift"
    )
    XCTAssertTrue(settingsComposition.contains("if route == .usage"))
    XCTAssertTrue(settingsComposition.contains("HostSelectionMenu(session: session)"))

    let deviceSettings = try Self.source("App/Features/Settings/UI/DeviceSettingsView.swift")
    XCTAssertTrue(deviceSettings.contains("GitSettingsView(session: session)"))
    XCTAssertTrue(deviceSettings.contains("SettingsGitView(composition: composition"))
  }

  func testHomeProjectActionsPushInsideOneNativeDrawerStack() throws {
    let projectFilter = try [
      "App/Features/Home/HomeProjectFilterSheet.swift",
      "App/Features/Home/Views/HomeProjectFilterDrawer.swift",
      "App/Features/Home/Views/HomeProjectActionsDrawer.swift",
      "App/Features/Home/Pages/HomeProjectMenuDestinationView.swift",
    ].map(Self.source).joined(separator: "\n")

    XCTAssertTrue(projectFilter.contains(".navigationDestination(item: $projectActions)"))
    XCTAssertTrue(projectFilter.contains(".navigationDestination(item: $destination)"))
    XCTAssertFalse(projectFilter.contains(".sheet(item: $projectActions)"))
    XCTAssertFalse(projectFilter.contains(".sheet(item: $destination)"))
    XCTAssertTrue(
      projectFilter.contains(
        ".presentationDetents([.height(compactHeight), .large], selection: $selectedDetent)"
      )
    )
    XCTAssertTrue(projectFilter.contains("selectedDetent: $selectedDetent"))
    XCTAssertTrue(projectFilter.contains("native-e2e.project-filter.done"))
    XCTAssertTrue(
      projectFilter.contains(
        "selectedDetent = destinationID == nil ? .height(preferredHeight) : .large"
      )
    )
    XCTAssertTrue(projectFilter.contains("struct HomeProjectMenuDestinationView: View"))
    XCTAssertTrue(projectFilter.contains("Group {\n      if ready"))
  }

  func testHomeProjectFilterUsesModelComponentViewPageLayers() throws {
    let menu = try Self.source("App/Features/Home/HomeProjectFilterSheet.swift")
    let models = try Self.source("App/Features/Home/Models/HomeProjectFilterModels.swift")
    let rows = try Self.source("App/Features/Home/Components/HomeProjectFilterRows.swift")
    let filter = try Self.source("App/Features/Home/Views/HomeProjectFilterDrawer.swift")
    let actions = try Self.source("App/Features/Home/Views/HomeProjectActionsDrawer.swift")
    let destination = try Self.source(
      "App/Features/Home/Pages/HomeProjectMenuDestinationView.swift"
    )

    XCTAssertTrue(menu.contains("HomeProjectFilterDrawer("))
    XCTAssertTrue(models.contains("enum HomeProjectOptionsPresentation"))
    XCTAssertTrue(rows.contains("struct HomeProjectFilterRow: View"))
    XCTAssertTrue(filter.contains("HomeAllProjectsFilterRow("))
    XCTAssertTrue(actions.contains("HomeProjectGitActionsView("))
    XCTAssertTrue(destination.contains("struct HomeProjectMenuDestinationView: View"))
    for source in [menu, models, rows, filter, actions, destination] {
      XCTAssertLessThan(source.split(separator: "\n").count, 300)
    }
  }

  func testProjectFolderBrowserPreservesPWAContextWhileUsingNativeLists() throws {
    let browser = try Self.source("App/Features/Projects/ProjectDirectoryBrowser.swift")
    XCTAssertTrue(browser.contains("let initialPath: String"))
    XCTAssertTrue(browser.contains(".task(id: initialPath)"))
    XCTAssertTrue(browser.contains("await controller.navigate(to: initialPath)"))
    XCTAssertTrue(browser.contains("listing.entries.filter { $0.type == .file }"))
    XCTAssertTrue(browser.contains(".textSelection(.enabled)"))

    for sourcePath in [
      "App/Features/Projects/ProjectCreationView.swift",
      "App/Features/Projects/ProjectGeneralSettingsView.swift",
    ] {
      let source = try Self.source(sourcePath)
      XCTAssertTrue(source.contains("initialPath: draft.path"), sourcePath)
    }
  }

  func testConnectionRowsReachExactHostProjectsAndDesktopSettings() throws {
    let switcher = try Self.source("App/Features/Hosts/HostSwitcherView.swift")
    let destination = try Self.source("App/Features/Hosts/HostDestinationView.swift")

    XCTAssertTrue(switcher.contains(".contextMenu {"))
    XCTAssertTrue(switcher.contains("kind: .projects"))
    XCTAssertTrue(switcher.contains("kind: .desktopSettings"))
    XCTAssertTrue(switcher.contains(".navigationDestination(item: $destination)"))
    XCTAssertTrue(destination.contains("session.switchHost(destination.connectionID)"))
    XCTAssertTrue(
      destination.contains(
        "ProjectManagementView(session: session, embeddedInNavigationStack: true)"
      )
    )
    XCTAssertTrue(destination.contains("SettingsHostView("))
    XCTAssertTrue(destination.contains("usesStackNavigation: true"))
    let settingsHost = try Self.source("App/Features/Settings/UI/SettingsHostView.swift")
    XCTAssertTrue(settingsHost.contains("HostSelectionMenu(session: session)"))
    XCTAssertTrue(settingsHost.contains("selection: activeSelection"))
    XCTAssertTrue(settingsHost.contains("session.currentSettingsHostSelection"))
    XCTAssertTrue(switcher.contains("beginRename(host)"))
    XCTAssertTrue(switcher.contains("session.renameHost(host.connectionId, label: label)"))
    XCTAssertTrue(switcher.contains("PoracodeBottomActionDock(placement: .trailing)"))
    XCTAssertTrue(switcher.contains("PoracodeCircleButton"))
    XCTAssertTrue(switcher.contains("native-e2e.connections.add"))
    XCTAssertTrue(switcher.contains("hostSection(showsEmptyAction: false)"))
    XCTAssertTrue(switcher.contains("hostSection(showsEmptyAction: true)"))
  }

  func testLiquidGlassStaysInTheFunctionalLayer() throws {
    let advanced = try Self.source("App/Features/AdvancedOperations/AdvancedOperationsChrome.swift")
    XCTAssertTrue(advanced.contains(".background(.regularMaterial"))
    XCTAssertFalse(advanced.contains("GlassEffectContainer"))
    XCTAssertTrue(advanced.contains("poracodeGlassButtonStyle"))
    XCTAssertTrue(advanced.contains("poracodeProminentButtonStyle"))

    let github = try Self.source(
      "App/Features/Projects/GitHubOperations/GitHubOperationsChrome.swift"
    )
    XCTAssertTrue(github.contains(".background(.regularMaterial"))
    XCTAssertFalse(github.contains("GlassEffectContainer"))
    XCTAssertTrue(github.contains("poracodeGlassButtonStyle"))
    XCTAssertTrue(github.contains("poracodeProminentButtonStyle"))

    let ports = try Self.source("App/Features/PortForwarding/PortForwardingView.swift")
    XCTAssertFalse(ports.contains("PortForwardingActionSurface"))
    XCTAssertFalse(ports.contains("PortForwardingPrimaryButtonStyle"))
    XCTAssertTrue(ports.contains("poracodeGlassButtonStyle"))

    let hosts = try Self.source("App/Features/Hosts/HostSwitcherView.swift")
    XCTAssertFalse(hosts.contains("GlassEffectContainer"))
    XCTAssertFalse(hosts.contains("content.glassEffect"))
  }

  /// Liquid Glass primitives are implementation details of the shared
  /// component layer. Feature code must go through the `poracode*` modifiers
  /// so availability gating and fallbacks stay in one place.
  func testLiquidGlassPrimitivesLiveOnlyInTheSharedComponentLayer() throws {
    let appDirectory = Self.appRoot("App")
    guard
      let enumerator = FileManager.default.enumerator(
        at: appDirectory,
        includingPropertiesForKeys: nil
      )
    else {
      XCTFail("cannot enumerate \(appDirectory.path)")
      return
    }
    let forbiddenOutsideComponents = [
      "buttonStyle(.glass",
      "buttonStyle(.bordered",
      "glassEffect(",
      "GlassEffectContainer",
      "glassEffectID(",
      "safeAreaBar(",
      "safeAreaInset(",
      "matchedTransitionSource(",
      "navigationTransition(",
      ".background(.bar)",
    ]
    let gatedPrimitives = [
      "glassEffect(",
      "GlassEffectContainer",
      "buttonStyle(.glass",
      "safeAreaBar(",
      "glassEffectID(",
    ]
    for case let url as URL in enumerator where url.pathExtension == "swift" {
      let source = try String(contentsOf: url, encoding: .utf8)
      let relative = url.path.replacingOccurrences(
        of: appDirectory.path + "/", with: "")
      if url.path.contains("/Features/Components/") {
        if gatedPrimitives.contains(where: { source.contains($0) }) {
          XCTAssertTrue(
            source.contains("#available(iOS 26"),
            "\(relative) uses a gated primitive without an iOS 26 availability check"
          )
        }
      } else {
        for token in forbiddenOutsideComponents {
          XCTAssertFalse(
            source.contains(token),
            "\(relative) contains \(token); use the shared poracode* modifiers instead"
          )
        }
      }
    }
  }

  func testPrimaryProjectActionUsesTheThumbReachableNativeBottomBar() throws {
    let projects = try Self.source("App/Features/Projects/ProjectManagementView.swift")
    let hosts = try Self.source("App/Features/Hosts/HostSwitcherView.swift")
    let ports = try Self.source("App/Features/PortForwarding/PortForwardingView.swift")
    let components = try Self.source("App/Features/Components/GlassHelpers.swift")

    XCTAssertTrue(projects.contains("PoracodeBottomActionDock(placement: .trailing)"))
    XCTAssertTrue(projects.contains("PoracodeCircleButton"))
    XCTAssertTrue(
      projects.contains("Label(ProjectManagementStrings.add, systemImage: \"plus\")")
    )
    XCTAssertTrue(projects.contains("native-e2e.projects.add"))
    XCTAssertFalse(projects.contains("ToolbarItem(placement: .bottomBar)"))
    XCTAssertTrue(components.contains("struct PoracodeBottomActionDock<Content: View>"))
    XCTAssertTrue(
      components.contains("struct PoracodeBottomActionBar<Leading: View, Trailing: View>")
    )
    XCTAssertTrue(
      components.contains("if placement == .trailing { Spacer(minLength: 0) }")
    )
    XCTAssertTrue(components.contains("color: Color = .secondary"))
    XCTAssertTrue(components.contains(".foregroundStyle(color)"))
    XCTAssertTrue(components.contains(".tint(color)"))
    XCTAssertTrue(components.contains(".foregroundStyle(.secondary)"))
    XCTAssertTrue(components.contains(".tint(.secondary)"))
    XCTAssertTrue(components.contains(".frame(width: 44, height: 44)"))
    XCTAssertFalse(components.contains("prominent"))
    XCTAssertTrue(projects.contains("PoracodeCircleButton"))
    XCTAssertTrue(hosts.contains("PoracodeCircleButton"))
    XCTAssertTrue(ports.contains("PoracodeCircleButton"))
  }

  func testNestedCreationPagesReuseTheTrailingNativeActionDock() throws {
    for (relative, identifier) in [
      ("App/Features/Projects/ProjectMCPSettingsView.swift", "native-e2e.project-mcp.add"),
      (
        "App/Features/SettingsIntegrations/UI/GlobalMCPSettingsView.swift",
        "native-e2e.global-mcp.add"
      ),
    ] {
      let source = try Self.source(relative)
      XCTAssertTrue(source.contains("PoracodeBottomActionDock(placement: .trailing)"), relative)
      XCTAssertTrue(source.contains(identifier), relative)
      XCTAssertFalse(source.contains("ToolbarItem(placement: .primaryAction)"), relative)
    }

    let workspace = try Self.source(
      "App/Features/Projects/Components/ProjectWorkspaceBottomControls.swift"
    )
    XCTAssertTrue(workspace.contains("PoracodeBottomActionStrip"))
    XCTAssertEqual(
      workspace.components(separatedBy: "PoracodeBottomActionStrip").count - 1, 1,
      "search and resting states share one morphing strip"
    )
    XCTAssertTrue(workspace.contains("PoracodeCircleMenu"))
    XCTAssertTrue(workspace.contains("ProjectWorkspaceModePicker("))
    XCTAssertTrue(workspace.contains("native-e2e.project-files.create"))
    XCTAssertTrue(workspace.contains("poracodeGlassID(\"workspace.leading\""))
    XCTAssertTrue(workspace.contains("poracodeGlassID(\"workspace.center\""))
    XCTAssertTrue(workspace.contains("poracodeGlassID(\"workspace.trailing\""))
    XCTAssertFalse(workspace.contains("ToolbarItem(placement: .primaryAction)"))

    let workspacePage = try Self.source(
      "App/Features/Projects/Pages/ProjectWorkspacePage.swift"
    )
    let modePicker = try Self.source(
      "App/Features/Projects/Components/ProjectWorkspaceModePicker.swift"
    )
    XCTAssertTrue(workspacePage.contains(".poracodeBottomBar"))
    XCTAssertFalse(workspacePage.contains(".navigationTitle("))
    XCTAssertTrue(workspacePage.contains("if showsWorkspaceControls"))
    XCTAssertTrue(
      workspacePage.contains("preferredCompactColumn != .detail"),
      "Compact detail actions must not overlap the shared Files/Git control strip"
    )
    XCTAssertTrue(modePicker.contains("PoracodeGlassTabs"))
    XCTAssertTrue(modePicker.contains("ProjectWorkspaceStrings.files"))
    XCTAssertTrue(modePicker.contains("ProjectWorkspaceStrings.git"))
    XCTAssertTrue(modePicker.contains("arrow.triangle.branch"))
    XCTAssertTrue(modePicker.contains("native-e2e.workspace.git"))
    XCTAssertFalse(workspacePage.contains(".tabViewBottomAccessory"))
    XCTAssertFalse(workspace.contains("PoracodeCircleTabButton"))

    let gitSidebar = try Self.source(
      "App/Features/Projects/ProjectGitWorkspaceViews.swift"
    )
    XCTAssertTrue(gitSidebar.contains(".contentMargins(.top, 0, for: .scrollContent)"))
    XCTAssertTrue(gitSidebar.contains(".defaultScrollAnchor(.top)"))
    XCTAssertTrue(gitSidebar.contains(".navigationTitle(ProjectWorkspaceStrings.git)"))
  }

  func testWorkflowRunActionsMatchTheCompactBottomCornerLayout() throws {
    let runs = try Self.source("App/Features/GitHubActions/GitHubWorkflowRunsView.swift")

    XCTAssertTrue(runs.contains("PoracodeBottomActionBar"))
    XCTAssertTrue(runs.contains("native-e2e.github-actions.refresh-runs"))
    XCTAssertTrue(runs.contains("native-e2e.github-actions.run-workflow"))
    XCTAssertFalse(runs.contains("ToolbarItemGroup(placement: .topBarTrailing)"))
  }

  func testAddConnectionReusesTheValidatedNativePairingScanner() throws {
    let addHost = try Self.source("App/Features/Hosts/AddHostSheet.swift")
    let scanner = try Self.source("App/Features/Onboarding/PairingScannerView.swift")
    let scannerModel = try Self.source("App/Features/Onboarding/PairingScannerModel.swift")

    XCTAssertTrue(addHost.contains("PairingScannerView("))
    XCTAssertTrue(addHost.contains("onCandidate: applyScannedCandidate"))
    XCTAssertTrue(addHost.contains("candidate.pairingURLOrEmpty"))
    XCTAssertTrue(addHost.contains("candidate.manualBaseURL"))
    XCTAssertTrue(addHost.contains("candidate.manualToken"))
    XCTAssertTrue(addHost.contains("HostStrings.pairingLinkPlaceholder"))
    XCTAssertFalse(addHost.contains("TextField(\"https://"))
    XCTAssertTrue(scanner.contains("PairingScannerModel()"))
    XCTAssertTrue(scannerModel.contains("PairingURL.validatedPairingCandidate"))
  }

  func testTopLevelNotesKeepsTheNativeProjectPickerFromCompactPWA() throws {
    let notes = try Self.source("App/Features/Projects/ProjectNotesPageView.swift")

    XCTAssertTrue(notes.contains("@State private var selectedProjectID: String?"))
    XCTAssertTrue(notes.contains("project.id != RemoteProject.homeScopeID"))
    XCTAssertTrue(notes.contains("session.projectSyncPreferences.isSynced("))
    XCTAssertTrue(notes.contains("if projects.count > 1, let project"))
    XCTAssertTrue(notes.contains("selectedProjectID = option.id"))
    XCTAssertTrue(notes.contains("ProjectNotesView("))

    let editor = try Self.source("App/Features/Projects/ProjectNotesView.swift")
    XCTAssertTrue(editor.contains("GeometryReader { geometry in"))
    XCTAssertTrue(editor.contains("geometry.size.height * 0.42"))
    XCTAssertTrue(editor.contains("native-e2e.notes.editor"))
    XCTAssertTrue(editor.contains("ProjectNoteTextEditor("))
    XCTAssertTrue(editor.contains("startThread(with: selectedNoteText)"))
    XCTAssertTrue(editor.contains("Button(HomeStrings.newThread, systemImage: \"plus.bubble\")"))
    XCTAssertTrue(editor.contains("ProjectNotesThreadComposeSheet("))
    XCTAssertTrue(editor.contains("ProjectNotesThreadDestination("))

    let composer = try Self.source("App/Features/Projects/ProjectNotesThreadComposer.swift")
    XCTAssertTrue(composer.contains("initialPrompt: intent.prompt"))
    XCTAssertTrue(composer.contains("fixedProjectID: intent.identity.projectId"))
    XCTAssertTrue(composer.contains("session.switchHost(intent.identity.connectionId)"))
  }

  func testRemoteUtilityPagesKeepDesktopSelectionReachable() throws {
    let picker = try Self.source("App/Features/Hosts/HostSelectionMenu.swift")
    XCTAssertTrue(picker.contains("session.hosts.count > 1"))
    XCTAssertTrue(picker.contains("session.switchHost(host.connectionId)"))
    XCTAssertTrue(picker.contains("host.connectionId == session.selectedConnectionId"))

    for relative in [
      "App/Features/Projects/ProjectManagementView.swift",
      "App/Features/Projects/ProjectNotesPageView.swift",
      "App/Features/PullRequests/PullRequestsPageView.swift",
      "App/Features/GitHubActions/GitHubActionsProjectsView.swift",
      "App/Features/BrowserMirror/BrowserMirrorSessionView.swift",
      "App/Features/PortForwarding/PortForwardingSessionView.swift",
      "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSessionComposition.swift",
    ] {
      XCTAssertTrue(
        try Self.source(relative).contains("HostSelectionMenu(session: session)"), relative)
    }
  }

  func testProjectBackedUtilitiesExcludeDisabledAndSyntheticHomeProjects() throws {
    let session = try Self.source("App/Features/AppSession.swift")
    XCTAssertTrue(session.contains("var activeWorkspaceProjects: [RemoteProject]"))
    XCTAssertTrue(session.contains("$0.disabled != true && $0.id != RemoteProject.homeScopeID"))

    for relative in [
      "App/Features/PullRequests/PullRequestsController.swift",
      "App/Features/GitHubActions/GitHubActionsProjectsView.swift",
      "App/Features/RemoteIntegrations/UI/RemoteIntegrationsSessionComposition.swift",
    ] {
      XCTAssertTrue(
        try Self.source(relative).contains("activeWorkspaceProjects"), relative
      )
    }

    let pullRequests = try Self.source("App/Features/PullRequests/PullRequestsPageView.swift")
    XCTAssertTrue(pullRequests.contains("resetHostScopedPresentation()"))
    XCTAssertTrue(pullRequests.contains(".task(id: session.currentProjectControllerLease)"))
    XCTAssertTrue(pullRequests.contains(".onChange(of: session.selectedConnectionId)"))

    let projects = try Self.source("App/Features/Projects/ProjectManagementView.swift")
    XCTAssertTrue(projects.contains("deactivateControllers()"))

    let actions = try Self.source("App/Features/GitHubActions/GitHubActionsProjectsView.swift")
    XCTAssertTrue(actions.contains("session.currentProjectControllerSession?.lease.connectionId"))
  }

  /// One identifiable destination, not a set of independent booleans that can
  /// be raised in the same update.
  func testHomeUsesASingleEnumDrivenSheetDestination() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    XCTAssertTrue(home.contains(".sheet(item: $sheetDestination)"))
    XCTAssertFalse(home.contains("isPresented: $showing"))
    XCTAssertFalse(home.contains("@State private var showing"))
  }

  func testHomeCarriesNoRawUserFacingStrings() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    let patterns = [
      #"(?:Text|Label|Button)\(\s*"[^"]"#,
      #"\.(?:accessibilityLabel|navigationTitle)\(\s*"[^"]"#,
      #"(?:message|title|description):\s*"[^"]"#,
    ]
    for pattern in patterns {
      let regex = try NSRegularExpression(pattern: pattern)
      XCTAssertNil(
        regex.firstMatch(in: home, range: NSRange(home.startIndex..., in: home)),
        pattern
      )
    }
  }

  func testHomeToolbarUsesNativeNeutralCircleWithoutNestedGlass() throws {
    let filter = try Self.source("App/Features/Home/HomeProjectFilterSheet.swift")
    let actions = try Self.source("App/Features/Components/ActionComponents.swift")
    let composer = try Self.source("App/Features/Home/Components/HomeComposerComponents.swift")

    XCTAssertTrue(filter.contains("PoracodeToolbarIconButton("))
    XCTAssertFalse(filter.contains("PoracodeCircleButton(surface: .automatic)"))
    XCTAssertFalse(filter.contains("line.3.horizontal.decrease.circle.fill"))
    XCTAssertTrue(actions.contains("struct PoracodeToolbarIconButton: View"))
    XCTAssertTrue(actions.contains(".buttonBorderShape(.circle)"))
    XCTAssertTrue(actions.contains(".tint(color)"))
    XCTAssertTrue(composer.contains(".foregroundStyle(.secondary)"))
    XCTAssertTrue(composer.contains(".tint(.secondary)"))
  }

  func testProductionAppearanceDefaultsToSystemWithoutOverridingExplicitChoices() {
    XCTAssertEqual(PoracodeAppearanceMode.defaultMode, .system)
    XCTAssertEqual(PoracodeAppearanceMode.resolve(""), .system)
    XCTAssertEqual(PoracodeAppearanceMode.resolve("system"), .system)
    XCTAssertEqual(PoracodeAppearanceMode.resolve("light"), .light)
    XCTAssertEqual(PoracodeAppearanceMode.resolve("dark"), .dark)
  }

  func testThemeRootOwnsPageBackgroundAndCircularControlsNeverStackGlass() throws {
    let theme = try Self.source("App/AppTheme.swift")
    let glass = try Self.source("App/Features/Components/GlassHelpers.swift")
    let poracodeGlass = try Self.source("App/Features/Components/PoracodeGlass.swift")
    let actions = try Self.source("App/Features/Components/ActionComponents.swift")
    let homeComposer = try Self.source(
      "App/Features/Home/Components/HomeComposerComponents.swift")
    let home = try Self.source("App/Features/Home/HomeView.swift")
    let layout = try Self.source(
      "App/Features/RichChat/UI/Components/RichChatResponsiveLayout.swift")

    XCTAssertTrue(theme.contains("theme.variant(for: resolvedColorScheme).background"))
    XCTAssertTrue(theme.contains(".scrollContentBackground(.hidden)"))
    XCTAssertFalse(glass.contains("PoracodeCircleButtonSurface"))
    XCTAssertFalse(glass.contains("automaticButton"))
    XCTAssertFalse(glass.contains("automaticMenu"))
    XCTAssertFalse(glass.contains(".poracodeGlassBackground(in: Circle())"))
    XCTAssertTrue(glass.contains("button.buttonStyle(.glass)"))
    XCTAssertTrue(glass.contains("menu.buttonStyle(.glass)"))
    XCTAssertTrue(glass.contains("PoracodeGlassGroup(spacing: 8)"))
    XCTAssertTrue(poracodeGlass.contains("struct PoracodeGlassGroup<Content: View>"))
    XCTAssertTrue(poracodeGlass.contains("GlassEffectContainer(spacing: spacing)"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeGlassID"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeBottomBar"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeTopBar"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeZoomSource"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeZoomTransition"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeNavigationBarChrome"))
    XCTAssertTrue(poracodeGlass.contains("func poracodeComposerInset"))
    XCTAssertTrue(poracodeGlass.contains("safeAreaBar(edge: .bottom"))
    XCTAssertTrue(actions.contains("func poracodeNativeComposerSurface"))
    XCTAssertTrue(
      actions.contains("glassEffect(.regular.interactive(interactive), in: shape)"))
    XCTAssertTrue(actions.contains("background(.regularMaterial, in: shape)"))
    XCTAssertTrue(homeComposer.contains(".poracodeNativeComposerSurface(in: shape"))
    XCTAssertTrue(homeComposer.contains("interactive: !isExpanded"))
    XCTAssertTrue(homeComposer.contains("poracodeGlassID(\"home.compose\""))
    XCTAssertFalse(homeComposer.contains(".shadow("))
    XCTAssertFalse(homeComposer.contains(".background(.regularMaterial"))
    XCTAssertTrue(home.contains("PoracodeGlassGroup(spacing: 8)"))
    XCTAssertTrue(home.contains("poracodeGlassID(\"home.search\""))
    XCTAssertTrue(home.contains("poracodeGlassID(\"home.more\""))
    XCTAssertTrue(home.contains("poracodeZoomSource(id: \"home.search\""))
    XCTAssertTrue(home.contains("poracodeZoomSource(id: \"home.more\""))
    XCTAssertTrue(home.contains("poracodeZoomTransition(sourceID: \"home.search\""))
    XCTAssertTrue(home.contains("poracodeZoomTransition(sourceID: \"home.more\""))
    XCTAssertTrue(home.contains(".poracodeBottomBar"))
    XCTAssertTrue(layout.contains("PoracodeGlassGroup(spacing: 2)"))
    XCTAssertFalse(layout.contains("safeAreaBar("))
    XCTAssertTrue(layout.contains(".poracodeComposerInset"))
  }

  /// The app chrome stays neutral like the PWA: the theme accent reaches the
  /// UI only through `\.poracodeAccent`, which the root injects while keeping
  /// its own tint neutral. Prominent accent fills are reserved for the
  /// pairing-primary and destructive actions enumerated below.
  func testAccentIsReservedForPrimaryActions() throws {
    let theme = try Self.source("App/AppTheme.swift")
    let glass = try Self.source("App/Features/Components/GlassHelpers.swift")
    let buttonStyles = try Self.source(
      "App/Features/Components/PoracodeButtonStyles.swift")

    XCTAssertTrue(theme.contains(".tint(Color.primary)"))
    XCTAssertTrue(theme.contains(".environment(\\.poracodeAccent"))
    // The per-switch modifier lives in the portable button-styles file so the
    // macOS contract packages that symlink it compile the same definition.
    XCTAssertTrue(buttonStyles.contains("func poracodeSwitchStyle"))
    XCTAssertTrue(buttonStyles.contains("private struct PoracodeSwitchStyleModifier"))
    XCTAssertTrue(buttonStyles.contains("content.toggleStyle(.switch).tint(accent)"))
    XCTAssertFalse(buttonStyles.contains("PoracodeSwitchToggleStyle"))
    XCTAssertFalse(theme.contains("func poracodeSwitchStyle"))
    XCTAssertFalse(theme.contains("PoracodeSwitchStyleModifier"))
    // The theme root applies no global toggle style (which never reached
    // sheet content anyway); switches opt in per call.
    XCTAssertEqual(
      theme.components(separatedBy: ".toggleStyle(").count - 1, 0,
      "expected no .toggleStyle( in AppTheme (the per-switch modifier is portable)")
    XCTAssertFalse(
      theme.contains(".tint(theme.variant(for: resolvedColorScheme).accent)"))
    XCTAssertTrue(buttonStyles.contains("tint ?? accent"))
    XCTAssertFalse(glass.contains("prominent"))

    let prominentAllowlist: Set<String> = [
      "Features/Onboarding/OnboardingView.swift",
      "Features/Onboarding/OnboardingStatusViews.swift",
      "Features/Hosts/AddHostSheet.swift",
      "Features/AdvancedOperations/AdvancedOperationsChrome.swift",
      "Features/Projects/GitHubOperations/GitHubOperationsChrome.swift",
    ]
    let appDirectory = Self.appRoot("App")
    guard
      let enumerator = FileManager.default.enumerator(
        at: appDirectory,
        includingPropertiesForKeys: nil
      )
    else {
      XCTFail("cannot enumerate \(appDirectory.path)")
      return
    }
    for case let url as URL in enumerator where url.pathExtension == "swift" {
      let source = try String(contentsOf: url, encoding: .utf8)
      let relative = url.path.replacingOccurrences(
        of: appDirectory.path + "/", with: "")
      let isComponents = url.path.contains("/Features/Components/")
      let isThemeRoot = url.lastPathComponent == "AppTheme.swift"
      if source.contains("poracodeProminentButtonStyle(") {
        XCTAssertTrue(
          isComponents || prominentAllowlist.contains(relative),
          "\(relative) uses poracodeProminentButtonStyle outside the primary-action allowlist"
        )
      }
      if !isComponents && !isThemeRoot {
        XCTAssertFalse(
          source.contains("accentColor"),
          "\(relative) references accentColor; read \\.poracodeAccent or stay neutral"
        )
      }
    }
  }

  /// Root-level `.toggleStyle` modifiers do not reach sheet content, so every
  /// switch `Toggle` opts in per call via `.poracodeSwitchStyle()`, which reads
  /// `\.poracodeAccent` (environment values *do* cross into sheets). Chip-style
  /// `.toggleStyle(.button)` toggles keep their own style and are exempt.
  func testEverySwitchToggleUsesPoracodeSwitchStyle() throws {
    let appDirectory = Self.appRoot("App")
    guard
      let enumerator = FileManager.default.enumerator(
        at: appDirectory,
        includingPropertiesForKeys: nil
      )
    else {
      XCTFail("cannot enumerate \(appDirectory.path)")
      return
    }
    let togglePattern = try NSRegularExpression(pattern: #"\bToggle[ \t]*\("#)
    for case let url as URL in enumerator where url.pathExtension == "swift" {
      let isComponents = url.path.contains("/Features/Components/")
      let isThemeRoot = url.lastPathComponent == "AppTheme.swift"
      if isComponents || isThemeRoot { continue }
      let source = try String(contentsOf: url, encoding: .utf8)
      let relative = url.path.replacingOccurrences(
        of: appDirectory.path + "/", with: "")
      let toggleCount = togglePattern.numberOfMatches(
        in: source, range: NSRange(source.startIndex..., in: source))
      let styledCount = source.components(
        separatedBy: ".poracodeSwitchStyle()").count - 1
      let buttonCount = source.components(
        separatedBy: ".toggleStyle(.button)").count - 1
      XCTAssertEqual(
        toggleCount, styledCount + buttonCount,
        "\(relative): every switch Toggle needs .poracodeSwitchStyle(); "
          + "chip toggles keep .toggleStyle(.button)")
    }
  }

  // MARK: - Catalog parity

  func testEveryTouchedCatalogHasExactLocaleParityWithRealTranslations() throws {
    for relative in [
      "App/Features/AdvancedOperations/AdvancedOperations.xcstrings",
      "App/Features/PortForwarding/PortForwarding.xcstrings",
      "App/Features/PullRequests/PullRequests.xcstrings",
      "App/Resources/Localizable.xcstrings",
      "App/Resources/ProjectSettings.xcstrings",
      "App/Resources/Settings.xcstrings",
    ] {
      let root = try XCTUnwrap(
        JSONSerialization.jsonObject(with: Data(contentsOf: Self.appRoot(relative)))
          as? [String: Any],
        relative
      )
      XCTAssertEqual(root["sourceLanguage"] as? String, "en", relative)
      let strings = try XCTUnwrap(root["strings"] as? [String: Any], relative)
      XCTAssertFalse(strings.isEmpty, relative)
      for (key, rawEntry) in strings {
        let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
        XCTAssertEqual(Set(localizations.keys), Self.locales, "\(relative) \(key)")
        // Plural-variation keys carry one stringUnit per CLDR category instead
        // of a single flat stringUnit; validate every unit the same way.
        let sourceUnits = Self.stringUnits(localizations["en"])
        let source = try XCTUnwrap(sourceUnits.first?["value"] as? String, "\(relative) \(key)")
        let expected = Self.specifiers(in: source)
        for (locale, raw) in localizations {
          let units = Self.stringUnits(raw)
          XCTAssertFalse(units.isEmpty, "\(key)/\(locale)")
          for unit in units {
            XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale)")
            let translation = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
            XCTAssertFalse(
              translation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              "\(key)/\(locale)"
            )
            XCTAssertEqual(
              Self.specifiers(in: translation),
              expected,
              "\(key)/\(locale) format placeholders differ"
            )
          }
        }
      }
    }
  }

  func testNewlyAddedKeysExistInEveryCatalog() throws {
    let advanced = try Self.keys("App/Features/AdvancedOperations/AdvancedOperations.xcstrings")
    for key in [
      "advancedOperations.unavailable.noHost", "advancedOperations.unavailable.noProject",
      "advancedOperations.unavailable.noThread", "advancedOperations.unavailable.noLocation",
      "advancedOperations.open.project", "advancedOperations.open.thread",
    ] {
      XCTAssertTrue(advanced.contains(key), key)
    }
    XCTAssertTrue(
      try Self.keys("App/Features/PortForwarding/PortForwarding.xcstrings")
        .contains("port-forwarding.close")
    )
    let home = try Self.keys("App/Resources/Localizable.xcstrings")
    for key in [
      "home.projects.loading", "home.projects.empty.title", "home.projects.empty.description",
      "home.title.fallback", "home.action.refresh", "hosts.switcher.title",
      "home.accessibility.sessionMenu", "home.accessibility.error",
      "home.project.threadCount", "home.accessibility.project",
      "home.project.threads.empty.description", "common.action.retry",
      "common.error.title", "common.state.loading",
    ] {
      XCTAssertTrue(home.contains(key), key)
    }

    let settings = try Self.keys("App/Resources/Settings.xcstrings")
    for key in [
      "settings.general.title", "settings.general.language",
      "settings.general.description", "settings.general.openSettings",
      "settings.device.summary", "settings.notifications.title",
      "settings.notifications.description", "settings.desktop.title",
      "settings.terminal.title", "settings.terminal.description",
      "settings.terminal.systemBehavior", "settings.terminal.textSize",
      "settings.git.title", "settings.git.description", "settings.git.nativeBehavior",
      "settings.desktop.description", "settings.desktop.summary",
      "settings.privacy", "settings.support", "settings.usage.tokenCount",
      "settings.appearance.chatTextSize", "settings.appearance.chatTextSize.description",
    ] {
      XCTAssertTrue(settings.contains(key), key)
    }

    let projectSettings = try Self.keys("App/Resources/ProjectSettings.xcstrings")
    for key in [
      "projectSettings.general", "projectSettings.worktrees", "projectSettings.actions",
      "projectSettings.skills", "projectSettings.mcp", "projectSettings.search",
      "projectSettings.mcp.add", "projectSettings.mcp.edit",
      "projectSettings.mcp.discoverImport", "projectSettings.mcp.error.configuration",
      "projectSettings.worktrees.location", "projectSettings.worktrees.setup",
      "projectSettings.actions.add", "projectSettings.search.exclude",
    ] {
      XCTAssertTrue(projectSettings.contains(key), key)
    }

    let pullRequests = try Self.keys("App/Features/PullRequests/PullRequests.xcstrings")
    for key in [
      "pullRequests.review.actions", "pullRequests.review.checks",
      "pullRequests.review.conversation", "pullRequests.review.description",
      "pullRequests.review.commits", "pullRequests.action.search",
      "pullRequests.action.filter", "pullRequests.filter.projects",
      "pullRequests.filter.accounts", "pullRequests.filter.showAll",
    ] {
      XCTAssertTrue(pullRequests.contains(key), key)
    }
  }

  // MARK: - Helpers

  private static func appRoot(_ relative: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
  }

  private static func project() throws -> String {
    try String(
      contentsOf: appRoot("App.xcodeproj/project.pbxproj"),
      encoding: .utf8
    )
  }

  private static func source(_ relative: String) throws -> String {
    try String(contentsOf: appRoot(relative), encoding: .utf8)
  }

  private static func sources(in directories: [String]) throws -> [URL] {
    try directories.flatMap { relative in
      try FileManager.default.contentsOfDirectory(
        at: appRoot(relative),
        includingPropertiesForKeys: nil
      )
      .filter { $0.pathExtension == "swift" }
    }
  }

  private static func swiftFileNames(in directories: [String]) throws -> [String] {
    try sources(in: directories).map(\.lastPathComponent).filter { $0 != "Package.swift" }
  }

  private static func keys(_ relative: String) throws -> Set<String> {
    let root =
      try JSONSerialization.jsonObject(with: Data(contentsOf: appRoot(relative)))
      as? [String: Any]
    return Set(((root?["strings"] as? [String: Any]) ?? [:]).keys)
  }

  /// Every `stringUnit` a localization carries: the flat unit, or one per
  /// plural-variation category (`variations.plural.<category>.stringUnit`).
  private static func stringUnits(_ raw: Any?) -> [[String: Any]] {
    guard let localization = raw as? [String: Any] else { return [] }
    var units: [[String: Any]] = []
    if let unit = localization["stringUnit"] as? [String: Any] {
      units.append(unit)
    }
    if let variations = localization["variations"] as? [String: Any] {
      for (_, rawVariation) in variations {
        for (_, rawCategory) in (rawVariation as? [String: Any] ?? [:]) {
          if let unit = (rawCategory as? [String: Any])?["stringUnit"]
            as? [String: Any]
          {
            units.append(unit)
          }
        }
      }
    }
    return units
  }

  private static func specifiers(in value: String) -> [String] {
    guard
      let regex = try? NSRegularExpression(
        pattern: #"%(?:\d+\$)?[-+ 0#]*[\d.*]*(?:hh|h|ll|l|q|L|z|j|t)?[@aAcdDeEfFgGinoOpsSuUxX%]"#
      )
    else { return [] }
    let range = NSRange(value.startIndex..., in: value)
    return regex.matches(in: value, range: range).compactMap {
      Range($0.range, in: value).map { String(value[$0]) }
    }.sorted()
  }
}
