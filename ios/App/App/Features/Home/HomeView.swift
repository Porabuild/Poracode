import SwiftUI

struct HomeView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.poracodeTheme) private var theme
  @Environment(\.nativeCommandRegistry) private var commandRegistry
  @Bindable var session: AppSession
  @State private var path = NavigationPath()
  @State private var detailPath = NavigationPath()
  @State private var selectedThread: ThreadRoute?
  @State private var selectedProject: ProjectRoute?
  @State private var nestedThread: ThreadRoute?
  @State private var isDockedSidebarVisible = true
  @State private var isOverlaySidebarVisible = false
  @AppStorage("ios.layout.sidebarWidth.v1") private var storedSidebarWidth: Double = 0
  @State private var preferredCompactColumn: NavigationSplitViewColumn = .detail
  @State private var currentLayout = HomeAdaptiveLayoutPolicy.resolve(for: .zero)
  @State private var keyboardUnobstructedSize: CGSize = .zero
  @Bindable private var notificationNavigation = NotificationNavigationCenter.shared
  @Bindable private var routes = NotificationRouteController.shared
  @Bindable private var remoteNotifications = RemoteUserNotificationPresentationCenter.shared
  @State private var lastNotificationEventId: UInt64?
  @State private var sheetReturnConnectionID: ClientConnectionID?
  @State private var isRestoringSheetHost = false
  @State private var sheetDestination: HomeSheetDestination?
  @State private var commandSearch: NativeHomeCommandSearch?
  @State private var navigationSelection = HomeNavigationSelection()
  @State private var chatWindow = RichChatWindowSession()
  @State private var navigationRetention = PoracodeNavigationRetention()
  private var openingThreadID: String? { navigationSelection.openingID }
  @State private var selectedProjectIDs = Set<String>()
  @State private var compactThreadStatus = HomeThreadListStatus.active
  @State private var showsCompletedThreads = false
  @AppStorage(HomeWorkspacePreferences.storageKey) private var workspaceStorage = ""
  @SceneStorage(HomeWorkspacePreferences.selectionKey) private var storedWorkspaceID = ""
  @State private var composerExpanded = false
  @State private var composerInitialProjectID: String?
  @State private var quickComposeStore = HomeQuickComposeStore()
  @State private var isRefreshing = false
  @State private var threadLifecycle: HomeThreadLifecycleCoordinator
  @Namespace private var glassNamespace

  init(session: AppSession) {
    _session = Bindable(wrappedValue: session)
    _threadLifecycle = State(
      initialValue: HomeThreadLifecycleCoordinator(session: session)
    )
  }

  private var allUnifiedThreads: [UnifiedThreadListItem] {
    UnifiedThreadPresentation.entries(
      hosts: session.state.hosts,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots
    )
  }

  private var unifiedThreads: [UnifiedThreadListItem] {
    allUnifiedThreads.filter {
      !session.sideChats.isHidden(threadID: $0.thread.id, connectionID: $0.connectionID)
      && session.projectSyncPreferences.isSynced(
        connectionID: $0.connectionID,
        projectID: $0.project.id
      )
    }
  }

  private var workspaceThreads: [UnifiedThreadListItem] {
    let preferences = workspacePreferences
    let workspaceID = preferences.activeID(stored: storedWorkspaceID)
    return unifiedThreads.filter { preferences.includes($0, activeID: workspaceID) }
  }

  private var threadListScope: HomeThreadListScope {
    HomeThreadListScope(workspaceThreads: workspaceThreads, projectIDs: selectedProjectIDs)
  }

  private var visibleThreads: [UnifiedThreadListItem] {
    let scope = threadListScope
    if !currentLayout.isSplit { return scope[compactThreadStatus] }
    return showsCompletedThreads ? scope.active + scope.done : scope.active
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }

  private var workspacePreferences: HomeWorkspacePreferences { HomeWorkspacePreferences(stored: workspaceStorage) }
  private var activeWorkspaceID: String? { workspacePreferences.activeID(stored: storedWorkspaceID) }
  private var workspaceContext: HomeWorkspaceContext { .init(preferences: workspacePreferences, activeID: activeWorkspaceID) }
  private var workspaceInputs: [HomeWorkspaceHostInput] {
    session.state.hosts.compactMap { host in
      let snapshot = host.connectionId == session.selectedConnectionId
        ? session.state.snapshot ?? session.state.hostSnapshots[host.connectionId]
        : session.state.hostSnapshots[host.connectionId]
      guard let snapshot else { return nil }
      return HomeWorkspaceHostInput(connectionID: host.connectionId, workspaces: snapshot.workspaces,
        projects: snapshot.projects, homeThreadIDs: snapshot.threads.filter { $0.projectId == RemoteProject.homeScopeID }.map(\.id))
    }
  }

  private var preferredSidebarWidth: CGFloat? {
    storedSidebarWidth > 0 ? CGFloat(storedSidebarWidth) : nil
  }

  var body: some View {
    GeometryReader { proxy in
      let layout = HomeAdaptiveLayoutPolicy.resolve(
        for: proxy.size,
        safeAreaInsets: proxy.safeAreaInsets,
        preferredSidebarWidth: preferredSidebarWidth,
        keyboardUnobstructedHeight: PoracodeKeyboardViewport.height(keyboardUnobstructedSize, matching: proxy.size),
        accessibilitySize: dynamicTypeSize.isAccessibilitySize,
        retainingMode: navigationRetention.isActive
          || session.sideChats.entries.values.contains { $0.isPresented && $0.voice.request != nil }
          ? currentLayout.mode : nil
      )
      adaptiveRoot(layout: layout)
        .onAppear {
          currentLayout = layout
          consumeNotificationEvent(notificationNavigation.event, isSplit: layout.isSplit)
        }
        .onChange(of: layout) { _, updated in
          let previous = currentLayout
          currentLayout = updated
          if previous.isSplit != updated.isSplit {
            synchronizeLayoutTransition(isSplit: updated.isSplit)
          }
          if previous.sidebarPresentation != updated.sidebarPresentation {
            preferredCompactColumn = .detail
            isOverlaySidebarVisible = false
          }
        }
        .onChange(of: path.count) { _, count in
          if !layout.isSplit && count == 0 && !composerExpanded {
            navigationSelection.invalidate()
            selectedThread = nil
            selectedProject = nil
          }
        }
        .onChange(of: notificationNavigation.event) { _, event in
          consumeNotificationEvent(event, isSplit: layout.isSplit)
        }
        .onChange(of: session.selectedConnectionId) { _, connectionID in
          if sheetDestination != nil || isRestoringSheetHost { return }
          if let connectionID,
            selectedThread?.id.decode()?.connectionId == connectionID
              || selectedProject?.id.decode()?.connectionId == connectionID { return }
          path = NavigationPath()
          detailPath = NavigationPath()
          if selectedThread?.id.decode()?.connectionId != connectionID {
            selectedThread = nil
          }
          if selectedProject?.id.decode()?.connectionId != connectionID {
            selectedProject = nil
          }
        }
    }
    .onDisappear { navigationSelection.invalidate() }
    .onChange(of: keyboardThread?.id, initial: true) { _, id in
      navigationSelection.viewThread(id?.rawValue)
    }
    .onChange(of: selectedThreadCompletion) { previous, current in
      if let current, current.becameDone(after: previous) {
        dismissCompletedThread(current.id)
      }
    }
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .poracodeObserveKeyboardUnobstructedSize { keyboardUnobstructedSize = $0 }
    .onChange(of: workspaceInputs, initial: true) { _, inputs in
      var preferences = workspacePreferences
      preferences.importHosts(inputs, activeID: activeWorkspaceID)
      if preferences.encoded != workspaceStorage { workspaceStorage = preferences.encoded }
    }
    .onChange(of: projectFilterOptions.map(\.id), initial: true) {
      selectedProjectIDs.formIntersection(projectFilterOptions.map(\.id))
    }
    .onChange(of: compactThreadStatus) { _, status in
      if status == .done { showsCompletedThreads = true }
    }
    .task {
      await session.refreshUnifiedThreadList()
      session.sideChats.synchronizeOwners(session: session)
    }
    .onChange(of: session.socketState) { _, state in
      if state == .online {
        session.sideChats.synchronizeOwners(session: session)
        Task { await session.sideChats.reconcileParents(session: session) }
      }
    }
    .onChange(of: session.snapshot?.threads.map(\.id)) { _, _ in
      Task { await session.sideChats.reconcileParents(session: session) }
    }
    .sheet(item: $sheetDestination, onDismiss: finishSheet) { destination in
      sizedSheetContent(for: destination)
        .modifier(PoracodeRetainNavigationWhilePresented())
        .nativeCommands(identity: "home-sheet:\(destination.id)", priority: 1000, blocksParentActions: true)
    }
    .confirmationDialog(
      routes.pendingHostSwitch.map { NotificationRouteStrings.hostSwitchTitle($0.hostLabel) }
        ?? NotificationRouteStrings.hostSwitchFallbackTitle,
      isPresented: Binding(
        get: { routes.pendingHostSwitch != nil },
        set: { if !$0 { routes.cancelPendingHostSwitch() } }
      ),
      titleVisibility: .visible
    ) {
      Button(NotificationRouteStrings.hostSwitchConfirm) {
        routes.confirmPendingHostSwitch()
      }
      Button(NotificationRouteStrings.hostSwitchCancel, role: .cancel) {
        routes.cancelPendingHostSwitch()
      }
    } message: {
      Text(NotificationRouteStrings.hostSwitchMessage)
    }
    .overlay(alignment: .top) {
      if let banner = remoteNotifications.banner {
        RemoteUserNotificationBannerView(
          banner: banner,
          open: {
            remoteNotifications.dismiss()
            routes.submit(banner.route)
          },
          dismiss: { remoteNotifications.dismiss() }
        )
        .frame(maxWidth: 440)
        .padding(.horizontal, 12)
        .safeAreaPadding(.top, 8)
        .transition(.move(edge: .top).combined(with: .opacity))
        .zIndex(100)
      }
    }
    .animation(.snappy(duration: 0.25), value: remoteNotifications.banner?.id)
    .environment(\.homeWorkspace, workspaceContext)
    .environment(\.poracodeNavigationRetention, navigationRetention)
    .modifier(WorkflowViewerPresentationHost())
    .modifier(ComposerVoiceHost(session: session))
    .environment(\.homeWorkspaceSelection, $storedWorkspaceID)
    .modifier(keyboardCommands)
    .homeThreadLifecyclePresentation(threadLifecycle)
    .overlay(alignment: .bottom) {
      if let error = session.globalError {
        Text(error)
          .font(.footnote)
          .padding(12)
          .frame(maxWidth: .infinity)
          .poracodeGlassBackground()
          .padding()
          .accessibilityLabel(HomeStrings.error(error))
          .onTapGesture { session.clearGlobalError() }
      }
    }
  }

  @ViewBuilder
  private func adaptiveRoot(layout: HomeAdaptiveLayoutPolicy) -> some View {
    if layout.isSplit {
      splitRoot(layout: layout)
    } else {
      compactRoot(layout: layout)
    }
  }

  private func compactRoot(layout: HomeAdaptiveLayoutPolicy) -> some View {
    NavigationStack(path: $path) {
      threadsLoadView(background: palette.background)
        .navigationTitle(HomeStrings.fallbackTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(composerExpanded && layout.isCompactHeight ? .hidden : .automatic, for: .navigationBar)
        .toolbar {
          ToolbarItem(placement: .principal) {
            BrandWordmark(textStyle: .headline)
          }
          ToolbarItem(placement: .topBarTrailing) {
            projectFilterButton(usesCircleButton: false)
          }
        }
        .navigationDestination(for: ProjectRoute.self) { route in
          if !currentLayout.isSplit {
            projectDestinationView(for: route)
              .onAppear { selectedThread = nil }
          }
        }
        .navigationDestination(for: ThreadRoute.self) { route in
          if !currentLayout.isSplit {
            threadDestinationView(for: route, openWorkspaceTools: { openSidebarSheet(.more) })
              .onAppear { selectedThread = route }
          }
        }
        .refreshable {
          await session.refreshUnifiedThreadList()
        }
    }
    .overlay {
      if composerExpanded {
        Color.black.opacity(0.28)
          .ignoresSafeArea()
          .contentShape(Rectangle())
          .onTapGesture { dismissComposer() }
      }
    }
    .poracodeComposerInset {
      if path.isEmpty {
        homeActionDock
          .frame(maxWidth: 560)
          .padding(.horizontal, 12)
          .padding(.bottom, 6)
          .zIndex(20)
      }
    }
  }

  private func splitRoot(layout: HomeAdaptiveLayoutPolicy) -> some View {
    let compactSidebarVisible = horizontalSizeClass == .compact && preferredCompactColumn == .sidebar
    let dockedVisible = layout.usesDockedSidebar && isDockedSidebarVisible
      && (horizontalSizeClass != .compact || compactSidebarVisible)
    let visibility = Binding<NavigationSplitViewVisibility>(
      get: { (layout.usesOverlaySidebar ? isOverlaySidebarVisible : isDockedSidebarVisible) ? .all : .detailOnly },
      set: { value in
        if layout.usesOverlaySidebar { isOverlaySidebarVisible = value != .detailOnly }
        else { isDockedSidebarVisible = value != .detailOnly }
      }
    )
    // Native split navigation lets iPadOS and Duo own column safe areas,
    // overlays and fold symmetry. Keep selection/drafts above the container.
    return NavigationSplitView(columnVisibility: visibility, preferredCompactColumn: $preferredCompactColumn) {
      splitSidebar(
        layout: layout,
        showsUsage: compactSidebarVisible || dockedVisible || (layout.usesOverlaySidebar && isOverlaySidebarVisible)
      )
        .navigationSplitViewColumnWidth(min: 220, ideal: layout.sidebarWidth, max: 440)
        .toolbar(.hidden, for: .navigationBar)
        // The sidebar owns the default item, including its collapsed variant.
        // Its custom header is paired with one native button in the detail bar.
        .toolbar(removing: .sidebarToggle)
    } detail: {
      splitDetailContainer(layout: layout, isSidebarDockedVisible: dockedVisible)
    }
    .navigationSplitViewStyle(.balanced)
    .animation(.snappy(duration: 0.25), value: composerExpanded)
  }

  private func splitSidebar(layout: HomeAdaptiveLayoutPolicy, showsUsage: Bool) -> some View {
    let headerControlSize = HomeSidebarHeaderControls.iconContentSize(compact: layout.isCompactHeight)
    return HomeSplitSidebarView(
      glassNamespace: glassNamespace,
      isCompactHeight: layout.isCompactHeight,
      isSearchDisabled: unifiedThreads.isEmpty,
      canStartThread: session.canOperate,
      isProjectsAvailable: !projectFilterOptions.isEmpty,
      openSearch: { openSidebarSheet(.search(commands: nil)) },
      startNewThread: { startSplitComposer() },
      openMore: { openSidebarSheet(.more) },
      openShortcut: { shortcut in
        switch shortcut {
        case .pullRequests: openSidebarSheet(.pullRequests)
        case .githubActions: openSidebarSheet(.githubActions)
        case .schedules: openSidebarSheet(.schedules)
        case .settings(let destination): openSidebarSheet(.settingsDestination(destination))
        }
      },
      openProjects: { openSidebarSheet(.projectManagement) },
      refresh: { await session.refreshUnifiedThreadList() },
      workspaceControl: {
        HomeWorkspacePicker(
          workspaces: workspacePreferences.workspaces,
          selection: Binding(get: { activeWorkspaceID ?? "" }, set: { storedWorkspaceID = $0 }),
          manage: { openSidebarSheet(.workspaces) }
        )
      },
      filterControl: {
        projectFilterButton(usesCircleButton: true, circleButtonSize: headerControlSize)
      },
      moreControl: { sessionMenu(buttonSize: headerControlSize) },
      usageRail: {
        if showsUsage {
          HomeSidebarUsageRail(session: session) { lease, providerID in
            guard let selection = session.currentSettingsHostSelection,
              selection.lease == lease, selection.gate(.sessionRead) == nil
            else { return }
            if let providerID {
              openSidebarSheet(.providerUsage(SettingsUsageSidebarFocus(lease: lease, providerID: providerID)))
            } else {
              openSidebarSheet(.usage)
            }
          }
        }
      },
      threadContent: {
        threadsLoadView(
          selectedThreadID: presentedThread?.id.rawValue,
          background: .clear,
          isSplit: true
        )
      }
    )
    .background {
      if let authored = palette.sidebarPanelHex { Color(poracodeHex: authored).ignoresSafeArea() }
      else if colorScheme == .dark { palette.sidebar.ignoresSafeArea() }
    }
  }

  private func splitDetailContainer(
    layout: HomeAdaptiveLayoutPolicy,
    isSidebarDockedVisible: Bool
  ) -> some View {
    NavigationStack(path: $detailPath) {
      splitDetailRoot(layout: layout)
        .toolbar(composerExpanded && layout.isCompactHeight ? .hidden : .automatic, for: .navigationBar)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay {
          if composerExpanded {
            HomeSplitComposeOverlay(
              isCompactHeight: layout.isCompactHeight,
              dismiss: { dismissComposer() }
            ) {
              homeQuickComposer()
            }
          }
        }
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            PoracodeToolbarIconButton(title: HomeStrings.toggleSidebar, systemImage: "sidebar.left") {
              toggleHomeSidebar()
            }
            .accessibilityIdentifier("native-e2e.sidebar-toggle")
          }
          if !isSidebarDockedVisible && !isOverlaySidebarVisible {
            ToolbarItem(placement: .topBarLeading) {
              PoracodeToolbarIconButton(title: HomeStrings.newThread, systemImage: "square.and.pencil") {
                startSplitComposer()
              }
              .disabled(!session.canOperate)
              .accessibilityIdentifier("native-e2e.split-new-thread")
            }
          }
          if !isSidebarDockedVisible && selectedThread == nil {
            ToolbarItem(placement: .topBarTrailing) {
              sessionToolbarButton
            }
          }
        }
        .navigationDestination(for: ProjectRoute.self) { route in
          projectDestinationView(for: route)
        }
        .navigationDestination(for: ThreadRoute.self) { route in
          threadDestinationView(for: route)
            .onAppear { nestedThread = route }
        }
    }
    .onChange(of: detailPath.isEmpty) { _, isEmpty in
      if isEmpty { nestedThread = nil }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.background.ignoresSafeArea())
    .environment(
      \.poracodeSplitDetailContext,
      PoracodeSplitDetailContext(
        isPortrait: layout.isPortrait,
        isCompactHeight: layout.isCompactHeight
      )
    )

  }

  @ViewBuilder
  private func splitDetailRoot(layout: HomeAdaptiveLayoutPolicy) -> some View {
    if let route = selectedThread,
      let parts = route.id.decode(),
      parts.connectionId == session.selectedConnectionId
    {
      threadDestinationView(for: route)
      .id(route.id.rawValue)
      .environment(\.poracodeCloseThreadDetail) {
        if selectedThread?.id == route.id {
          selectedThread = nil
        }
      }
    } else if let route = selectedProject,
      let parts = route.id.decode(),
      parts.connectionId == session.selectedConnectionId,
      let project = session.projects.first(where: { $0.id == parts.remoteId })
    {
      ProjectThreadsView(session: session, project: project)
        .id(route.id.rawValue)
    } else {
      HomeSplitDetailEmptyView(
        canStartTask: session.canOperate,
        isCompactHeight: layout.isCompactHeight,
        workspace: workspacePreferences.workspaces.first { $0.id == activeWorkspaceID },
        projects: projectFilterOptions,
        recentThreads: threadListScope.active,
        gitSummary: gitSummary,
        agentLabel: agentLabel,
        isOnline: hostIsOnline,
        hasDraft: { item in
          session.richChatComposerDrafts.hasDraft(
            for: RichChatComposerDraftKey(
              connectionID: item.connectionID,
              threadID: item.thread.id
            )
          )
        },
        startNewTask: { startSplitComposer() },
        startTaskInProject: { option in
          startSplitComposer(initialProjectID: option.project.id, connectionID: option.connectionID)
        },
        openProject: { option in openProjectOption(option, isSplit: true) },
        openThread: { item in open(item, isSplit: true) },
        hasBackgroundActivity: workflowIsLive
      )
      .navigationBarTitleDisplayMode(.inline)
    }
  }

  @ViewBuilder
  private func sizedSheetContent(for destination: HomeSheetDestination) -> some View {
    switch destination {
    case .search, .connections, .workspaces:
      sheetContent(for: destination)
        .poracodeFormSheetSizing()
    case .threadFilters:
      sheetContent(for: destination)
    case .more, .projectManagement, .terminal, .usage, .providerUsage, .settings, .settingsDestination, .newsProjectGit, .pullRequests, .githubActions, .schedules,
      .remoteIntegrations, .browserMirror, .portForwarding:
      sheetContent(for: destination)
        .poracodePageSheetSizing()
    }
  }

  @ViewBuilder
  private func sheetContent(for destination: HomeSheetDestination) -> some View {
    switch destination {
    case .search(let commands):
      HomeThreadSearchView(
        items: unifiedThreads,
        open: { item in open(item, replacingThread: keyboardThread != nil) },
        drafts: session.richChatComposerDrafts,
        lifecycle: threadLifecycle,
        hasBackgroundActivity: workflowIsLive,
        commands: commands,
        runCommand: { command in
          commandSearch?.selection = command
          sheetDestination = nil
        },
        searchRemoteMessages: { query in
          guard let api = await session.currentBoundAPIClient() else { return [] }
          return (try? await api.searchConversations(query: query))?.entries ?? []
        }
      )
      .poracodeZoomTransition(sourceID: "home.search", in: glassNamespace)
    case .threadFilters(let showsStatus):
      HomeProjectFilterDrawer(
        session: session,
        options: threadFilterOptions(showsStatus: showsStatus),
        selectedProjectIDs: $selectedProjectIDs,
        status: $compactThreadStatus,
        doneCount: showsStatus ? threadListScope.done.count : nil
      )
    case .more:
      HomeMoreSheet(session: session, isRefreshing: $isRefreshing)
        .poracodeZoomTransition(sourceID: "home.more", in: glassNamespace)
    case .connections:
      NavigationStack {
        HostSwitcherView(session: session)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(SettingsUIStrings.done) { sheetDestination = nil }
            }
          }
      }
    case .workspaces:
      NavigationStack {
        HomeWorkspaceSettingsView(session: session)
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button(SettingsUIStrings.done) { sheetDestination = nil } } }
      }
    case .pullRequests:
      NavigationStack {
        PullRequestsPageView(session: session)
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button(SettingsUIStrings.done) { sheetDestination = nil } } }
      }
    case .githubActions:
      NavigationStack {
        GitHubActionsProjectsView(session: session)
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button(SettingsUIStrings.done) { sheetDestination = nil } } }
      }
    case .schedules:
      RemoteIntegrationsSessionView(session: session, initialRoute: .schedules)
    case .projectManagement:
      NavigationStack {
        HomeProjectsView(session: session)
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button(SettingsUIStrings.done) { sheetDestination = nil } } }
      }
    case .terminal:
      NavigationStack {
        HomeTerminalProjectsView(session: session)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(SettingsUIStrings.done) { sheetDestination = nil }
            }
          }
      }
    case .usage:
      SettingsSessionView(session: session, initialRoute: .usage)
    case .providerUsage(let focus):
      SettingsSessionView(session: session, initialRoute: .usage)
        .environment(\.settingsUsageSidebarFocus, focus)
    case .settings:
      SettingsSessionView(session: session)
    case .settingsDestination(let destination):
      SettingsSessionView(session: session, destination: destination)
    case .newsProjectGit(let option):
      NavigationStack {
        HomeProjectMenuDestinationView(session: session, destination: .gitChanges(option))
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button(SettingsUIStrings.done) { sheetDestination = nil } } }
      }
    case .remoteIntegrations:
      RemoteIntegrationsSessionView(session: session)
    case .browserMirror:
      BrowserMirrorSessionView(session: session)
    case .portForwarding(let lease):
      PortForwardingSessionView(session: session, lease: lease)
    }
  }

  @ViewBuilder
  private func projectDestinationView(for route: ProjectRoute) -> some View {
    if let parts = route.id.decode(),
      parts.connectionId == session.selectedConnectionId,
      let project = session.projects.first(where: { $0.id == parts.remoteId })
    {
      ProjectThreadsView(session: session, project: project)
    }
  }

  @ViewBuilder
  private func threadDestinationView(
    for route: ThreadRoute,
    openWorkspaceTools: (() -> Void)? = nil
  ) -> some View {
    if let parts = route.id.decode(),
      parts.connectionId == session.selectedConnectionId
    {
      RichChatThreadView(
        session: session,
        threadID: parts.remoteId,
        title: route.title,
        chatWindow: chatWindow,
        openLinkedThread: { thread in pushLinkedThread(thread, from: route) },
        returnToForkSource: { id in popToLinkedThread(id, from: route) },
        openWorkspaceTools: openWorkspaceTools
      )
      .modifier(PoracodeRetainNavigationWhilePresented(isPresented: route.linkedFrom != nil))
    }
  }

  @ViewBuilder
  private func threadsLoadView(
    selectedThreadID: String? = nil,
    background: Color,
    isSplit: Bool = false
  ) -> some View {
    Group {
      switch session.projectsLoadState {
      case .idle where unifiedThreads.isEmpty, .loading where unifiedThreads.isEmpty:
        LoadingStateView(message: HomeStrings.loadingThreads)
      case .empty where unifiedThreads.isEmpty:
        emptyThreadList(title: HomeStrings.emptyThreadsTitle, description: HomeStrings.emptyThreadsDescription,
          systemImage: "bubble.left.and.bubble.right", isSplit: isSplit)
      case .failed(let message) where unifiedThreads.isEmpty:
        ErrorStateView(message: message) {
          Task { await session.refreshUnifiedThreadList() }
        }
      default:
        threadList(
          selectedThreadID: selectedThreadID,
          background: background,
          isSplit: isSplit
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder
  private func threadList(
    selectedThreadID: String?,
    background: Color,
    isSplit: Bool
  ) -> some View {
    let scope = threadListScope
    let threads = isSplit ? scope.active : scope[compactThreadStatus]
    if threads.isEmpty && (!isSplit || scope.done.isEmpty) {
      let message = scope.emptyMessage(status: compactThreadStatus, isSplit: isSplit)
      emptyThreadList(title: message.title, description: message.detail, isSplit: isSplit)
        .background(background)
    } else {
      HomeThreadListView(
        entries: !isSplit && compactThreadStatus == .done
          ? threads.map(HomeThreadListEntry.thread) : HomeThreadListPresentation.entries(from: threads),
        completedEntries: isSplit && showsCompletedThreads ? HomeThreadListPresentation.entries(from: scope.done) : [],
        completedCount: isSplit ? scope.done.count : 0,
        isCompletedSectionExpanded: $showsCompletedThreads,
        openingThreadID: openingThreadID,
        selectedThreadID: selectedThreadID,
        selectedConnectionID: session.selectedConnectionId,
        listBackground: background,
        gitSummary: gitSummary,
        agentLabel: agentLabel,
        hostIsOnline: hostIsOnline,
        open: { open($0, isSplit: isSplit) },
        openProject: { openProject($0, isSplit: isSplit) },
        lifecycle: threadLifecycle,
        drafts: session.richChatComposerDrafts,
        hasBackgroundActivity: workflowIsLive
      ) {
        if !isSplit && !composerExpanded {
          homeQuickComposer(newsPlacement: .listFooter)
        }
      }
      .background(background)
    }
  }

  @ViewBuilder
  private func emptyThreadList(title: String, description: String?, systemImage: String = "tray", isSplit: Bool) -> some View {
    let empty = EmptyStateView(title: title, systemImage: systemImage, description: description)
    if isSplit {
      empty
    } else {
      ScrollView {
        VStack(spacing: 7) {
          empty
          if !composerExpanded { homeQuickComposer(newsPlacement: .listFooter) }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
      }
    }
  }

  private func projectFilterButton(
    usesCircleButton: Bool,
    circleButtonSize: CGFloat = 30
  ) -> some View {
    HomeProjectFilterMenu(
      title: usesCircleButton ? HomeStrings.filterProjects : HomeStrings.filterThreads,
      isFiltered: !selectedProjectIDs.isEmpty || (!usesCircleButton && compactThreadStatus == .done),
      usesCircleButton: usesCircleButton,
      circleButtonSize: circleButtonSize
    ) {
      openSidebarSheet(.threadFilters(showsStatus: !usesCircleButton), keepingSidebar: true)
    }
  }

  private func workflowIsLive(_ item: UnifiedThreadListItem) -> Bool {
    session.workflowActivity.isLive(connectionID: item.connectionID, threadID: item.thread.id)
  }

  private var projectFilterOptions: [HomeProjectFilterOption] {
    session.homeProjectOptions.filter(workspaceContext.includes)
  }

  private func threadFilterOptions(showsStatus: Bool) -> [HomeProjectFilterOption] {
    let displayed = workspaceThreads.filter { !showsStatus || $0.thread.isDone == (compactThreadStatus == .done) }
    let counts = Dictionary(grouping: displayed, by: HomeThreadListPresentation.projectIdentity).mapValues(\.count)
    return projectFilterOptions.map {
      var option = $0
      option.threadCount = counts[option.id, default: 0]
      return option
    }
  }

  private var homeActionDock: some View {
    PoracodeGlassGroup(spacing: 8) {
      HStack(alignment: .bottom, spacing: 12) {
        if !composerExpanded {
          PoracodeCircleButton {
            openSidebarSheet(.search(commands: nil))
          } label: {
            Image(systemName: "magnifyingglass")
          }
          .accessibilityLabel(HomeStrings.searchThreads)
          .poracodeGlassID("home.search", in: glassNamespace)
          .poracodeZoomSource(id: "home.search", in: glassNamespace)
        }

        homeQuickComposer(newsPlacement: composerExpanded ? .composer : .hidden)

        if !composerExpanded { sessionMenu(buttonSize: 30) }
      }
      .animation(.snappy(duration: 0.25), value: composerExpanded)
    }
  }

  private var homeComposeContext: HomeQuickComposeStore.Context {
    .init(connectionID: session.selectedConnectionId, workspaceID: activeWorkspaceID)
  }

  private func homeQuickComposer(newsPlacement: HomeQuickComposeView.NewsPlacement = .composer) -> some View {
    let context = homeComposeContext
    let draft = quickComposeStore.state(for: context, session: session,
      initialProjectID: composerInitialProjectID)
    let expansion = Binding(get: { composerExpanded }, set: { expanded in
      composerExpanded = expanded
      if !expanded, !currentLayout.isSplit, path.isEmpty {
        if let selectedProject { path.append(selectedProject) }
        if let selectedThread { path.append(selectedThread) }
      }
    })
    return HomeQuickComposeView(session: session, isExpanded: expansion,
      draft: draft, newsPlacement: newsPlacement, onNewsAction: { action in
        guard context == homeComposeContext else { return }
        let project = projectFilterOptions.first { $0.connectionID == context.connectionID && $0.project.id == draft.projectID }
        guard let destination = HomeNewsNavigation.destination(action, project: project) else { return }
        draft.promptFocused = false
        composerExpanded = false
        openSidebarSheet(destination)
      }) { threadID in
      quickComposeStore.discard(context, matching: draft)
      guard context == homeComposeContext, let connectionID = context.connectionID else { return }
      presentThread(ThreadRoute(id: CompositeRemoteID(connectionId: connectionID, remoteId: threadID),
        title: HomeStrings.newConversationTitle), isSplit: currentLayout.isSplit)
    }
  }

  private func sessionMenu(buttonSize: CGFloat) -> some View {
    PoracodeCircleButton(size: buttonSize) {
      openSidebarSheet(.more)
    } label: {
      if isRefreshing {
        ProgressView()
          .controlSize(.small)
      } else {
        Image(systemName: "ellipsis")
          .font(buttonSize < 30 ? .footnote : .body)
      }
    }
    .disabled(isRefreshing)
    .accessibilityLabel(isRefreshing ? HomeStrings.refresh : HomeStrings.sessionMenu)
    .accessibilityIdentifier("native-e2e.session-menu")
    .poracodeGlassID("home.more", in: glassNamespace)
    .poracodeZoomSource(id: "home.more", in: glassNamespace)
  }

  private var sessionToolbarButton: some View {
    PoracodeToolbarIconButton(
      title: isRefreshing ? HomeStrings.refresh : HomeStrings.sessionMenu,
      systemImage: "ellipsis",
      color: .secondary
    ) {
      openSidebarSheet(.more)
    }
    .disabled(isRefreshing)
    .accessibilityIdentifier("native-e2e.session-menu")
  }

  private func gitSummary(for item: UnifiedThreadListItem) -> GitThreadSummary? {
    if item.connectionID == session.state.selectedConnectionId {
      return session.state.replay.gitSummary(forThread: item.thread.id, thread: item.thread)
    }
    return session.sessionPool.cache(for: .host(item.connectionID)).replay
      .gitSummary(forThread: item.thread.id, thread: item.thread)
  }

  /// The agent's display label for the generic provider glyph, resolved from
  /// the same agent-status records the PWA/Android clients match by `kind`.
  private func agentLabel(for item: UnifiedThreadListItem) -> String? {
    let replay =
      item.connectionID == session.state.selectedConnectionId
      ? session.state.replay
      : session.sessionPool.cache(for: .host(item.connectionID)).replay
    return replay.agentStatuses.ordered.first { $0.kind == item.thread.agentKind }?.label
  }

  private func hostIsOnline(_ connectionID: ClientConnectionID) -> Bool {
    session.state.hostSocketStates[connectionID] == .online
      || (connectionID == session.state.selectedConnectionId && session.socketState == .online)
  }

  private func open(_ item: UnifiedThreadListItem, isSplit: Bool? = nil, replacingThread: Bool = false) {
    sheetReturnConnectionID = nil
    dismissComposer(animated: false)
    dismissOverlaySidebar()
    openDestination(openingID: item.id, connectionID: item.connectionID) {
      let route = ThreadRoute(
        id: CompositeRemoteID(connectionId: item.connectionID, remoteId: item.thread.id),
        title: item.thread.title
      )
      let keepsProjectPath = keyboardProjectID == item.project.id
      presentThread(route, isSplit: isSplit ?? currentLayout.isSplit,
        replacingThread: replacingThread, keepsProjectPath: keepsProjectPath)
    }
  }

  private func openProject(_ item: UnifiedThreadListItem, isSplit: Bool) {
    openProjectRoute(
      openingID: item.id,
      connectionID: item.connectionID,
      projectID: item.project.id,
      isSplit: isSplit
    )
  }

  private func openProjectOption(_ option: HomeProjectFilterOption, isSplit: Bool) {
    openProjectRoute(
      openingID: option.id,
      connectionID: option.connectionID,
      projectID: option.project.id,
      isSplit: isSplit
    )
  }

  private func openProjectRoute(
    openingID: String,
    connectionID: ClientConnectionID,
    projectID: String,
    isSplit: Bool
  ) {
    dismissComposer(animated: false)
    dismissOverlaySidebar()
    openDestination(openingID: openingID, connectionID: connectionID) {
      presentProject(ProjectRoute(id: CompositeRemoteID(connectionId: connectionID, remoteId: projectID)), isSplit: isSplit)
    }
  }

  private func openDestination(
    openingID: String,
    connectionID: ClientConnectionID,
    present: @escaping @MainActor () -> Void
  ) {
    let navigation = navigationSelection
    let ticket = navigation.begin(openingID)
    Task {
      guard navigation.isCurrent(ticket) else { return }
      await session.switchHost(connectionID, selectionInstalled: { installed in
        guard !Task.isCancelled, installed == connectionID, navigation.accept(ticket) else { return }
        present()
      })
      navigation.finish(ticket)
    }
  }

  private func presentThread(
    _ route: ThreadRoute, isSplit: Bool, replacingThread: Bool = false, keepsProjectPath: Bool = false
  ) {
    let previous = keyboardThread
    let keepsPath = keepsProjectPath && previous?.id.decode()?.connectionId == route.id.decode()?.connectionId
    if replacingThread, isSplit, !detailPath.isEmpty,
      keepsPath {
      var replacement = detailPath
      replacement.removeLast()
      replacement.append(route)
      detailPath = replacement
      nestedThread = route
      dismissOverlaySidebar()
      return
    }
    if isSplit || !replacingThread || !keepsPath { selectedProject = nil }
    selectedThread = route
    detailPath = NavigationPath()
    dismissOverlaySidebar()
    if isSplit {
      path = NavigationPath()
    } else {
      var replacement = path
      if replacingThread, !replacement.isEmpty {
        if keepsPath {
          replacement.removeLast()
        } else {
          replacement = NavigationPath()
        }
      }
      replacement.append(route)
      path = replacement
    }
  }

  private func pushLinkedThread(_ thread: RemoteThread, from source: ThreadRoute) -> Bool {
    guard openingThreadID == nil, presentedThread?.id == source.id,
      let parts = source.id.decode(), parts.connectionId == session.selectedConnectionId,
      parts.remoteId != thread.id
    else { return false }
    let route = ThreadRoute(
      id: CompositeRemoteID(connectionId: parts.connectionId, remoteId: thread.id),
      title: thread.title,
      linkedFrom: source.id
    )
    if currentLayout.isSplit {
      detailPath.append(route)
      nestedThread = route
    } else {
      path.append(route)
      selectedThread = route
    }
    dismissOverlaySidebar()
    return true
  }

  private func popToLinkedThread(_ id: String, from route: ThreadRoute) -> Bool {
    guard presentedThread?.id == route.id,
      let source = route.linkedFrom?.decode(), source.connectionId == session.selectedConnectionId,
      source.remoteId == id
    else { return false }
    if currentLayout.isSplit {
      guard !detailPath.isEmpty else { return false }
      detailPath.removeLast()
      nestedThread = nil
    } else {
      guard path.count > 1 else { return false }
      path.removeLast()
    }
    return true
  }

  private func presentProject(_ route: ProjectRoute, isSplit: Bool) {
    selectedThread = nil
    selectedProject = route
    detailPath = NavigationPath()
    dismissOverlaySidebar()
    if isSplit {
      path = NavigationPath()
    } else {
      path.append(route)
    }
  }

  private func synchronizeLayoutTransition(isSplit: Bool) {
    if isSplit {
      if selectedProject != nil, let selectedThread {
        self.selectedThread = nil
        nestedThread = selectedThread
        var restored = NavigationPath()
        restored.append(selectedThread)
        detailPath = restored
      }
      return
    }
    if !detailPath.isEmpty, let nestedThread { selectedThread = nestedThread }
    detailPath = NavigationPath()
    nestedThread = nil
    preferredCompactColumn = .detail
    isOverlaySidebarVisible = false
    if composerExpanded {
      // Keep the active draft in front as the detail column collapses. The
      // previous thread remains selected and returns when the composer closes.
      path = NavigationPath()
      return
    }
    var restored = NavigationPath()
    if let selectedProject { restored.append(selectedProject) }
    if let selectedThread { restored.append(selectedThread) }
    path = restored
  }

  private func consumeNotificationEvent(
    _ event: NotificationNavigationEvent?,
    isSplit: Bool
  ) {
    guard let event, event.id != lastNotificationEventId,
      event.route.clientConnectionId == session.selectedConnectionId
    else { return }
    lastNotificationEventId = event.id
    navigationSelection.invalidate()
    sheetReturnConnectionID = nil
    sheetDestination = nil
    composerExpanded = false
    preferredCompactColumn = .detail
    isOverlaySidebarVisible = false
    let route = ThreadRoute(
      id: CompositeRemoteID(
        connectionId: event.route.clientConnectionId,
        remoteId: event.route.threadId
      ),
      title: event.threadTitle
    )
    presentThread(route, isSplit: isSplit)
  }

  private func openSidebarSheet(_ destination: HomeSheetDestination, keepingSidebar: Bool = false) {
    navigationSelection.invalidate()
    sheetReturnConnectionID = selectedThread?.id.decode()?.connectionId ?? selectedProject?.id.decode()?.connectionId
    if !keepingSidebar { dismissOverlaySidebar(animated: false) }
    sheetDestination = destination
  }

  private func openCommandSearch() {
    let actions = (commandRegistry?.enabledActions ?? [:]).filter {
      $0.key != "palette.open" && !$0.key.hasPrefix("composer.")
    }
    commandSearch = NativeHomeCommandSearch(actions: actions, connection: session.selectedConnectionId,
      destination: keyboardThread?.id ?? selectedProject?.id)
    let commands = actions.keys.sorted {
      NativeShortcutStrings.commandTitle($0).localizedStandardCompare(NativeShortcutStrings.commandTitle($1)) == .orderedAscending
    }
    openSidebarSheet(.search(commands: commands))
  }

  private func finishSheet() {
    let search = commandSearch
    commandSearch = nil
    restoreSheetHost()
    guard let search, let command = search.selection, sheetDestination == nil,
      search.connection == session.selectedConnectionId,
      search.destination == (keyboardThread?.id ?? selectedProject?.id), !isRestoringSheetHost else { return }
    search.actions[command]?.perform(nil)
  }

  /// Secondary pages may inspect another connection. Closing them returns to
  /// the conversation's owner without discarding its saved selection or draft.
  private func restoreSheetHost() {
    guard let origin = sheetReturnConnectionID else { return }
    sheetReturnConnectionID = nil
    guard session.hosts.contains(where: { $0.connectionId == origin }) else {
      selectedThread = nil
      selectedProject = nil
      return
    }
    guard session.selectedConnectionId != origin else { return }
    isRestoringSheetHost = true
    Task {
      await session.switchHost(origin)
      isRestoringSheetHost = false
    }
  }

  private func dismissOverlaySidebar(animated: Bool = true) {
    preferredCompactColumn = .detail
    guard isOverlaySidebarVisible else { return }
    if animated {
      withAnimation(.snappy(duration: 0.24)) { isOverlaySidebarVisible = false }
    } else {
      isOverlaySidebarVisible = false
    }
  }

  private func startSplitComposer(
    initialProjectID: String? = nil,
    connectionID: ClientConnectionID? = nil
  ) {
    let savedProjectID = quickComposeStore.existing(homeComposeContext)?.projectID
    let savedProject = projectFilterOptions.first { $0.connectionID == session.selectedConnectionId && $0.project.id == savedProjectID }
    let preferred = initialProjectID == nil ? savedProject ?? projectFilterOptions.first(where: {
      $0.project.id != RemoteProject.homeScopeID && $0.connectionID == session.selectedConnectionId
    }) ?? projectFilterOptions.first(where: { $0.project.id != RemoteProject.homeScopeID }) : nil
    let targetProjectID = initialProjectID ?? preferred?.project.id
    let targetConnectionID = connectionID ?? preferred?.connectionID
    let navigation = navigationSelection
    let ticket = navigation.begin("composer")
    dismissOverlaySidebar(animated: false)
    if let connectionID = targetConnectionID,
      session.selectedConnectionId != connectionID || session.state.pendingHostSelection != nil {
      Task {
        guard navigation.isCurrent(ticket) else { return }
        await session.switchHost(connectionID)
        guard navigation.isCurrent(ticket), session.selectedConnectionId == connectionID,
          session.canOperate else { navigation.finish(ticket); return }
        _ = navigation.accept(ticket)
        presentSplitComposer(projectID: targetProjectID)
      }
      return
    }
    guard session.canOperate else { navigation.finish(ticket); return }
    _ = navigation.accept(ticket)
    presentSplitComposer(projectID: targetProjectID)
  }

  private func presentSplitComposer(projectID: String?) {
    composerInitialProjectID = projectID
    if let projectID { quickComposeStore.state(for: homeComposeContext, session: session).projectID = projectID }
    withAnimation(.snappy(duration: 0.25)) {
      composerExpanded = true
    }
  }

  private func dismissComposer(animated: Bool = true) {
    composerInitialProjectID = nil
    if animated {
      withAnimation(.snappy(duration: 0.2)) {
        composerExpanded = false
      }
    } else {
      composerExpanded = false
    }
  }

  private var keyboardProjectID: String? {
    if let parts = keyboardThread?.id.decode(), parts.connectionId == session.selectedConnectionId {
      return session.richChatThread(id: parts.remoteId)?.projectId
    }
    if let parts = selectedProject?.id.decode(), parts.connectionId == session.selectedConnectionId { return parts.remoteId }
    return nil
  }

  private var keyboardThread: ThreadRoute? {
    composerExpanded ? nil : presentedThread
  }

  private var presentedThread: ThreadRoute? {
    currentLayout.isSplit && !detailPath.isEmpty ? nestedThread ?? selectedThread : selectedThread
  }

  private var selectedThreadCompletion: HomeThreadCompletion? {
    guard let id = keyboardThread?.id, let parts = id.decode(),
      parts.connectionId == session.selectedConnectionId,
      let thread = session.richChatThread(id: parts.remoteId)
    else { return nil }
    return HomeThreadCompletion(id: id, isDone: thread.isDone)
  }

  private func dismissCompletedThread(_ id: CompositeRemoteID) {
    guard keyboardThread?.id == id, navigationSelection.openingID == nil,
      chatWindow.retire(id, presentedBy: session.activeRichChatSuite)
    else { return }
    if currentLayout.isSplit && !detailPath.isEmpty {
      detailPath.removeLast()
      nestedThread = nil
    } else {
      selectedThread = nil
      if !currentLayout.isSplit && !path.isEmpty { path.removeLast() }
    }
  }

  private var keyboardCommands: NativeHomeCommands {
    let current = keyboardThread?.id.rawValue
    let items = current == nil ? [] : visibleThreads
    let visible = Set(items.map(\.id))
    let order = current.map {
      HomeThreadListPresentation.keyboardOrder(from: items, currentID: $0, groupsDone: currentLayout.isSplit)
    } ?? []
    return NativeHomeCommands(
      identity: current ?? selectedProject?.id.rawValue ?? "home",
      navigation: .init(visible: visible, adjacent: order),
      allowsActions: sheetDestination == nil, hasProject: !projectFilterOptions.isEmpty,
      hasThread: current != nil, draftView: composerExpanded,
      canStartThread: session.canOperate && !composerExpanded,
      canOpenBrowser: session.currentBrowserMirrorAccess != nil,
      canStepThread: order.count > 1,
      canStepWorkspaceThread: current.map { visible.contains($0) && visible.count > 1 } ?? false,
      canCycleRecentThreads: current.map { navigationSelection.hasRecentThread(otherThan: $0, visible: visible) } ?? false,
      openSettings: { openSidebarSheet(.settings) }, toggleSidebar: toggleHomeSidebar,
      newThread: { startSplitComposer(initialProjectID: keyboardProjectID) },
      openSearch: openCommandSearch,
      openBrowser: { openSidebarSheet(.browserMirror) },
      stepThread: { direction in
        guard let current else { return }
        openKeyboardThread(direction.target(in: order, from: current), replacing: current)
      },
      stepWorkspaceThread: { direction in
        guard let current else { return }
        let workspaceOrder = HomeThreadListPresentation.keyboardOrder(
          from: visibleThreads, currentID: current, groupsDone: currentLayout.isSplit, workspaceWide: true
        )
        openKeyboardThread(direction.target(in: workspaceOrder, from: current), replacing: current)
      },
      cycleRecentThread: { direction in
        guard let current, keyboardThread?.id.rawValue == current else { return }
        let target = navigationSelection.cycleRecentThread(from: current, visible: visible, direction: direction)
        openKeyboardThread(target, replacing: current)
      }
    )
  }

  private func openKeyboardThread(_ target: String?, replacing current: String) {
    guard let target, keyboardThread?.id.rawValue == current,
      let item = visibleThreads.first(where: { $0.id == target }) else { return }
    open(item, replacingThread: true)
  }

  private func toggleHomeSidebar() {
    if !currentLayout.isSplit { path = NavigationPath(); return }
    if horizontalSizeClass == .compact {
      preferredCompactColumn = preferredCompactColumn == .detail ? .sidebar : .detail
    } else if currentLayout.usesOverlaySidebar { isOverlaySidebarVisible.toggle() }
    else { isDockedSidebarVisible.toggle() }
  }
}

struct ProjectRoute: Hashable {
  var id: CompositeRemoteID
}

struct ThreadRoute: Hashable {
  var id: CompositeRemoteID
  var title: String
  var linkedFrom: CompositeRemoteID? = nil
}
