import SwiftUI

struct HomeView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.poracodeTheme) private var theme
  @Bindable var session: AppSession
  @State private var path = NavigationPath()
  @State private var detailPath = NavigationPath()
  @State private var selectedThread: ThreadRoute?
  @State private var selectedProject: ProjectRoute?
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
  @State private var openingThreadID: String?
  @State private var selectedProjectIDs = Set<String>()
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

  private var visibleThreads: [UnifiedThreadListItem] {
    HomeThreadListPresentation.filter(
      unifiedThreads.filter { workspacePreferences.includes($0, activeID: activeWorkspaceID) },
      searchText: "",
      projectIDs: selectedProjectIDs
    )
  }

  private var threadEntries: [HomeThreadListEntry] {
    HomeThreadListPresentation.entries(from: visibleThreads)
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
        retainingMode: session.sideChats.entries.values.contains { $0.isPresented && $0.voice.request != nil }
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
            selectedThread = nil
            selectedProject = nil
          }
        }
        .onChange(of: notificationNavigation.event) { _, event in
          consumeNotificationEvent(event, isSplit: layout.isSplit)
        }
        .onChange(of: session.selectedConnectionId) { _, connectionID in
          if sheetDestination != nil || isRestoringSheetHost { return }
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
    .sheet(item: $sheetDestination, onDismiss: restoreSheetHost) { destination in
      sizedSheetContent(for: destination)
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
        .padding(.horizontal, 12)
        .safeAreaPadding(.top, 8)
        .transition(.move(edge: .top).combined(with: .opacity))
        .zIndex(100)
      }
    }
    .animation(.snappy(duration: 0.25), value: remoteNotifications.banner?.id)
    .environment(\.homeWorkspace, workspaceContext)
    .modifier(WorkflowViewerPresentationHost())
    .modifier(ComposerVoiceHost(session: session))
    .environment(\.homeWorkspaceSelection, $storedWorkspaceID)
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
          }
        }
        .navigationDestination(for: ThreadRoute.self) { route in
          if !currentLayout.isSplit {
            threadDestinationView(for: route)
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
    let dockedVisible = layout.usesDockedSidebar && isDockedSidebarVisible
      && (horizontalSizeClass != .compact || preferredCompactColumn == .sidebar)
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
      splitSidebar(layout: layout)
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

  private func splitSidebar(layout: HomeAdaptiveLayoutPolicy) -> some View {
    let headerControlSize: CGFloat = layout.isCompactHeight ? 24 : 28
    return HomeSplitSidebarView(
      glassNamespace: glassNamespace,
      isCompactHeight: layout.isCompactHeight,
      isSearchDisabled: unifiedThreads.isEmpty,
      canStartThread: session.canOperate,
      isProjectsAvailable: !projectFilterOptions.isEmpty,
      openSearch: { openSidebarSheet(.search) },
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
      threadContent: {
        threadsLoadView(
          selectedThreadID: selectedThread?.id.rawValue,
          background: .clear,
          isSplit: true
        )
      }
    )
    .background {
      if colorScheme == .dark { palette.sidebar.ignoresSafeArea() }
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
              if horizontalSizeClass == .compact {
                preferredCompactColumn = preferredCompactColumn == .detail ? .sidebar : .detail
              } else if layout.usesOverlaySidebar { isOverlaySidebarVisible.toggle() }
              else { isDockedSidebarVisible.toggle() }
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
        }
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
      RichChatThreadView(
        session: session,
        threadID: parts.remoteId,
        title: route.title
      )
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
        recentThreads: visibleThreads,
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
    case .more, .projectManagement, .terminal, .usage, .settings, .settingsDestination, .pullRequests, .githubActions, .schedules,
      .remoteIntegrations, .browserMirror, .portForwarding:
      sheetContent(for: destination)
        .poracodePageSheetSizing()
    }
  }

  @ViewBuilder
  private func sheetContent(for destination: HomeSheetDestination) -> some View {
    switch destination {
    case .search:
      HomeThreadSearchView(
        items: unifiedThreads,
        open: { item in open(item) },
        drafts: session.richChatComposerDrafts,
        lifecycle: threadLifecycle,
        hasBackgroundActivity: workflowIsLive
      )
      .poracodeZoomTransition(sourceID: "home.search", in: glassNamespace)
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
    case .settings:
      SettingsSessionView(session: session)
    case .settingsDestination(let destination):
      SettingsSessionView(session: session, destination: destination)
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
  private func threadDestinationView(for route: ThreadRoute) -> some View {
    if let parts = route.id.decode(),
      parts.connectionId == session.selectedConnectionId
    {
      RichChatThreadView(
        session: session,
        threadID: parts.remoteId,
        title: route.title
      )
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
        EmptyStateView(
          title: HomeStrings.emptyThreadsTitle,
          systemImage: "bubble.left.and.bubble.right",
          description: HomeStrings.emptyThreadsDescription
        )
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

  private func threadList(
    selectedThreadID: String?,
    background: Color,
    isSplit: Bool
  ) -> some View {
    HomeThreadListView(
      entries: threadEntries,
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
    )
    .background(background)
  }

  private func projectFilterButton(
    usesCircleButton: Bool,
    circleButtonSize: CGFloat = 30
  ) -> some View {
    HomeProjectFilterMenu(
      session: session,
      options: projectFilterOptions,
      selectedProjectIDs: $selectedProjectIDs,
      usesCircleButton: usesCircleButton,
      circleButtonSize: circleButtonSize
    )
  }

  private func workflowIsLive(_ item: UnifiedThreadListItem) -> Bool {
    session.workflowActivity.isLive(connectionID: item.connectionID, threadID: item.thread.id)
  }

  private var projectFilterOptions: [HomeProjectFilterOption] {
    session.homeProjectOptions.filter(workspaceContext.includes)
  }

  private var homeActionDock: some View {
    PoracodeGlassGroup(spacing: 8) {
      HStack(alignment: .bottom, spacing: 12) {
        if !composerExpanded {
          PoracodeCircleButton {
            sheetDestination = .search
          } label: {
            Image(systemName: "magnifyingglass")
          }
          .accessibilityLabel(HomeStrings.searchThreads)
          .poracodeGlassID("home.search", in: glassNamespace)
          .poracodeZoomSource(id: "home.search", in: glassNamespace)
        }

        homeQuickComposer()

        if !composerExpanded { sessionMenu(buttonSize: 30) }
      }
      .animation(.snappy(duration: 0.25), value: composerExpanded)
    }
  }

  private var homeComposeContext: HomeQuickComposeStore.Context {
    .init(connectionID: session.selectedConnectionId, workspaceID: activeWorkspaceID)
  }

  private func homeQuickComposer() -> some View {
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
      draft: draft) { threadID in
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

  private func open(_ item: UnifiedThreadListItem, isSplit: Bool? = nil) {
    guard openingThreadID == nil else { return }
    sheetReturnConnectionID = nil
    dismissComposer(animated: false)
    dismissOverlaySidebar()
    openingThreadID = item.id
    Task {
      if session.selectedConnectionId != item.connectionID {
        await session.switchHost(item.connectionID)
      }
      defer { openingThreadID = nil }
      guard session.selectedConnectionId == item.connectionID else { return }
      let route = ThreadRoute(
        id: CompositeRemoteID(
          connectionId: item.connectionID,
          remoteId: item.thread.id
        ),
        title: item.thread.title
      )
      presentThread(route, isSplit: isSplit ?? currentLayout.isSplit)
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
    guard openingThreadID == nil else { return }
    dismissComposer(animated: false)
    dismissOverlaySidebar()
    openingThreadID = openingID
    Task {
      if session.selectedConnectionId != connectionID {
        await session.switchHost(connectionID)
      }
      defer { openingThreadID = nil }
      guard session.selectedConnectionId == connectionID else { return }
      let route = ProjectRoute(
        id: CompositeRemoteID(
          connectionId: connectionID,
          remoteId: projectID
        )
      )
      presentProject(route, isSplit: isSplit)
    }
  }

  private func presentThread(_ route: ThreadRoute, isSplit: Bool) {
    selectedProject = nil
    selectedThread = route
    detailPath = NavigationPath()
    dismissOverlaySidebar()
    if isSplit {
      path = NavigationPath()
    } else {
      path.append(route)
    }
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
      return
    }
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

  private func openSidebarSheet(_ destination: HomeSheetDestination) {
    sheetReturnConnectionID = selectedThread?.id.decode()?.connectionId ?? selectedProject?.id.decode()?.connectionId
    dismissOverlaySidebar(animated: false)
    sheetDestination = destination
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
    dismissOverlaySidebar(animated: false)
    if let connectionID = targetConnectionID, session.selectedConnectionId != connectionID {
      Task {
        await session.switchHost(connectionID)
        guard session.selectedConnectionId == connectionID, session.canOperate else { return }
        composerInitialProjectID = targetProjectID
        if let targetProjectID { quickComposeStore.state(for: homeComposeContext, session: session).projectID = targetProjectID }
        withAnimation(.snappy(duration: 0.25)) {
          composerExpanded = true
        }
      }
      return
    }
    guard session.canOperate else { return }
    composerInitialProjectID = targetProjectID
    if let targetProjectID { quickComposeStore.state(for: homeComposeContext, session: session).projectID = targetProjectID }
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
}

struct ProjectRoute: Hashable {
  var id: CompositeRemoteID
}

struct ThreadRoute: Hashable {
  var id: CompositeRemoteID
  var title: String
}
