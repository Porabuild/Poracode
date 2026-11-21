import SwiftUI

extension RichChatThreadView {
  var isInspectorCurrentlyOpen: Bool {
    inspectorCapability.supportsInspector && (isInspectorVisible ?? inspectorCapability.defaultOpen)
  }

  func toggleInspector() {
    withAnimation(.snappy(duration: 0.22)) {
      isInspectorVisible = !(isInspectorVisible ?? inspectorCapability.defaultOpen)
      if rightPanelTab == .sideChat { retainedSideChat?.isPresented = isInspectorVisible == true }
    }
  }
}

enum RichChatRightPanelTab: String, CaseIterable, Identifiable, Hashable {
  case info
  case files
  case git
  case terminal
  case browser
  case notes
  case ports
  case sideChat

  var id: String { rawValue }

  var title: String {
    switch self {
    case .info: HomeStrings.threadInfo
    case .files: ProjectWorkspaceStrings.files
    case .git: ProjectWorkspaceStrings.git
    case .terminal: TerminalStrings.title
    case .browser: BrowserMirrorStrings.title
    case .notes: ProjectManagementStrings.notes
    case .ports: PortForwardingStrings.title
    case .sideChat: SideChatStrings.title
    }
  }

  var systemImage: String {
    switch self {
    case .info: "info.circle"
    case .files: "folder"
    case .git: "arrow.triangle.branch"
    case .terminal: "terminal"
    case .browser: "globe"
    case .notes: "note.text"
    case .ports: "network"
    case .sideChat: "bubble.left.and.bubble.right"
    }
  }
}

enum RichChatPanelTabLayout {
  static func split(
    _ tabs: [RichChatRightPanelTab], width: CGFloat, reservesExpand: Bool
  ) -> (inline: [RichChatRightPanelTab], overflow: [RichChatRightPanelTab]) {
    let reservedExpand: CGFloat = reservesExpand ? 52 : 0
    let usableWidth = max(100, width - 24 - 12 - reservedExpand)
    let slotWidth: CGFloat = 44
    let slotSpacing: CGFloat = 2
    let capacity = max(2, Int(floor((usableWidth + slotSpacing) / (slotWidth + slotSpacing))))
    guard tabs.count > capacity else { return (tabs, []) }
    let inlineCapacity = max(2, Int(floor((usableWidth - slotWidth) / (slotWidth + slotSpacing))))
    return (Array(tabs.prefix(inlineCapacity)), Array(tabs.dropFirst(inlineCapacity)))
  }
}

/// Connects the thread's live state to the reusable inspector shell.
struct RichChatThreadInspector: View {
  let session: AppSession
  let pageState: RichChatThreadPageState
  let threadID: String
  @Binding var activeTab: RichChatRightPanelTab
  @Binding var actionDestination: ThreadDetailDestination?
  var sideChatEntry: SideChatEntry?
  var openSideChat: (() -> Void)?
  var hideSideChat: @MainActor @Sendable () -> Void = {}
  var newSideChat: () -> Void = {}

  var body: some View {
    RichChatRightPanelView(
      session: session,
      thread: pageState.thread,
      project: pageState.project,
      workspaceLocation: pageState.projectLocation,
      activationID: pageState.activationID,
      activeTab: $activeTab,
      openDestination: { actionDestination = $0 },
      sideChatEntry: sideChatEntry, openSideChat: openSideChat,
      hideSideChat: hideSideChat, newSideChat: newSideChat
    ) {
      RichChatControlPanel(
        suite: pageState.suite, thread: pageState.thread, project: pageState.project,
        projectLocation: pageState.projectLocation,
        gitSummary: session.gitSummary(forThread: threadID),
        agentStatus: pageState.agentStatus, config: pageState.config,
        canOperate: pageState.canOperate, canResolveRequests: pageState.canResolveRequests,
        refreshAuthentication: { await session.refreshSnapshot() },
        providerUsage: pageState.providerUsagePresentation,
        providerUsageState: pageState.providerUsageController.usageState,
        refreshProviderUsage: pageState.refreshProviderUsage,
        galleryImages: pageState.galleryImages, galleryVideos: pageState.galleryVideos,
        galleryIdentity: pageState.activationID,
        crewStatuses: session.state.replay.agentStatuses.ordered,
        savedCrews: pageState.inspectorSavedCrews,
        openCrew: pageState.canConfigureComposer && pageState.canOperate ? { pageState.openCrewRoster() } : nil
      )
    }
  }
}

