import SwiftUI

struct HomeView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @Bindable var session: AppSession
  @State private var path = NavigationPath()
  @Bindable private var notificationNavigation = NotificationNavigationCenter.shared
  @Bindable private var routes = NotificationRouteController.shared
  @State private var lastNotificationEventId: UInt64?
  @State private var sheetDestination: HomeSheetDestination?
  @State private var openingThreadID: String?
  @State private var searchText = ""
  @State private var searchPresented = false
  @FocusState private var searchFocused: Bool
  @State private var selectedProjectIDs = Set<String>()
  @State private var composerExpanded = false
  @State private var isRefreshing = false

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
      session.projectSyncPreferences.isSynced(
        connectionID: $0.connectionID,
        projectID: $0.project.id
      )
    }
  }

  private var visibleThreads: [UnifiedThreadListItem] {
    HomeThreadListPresentation.filter(
      unifiedThreads,
      searchText: searchText,
      projectIDs: selectedProjectIDs
    )
  }

  private var threadEntries: [HomeThreadListEntry] {
    HomeThreadListPresentation.entries(from: visibleThreads)
  }

  var body: some View {
    NavigationStack(path: $path) {
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
          threadList
        }
      }
      .navigationTitle(HomeStrings.fallbackTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          BrandWordmark(textStyle: .headline)
        }
        ToolbarItem(placement: .topBarTrailing) {
          HomeProjectFilterMenu(
            session: session,
            options: projectFilterOptions,
            selectedProjectIDs: $selectedProjectIDs
          )
        }
      }
      .navigationDestination(for: ProjectRoute.self) { route in
        if let parts = route.id.decode(),
          parts.connectionId == session.selectedConnectionId,
          let project = session.projects.first(where: { $0.id == parts.remoteId })
        {
          ProjectThreadsView(session: session, project: project)
        }
      }
      .navigationDestination(for: ThreadRoute.self) { route in
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
      .refreshable {
        await session.refreshUnifiedThreadList()
      }
    }
    .onChange(of: session.selectedConnectionId) {
      path = NavigationPath()
    }
    .onChange(of: searchPresented) { _, presented in
      searchFocused = presented
    }
    .onChange(of: notificationNavigation.event) { _, event in
      consumeNotificationEvent(event)
    }
    .onAppear {
      consumeNotificationEvent(notificationNavigation.event)
    }
    .task {
      await session.refreshUnifiedThreadList()
    }
    .sheet(item: $sheetDestination) { destination in
      switch destination {
      case .more:
        HomeMoreSheet(session: session, isRefreshing: $isRefreshing)
      case .projectManagement:
        ProjectManagementView(session: session)
      case .settings:
        SettingsSessionView(session: session)
      case .remoteIntegrations:
        RemoteIntegrationsSessionView(session: session)
      case .browserMirror:
        BrowserMirrorSessionView(session: session)
      case .portForwarding(let lease):
        PortForwardingSessionView(session: session, lease: lease)
      }
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
    .overlay {
      if composerExpanded {
        Color.black.opacity(0.28)
          .ignoresSafeArea()
          .contentShape(Rectangle())
          .onTapGesture { dismissComposer() }
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      homeActionDock
        .frame(maxWidth: 560)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .zIndex(20)
    }
  }

  private func consumeNotificationEvent(_ event: NotificationNavigationEvent?) {
    guard let event, event.id != lastNotificationEventId,
      event.route.clientConnectionId == session.selectedConnectionId
    else { return }
    lastNotificationEventId = event.id
    path = NavigationPath()
    path.append(
      ThreadRoute(
        id: CompositeRemoteID(
          connectionId: event.route.clientConnectionId,
          remoteId: event.route.threadId
        ),
        title: event.threadTitle
      )
    )
  }

  private var threadList: some View {
    VStack(spacing: 0) {
      if searchPresented {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .foregroundStyle(.secondary)
          TextField(HomeStrings.searchThreads, text: $searchText)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .focused($searchFocused)
          Button {
            searchText = ""
            searchPresented = false
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(.secondary)
          }
          .accessibilityLabel(HomeStrings.cancel)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 46)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .transition(.move(edge: .top).combined(with: .opacity))
      }
      if visibleThreads.isEmpty && !searchText.isEmpty {
        ContentUnavailableView.search(text: searchText)
          .frame(maxHeight: .infinity)
      } else {
        HomeThreadListView(
          entries: threadEntries,
          openingThreadID: openingThreadID,
          gitSummary: gitSummary,
          hostIsOnline: hostIsOnline,
          open: open
        )
      }
    }
    .background(theme.variant(for: colorScheme).background)
  }

  private var projectFilterOptions: [HomeProjectFilterOption] {
    Dictionary(
      grouping: unifiedThreads, by: HomeThreadListPresentation.projectIdentity
    )
    .compactMap { key, values -> HomeProjectFilterOption? in
      guard let item = values.first else { return nil }
      return HomeProjectFilterOption(
        id: key,
        connectionID: item.connectionID,
        project: item.project,
        host: HomeDeviceName.display(item.hostName),
        online: hostIsOnline(item.connectionID),
        threadCount: values.count
      )
    }
    .sorted { lhs, rhs in
      lhs.project.name.localizedCaseInsensitiveCompare(rhs.project.name) == .orderedAscending
    }
  }

  private var homeActionDock: some View {
    HStack(alignment: .bottom, spacing: 12) {
      if !composerExpanded {
        PoracodeCircleButton {
          withAnimation(.snappy(duration: 0.2)) {
            searchPresented.toggle()
            if !searchPresented { searchText = "" }
          }
        } label: {
          Image(systemName: "magnifyingglass")
        }
        .accessibilityLabel(HomeStrings.searchThreads)
      }

      HomeQuickComposeView(session: session, isExpanded: $composerExpanded) { threadID in
        guard let connectionID = session.selectedConnectionId else { return }
        path.append(
          ThreadRoute(
            id: CompositeRemoteID(connectionId: connectionID, remoteId: threadID),
            title: HomeStrings.newConversationTitle
          )
        )
      }

      if !composerExpanded { sessionMenu }
    }
    .animation(.snappy(duration: 0.25), value: composerExpanded)
  }

  private var sessionMenu: some View {
    PoracodeCircleButton {
      sheetDestination = .more
    } label: {
      if isRefreshing {
        ProgressView()
          .controlSize(.small)
      } else {
        Image(systemName: "ellipsis")
      }
    }
    .disabled(isRefreshing)
    .accessibilityLabel(isRefreshing ? HomeStrings.refresh : HomeStrings.sessionMenu)
    .accessibilityIdentifier("native-e2e.session-menu")
  }

  private func gitSummary(for item: UnifiedThreadListItem) -> GitThreadSummary? {
    if item.connectionID == session.state.selectedConnectionId {
      return session.state.replay.summary(forThread: item.thread.id)
    }
    return session.sessionPool.cache(for: .host(item.connectionID)).replay
      .summary(forThread: item.thread.id)
  }

  private func hostIsOnline(_ connectionID: ClientConnectionID) -> Bool {
    connectionID == session.state.selectedConnectionId && session.socketState == .online
  }

  private func open(_ item: UnifiedThreadListItem) {
    guard openingThreadID == nil else { return }
    openingThreadID = item.id
    Task {
      if session.selectedConnectionId != item.connectionID {
        await session.switchHost(item.connectionID)
      }
      defer { openingThreadID = nil }
      guard session.selectedConnectionId == item.connectionID else { return }
      path.append(
        ThreadRoute(
          id: CompositeRemoteID(
            connectionId: item.connectionID,
            remoteId: item.thread.id
          ),
          title: item.thread.title
        )
      )
    }
  }

  private func dismissComposer() {
    withAnimation(.snappy(duration: 0.2)) {
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