/// Switchable inspector column for wide / iPad landscape viewports,
/// bringing desktop panel switching (Thread info, Files, Git, Terminal, Browser,
/// Notes, Ports) directly beside the conversation.
struct RichChatRightPanelView<InfoContent: View>: View {
  @Bindable var session: AppSession
  let thread: RemoteThread?
  let project: RemoteProject?
  let workspaceLocation: ProjectLocation?
  let activationID: String
  @Binding var activeTab: RichChatRightPanelTab
  let openDestination: (ThreadDetailDestination) -> Void
  var sideChatEntry: SideChatEntry?
  var openSideChat: (() -> Void)?
  var hideSideChat: @MainActor @Sendable () -> Void = {}
  var newSideChat: () -> Void = {}
  @ViewBuilder let infoContent: () -> InfoContent

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.richChatInspectorVisible) private var isVisible
  @Environment(\.richChatInspectorWidth) private var panelWidth
  @Namespace private var tabSelectionNamespace

  @State private var hasVisitedWorkspace = false
  @State private var workspaceMode: ProjectWorkspaceMode = .files
  @State private var expandedSheet: ExpandedSheet?

  private enum ExpandedSheet: Identifiable {
    case browser
    case ports(PortForwardingHostLease)

    var id: String {
      switch self {
      case .browser: "browser"
      case .ports(let lease): "ports:\(lease.connectionID.rawValue)"
      }
    }
  }

  private var hasProjectWorkspace: Bool {
    project != nil && workspaceLocation != nil && session.selectedConnectionId != nil
  }

  private var availableTabs: [RichChatRightPanelTab] {
    var tabs: [RichChatRightPanelTab] = [.info]
    if hasProjectWorkspace {
      tabs.append(contentsOf: [.files, .git, .terminal])
    }
    if session.currentBrowserMirrorAccess != nil {
      tabs.append(.browser)
    }
    if project != nil {
      tabs.append(.notes)
    }
    if session.currentPortForwardingAccess?.lease != nil {
      tabs.append(.ports)
    }
    if openSideChat != nil || sideChatEntry != nil { tabs.append(.sideChat) }
    return tabs
  }

  private var tabSplit: (inline: [RichChatRightPanelTab], overflow: [RichChatRightPanelTab]) {
    RichChatPanelTabLayout.split(
      availableTabs, width: panelWidth, reservesExpand: expandAction(for: activeTab) != nil
    )
  }

  private var isWorkspaceTabActive: Bool {
    activeTab == .files || activeTab == .git
  }

  var body: some View {
    panelBody
      .environment(\.poracodeEmbeddedInInspector, true)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .poracodeFloatingBottomBar(clearance: 62) {
        switcherBar
      }
      .onChange(of: activationID) { _, _ in
        hasVisitedWorkspace = false
        activeTab = .info
        workspaceMode = .files
        expandedSheet = nil
      }
      .onChange(of: activeTab, initial: true) { _, tab in
        switch tab {
        case .files:
          workspaceMode = .files
          hasVisitedWorkspace = true
        case .git:
          workspaceMode = .git
          hasVisitedWorkspace = true
        default:
          break
        }
      }
      .onChange(of: workspaceMode) { _, mode in
        guard isWorkspaceTabActive else { return }
        let target: RichChatRightPanelTab = mode == .git ? .git : .files
        if activeTab != target {
          activeTab = target
        }
      }
      .onChange(of: availableTabs) { _, tabs in
        if !tabs.contains(activeTab) {
          activeTab = .info
        }
      }
      .sheet(item: $expandedSheet) { target in
        switch target {
        case .browser:
          BrowserMirrorSessionView(session: session)
            .poracodePageSheetSizing()
            .nativeCommands(identity: "expanded-browser", blocksParentActions: true)
        case .ports(let lease):
          PortForwardingSessionView(session: session, lease: lease)
            .poracodePageSheetSizing()
        }
      }
  }

  private var switcherBar: some View {
    let split = tabSplit
    let overflowIsSelected = split.overflow.contains(activeTab)
    return PoracodeGlassGroup(spacing: 8) {
      HStack(spacing: 8) {
        PoracodePanelControlStrip {
          ForEach(split.inline) { tab in
            tabButton(tab)
          }
          if !split.overflow.isEmpty {
            overflowMenu(tabs: split.overflow, isSelected: overflowIsSelected)
          }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(HomeStrings.inspectorPanels)

        if let expand = expandAction(for: activeTab) {
          PoracodeCircleButton(size: 30, action: expand) {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
              .font(.caption.weight(.semibold))
          }
          .accessibilityLabel(HomeStrings.expandPanel)
          .accessibilityIdentifier("native-e2e.inspector.expand")
        }
      }
    }
    .padding(.horizontal, 12)
    .frame(width: panelWidth)
    .padding(.top, 4)
    .padding(.bottom, 8)
  }

  @ViewBuilder
  private func tabButton(_ tab: RichChatRightPanelTab) -> some View {
    let isSelected = activeTab == tab
    Button {
      selectTab(tab)
    } label: {
      Image(systemName: tab.systemImage)
        .font(.subheadline.weight(isSelected ? .semibold : .regular))
        .foregroundStyle(isSelected ? Color.primary : Color.poracodeSecondaryLabel)
        .frame(minWidth: 44, maxWidth: .infinity, minHeight: 44)
        .background {
          if isSelected {
            Capsule()
              .fill(Color.primary.opacity(colorScheme == .dark ? 0.16 : 0.10))
              .matchedGeometryEffect(
                id: "rich-chat-right-panel-tab-selection",
                in: tabSelectionNamespace
              )
          }
        }
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tab.title)
    .accessibilityIdentifier("native-e2e.inspector.tab.\(tab.rawValue)")
    .accessibilityAddTraits(isSelected ? .isSelected : AccessibilityTraits())
  }

  private func overflowMenu(tabs: [RichChatRightPanelTab], isSelected: Bool) -> some View {
    Menu {
      ForEach(tabs) { tab in
        Button {
          selectTab(tab)
        } label: {
          if activeTab == tab {
            Label(tab.title, systemImage: "checkmark")
          } else {
            Label(tab.title, systemImage: tab.systemImage)
          }
        }
      }
    } label: {
      Image(systemName: isSelected ? activeTab.systemImage : "ellipsis")
        .font(.subheadline.weight(isSelected ? .semibold : .regular))
        .foregroundStyle(isSelected ? Color.primary : Color.poracodeSecondaryLabel)
        .frame(minWidth: 44, maxWidth: .infinity, minHeight: 44)
        .background {
          if isSelected {
            Capsule()
              .fill(Color.primary.opacity(colorScheme == .dark ? 0.16 : 0.10))
              .matchedGeometryEffect(
                id: "rich-chat-right-panel-tab-selection",
                in: tabSelectionNamespace
              )
          }
        }
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.more)
    .accessibilityValue(isSelected ? activeTab.title : "")
    .accessibilityAddTraits(isSelected ? .isSelected : AccessibilityTraits())
    .accessibilityIdentifier("native-e2e.inspector.tab.more")
  }

  @ViewBuilder
  private var panelBody: some View {
    ZStack {
      if hasVisitedWorkspace,
        let project,
        let connectionID = session.selectedConnectionId
      {
        ProjectWorkspaceSessionView(
          session: session,
          identity: project.identity(on: connectionID),
          location: project.location,
          workspaceLocation: workspaceLocation ?? project.location,
          originThreadID: thread?.id,
          entryPoint: .workspace(workspaceMode),
          showsModePicker: false,
          externalMode: $workspaceMode
        )
        .environment(\.horizontalSizeClass, .compact)
        .environment(\.richChatInspectorVisible, isVisible && isWorkspaceTabActive)
        .opacity(isWorkspaceTabActive ? 1 : 0)
        .allowsHitTesting(isWorkspaceTabActive)
        .accessibilityHidden(!isWorkspaceTabActive)
      }

      switch activeTab {
      case .info:
        ScrollView {
          infoContent()
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
      case .sideChat:
        if let sideChatEntry, isVisible {
          SideChatContentView(session: session, entry: sideChatEntry, hide: hideSideChat, newChat: newSideChat)
            .id(sideChatEntry.id)
        } else if let openSideChat {
          Button(SideChatStrings.newChat, systemImage: "bubble.left.and.bubble.right", action: openSideChat)
        }
      case .files, .git:
        if !hasProjectWorkspace {
          infoUnavailable
        }
      case .terminal:
        if isVisible, let project {
          ProjectShellTerminalView(
            session: session,
            projectLocation: project.location,
            worktreePath: thread?.worktreePath
          )
        }
      case .notes:
        if let project {
          ProjectNotesPageView(session: session, projectID: project.id)
        }
      case .ports:
        if isVisible, let lease = session.currentPortForwardingAccess?.lease {
          PortForwardingSessionView(
            session: session,
            lease: lease,
            embeddedInNavigationStack: true,
            showsHostSelection: false
          )
        }
      case .browser:
        if isVisible && session.currentBrowserMirrorAccess != nil {
          BrowserMirrorSessionView(
            session: session,
            embeddedInNavigationStack: true,
            showsHostSelection: false
          )
        }
      }
    }
  }

  private var infoUnavailable: some View {
    ScrollView {
      infoContent()
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 16)
    }
  }

  private func selectTab(_ tab: RichChatRightPanelTab) {
    withAnimation(.snappy(duration: 0.22)) {
      activeTab = tab
    }
  }

  private func expandAction(for tab: RichChatRightPanelTab) -> (() -> Void)? {
    switch tab {
    case .info, .sideChat:
      nil
    case .files:
      hasProjectWorkspace ? { openDestination(.files) } : nil
    case .git:
      hasProjectWorkspace ? { openDestination(.git) } : nil
    case .terminal:
      hasProjectWorkspace ? { openDestination(.terminal) } : nil
    case .notes:
      project != nil ? { openDestination(.notes) } : nil
    case .browser:
      session.currentBrowserMirrorAccess != nil ? { expandedSheet = .browser } : nil
    case .ports:
      if let lease = session.currentPortForwardingAccess?.lease {
        { expandedSheet = .ports(lease) }
      } else {
        nil
      }
    }
  }

}
