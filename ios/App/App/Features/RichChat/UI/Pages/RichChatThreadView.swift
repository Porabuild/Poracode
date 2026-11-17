import SwiftUI

struct RichChatThreadView: View {
  @Bindable var session: AppSession
  let threadID: String
  let title: String

  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.colorScheme) private var inheritedColorScheme
  @Environment(\.poracodeTheme) private var theme
  @Environment(\.dismiss) private var dismiss
  @Environment(\.poracodeCloseThreadDetail) private var closeThreadDetail
  @State private var pageState: RichChatThreadPageState
  @State private var isConfirmingClose = false
  @State private var showsCompactThreadInfo = false
  @State private var compactControlDestination: RichChatCompactControlDestination?
  @State var composerExpanded = false
  @State var inspectorCapability = RichChatInspectorCapability()
  @State var isInspectorVisible: Bool?
  @State var rightPanelTab: RichChatRightPanelTab = .info
  @State var showsSideChatSheet = false
  @State var sideChatFailure: String?
  @State private var actionDestination: ThreadDetailDestination?
  @State var fork = RichChatForkState()
  @State var resumeState = RichChatThreadResumeState()

  init(session: AppSession, threadID: String, title: String, auxiliary: Bool = false, retainedSuite: RichChatControllerSuite? = nil) {
    self.session = session
    self.threadID = threadID
    self.title = title
    _pageState = State(initialValue: RichChatThreadPageState(session: session, threadID: threadID, auxiliary: auxiliary, retainedSuite: retainedSuite))
  }

  var body: some View {
    Group {
      if isTerminal {
        terminalContent
      } else {
        guiContent
      }
    }
    .poracodeThemeBackground(isTerminal ? .black : theme.variant(for: inheritedColorScheme).background)
    .trackWorkflowActivity(session: session, controller: suite.transcript, headings: suite.runtimeItemHeadings, location: pageState.projectLocation)
    .modifier(RichChatNavigationChrome(title: thread?.title ?? title, auxiliary: pageState.isAuxiliary))
    .toolbar {
      if !pageState.isAuxiliary {
      if let thread, let project = pageState.project {
        PoracodeToolbarTitle {
          ThreadDetailTitleView(
            session: session, thread: thread, project: project,
            hasBackgroundActivity: suite.transcript.state.transcript?.openTurn == true || session.workflowActivity.isLive(for: suite.transcript.state.target),
            foregroundIsOpen: suite.transcript.state.transcript?.openTurn,
            showsProviderBadge: false
          )
        }
      }
      if inspectorCapability.supportsInspector {
        ToolbarItem(placement: .topBarTrailing) {
          PoracodeToolbarIconButton(
            title: HomeStrings.toggleInspector,
            systemImage: "sidebar.right",
            color: isInspectorCurrentlyOpen ? .primary : .secondary
          ) { toggleInspector() }
          .accessibilityIdentifier("native-e2e.inspector-toggle")
        }
      }
      if isTerminal && !inspectorCapability.supportsInspector {
        ToolbarItem(placement: .topBarTrailing) {
          PoracodeToolbarIconButton(title: HomeStrings.threadInfo, systemImage: "info.circle") {
            showsCompactThreadInfo = true
          }
        }
      }
      if !pageState.isAuxiliary, let thread, let project = pageState.project, let projectLocation = pageState.projectLocation {
        ToolbarItem(placement: .topBarTrailing) {
          ThreadDetailActionMenu(
            session: session,
            thread: thread,
            project: project,
            workspaceLocation: projectLocation,
            handoffItems: suite.transcript.state.transcript?.itemsInOrder ?? [],
            terminalScrollback: isTerminal
              ? suite.terminal.state.cursor?.transcript
              : suite.transcript.state.terminalScrollback,
            canRefresh: !isTerminal && suite.transcript.state.loadState != .loading,
            canClose: pageState.canCloseThread,
            externalDestination: $actionDestination,
            externalHandoffRequest: crewHandoffBinding,
            refresh: { Task { await suite.refreshAuthoritativeHistory() } },
            requestClose: { isConfirmingClose = true },
            onThreadRemoved: closeAndDismiss
          ) {
            RichChatThreadInformationMenu(
              showsResourceDetails: !isTerminal,
              hasContext: suite.transcript.state.contextUsage != nil,
              showInfo: { showsCompactThreadInfo = true },
              select: { compactControlDestination = $0 }
            )
          }
        }
      }
      }
    }
    .environment(\.colorScheme, isTerminal ? .dark : inheritedColorScheme)
    .modifier(RichChatSideChatPresentation(page: self))
    .modifier(ComposerVoiceHost(session: session))
    .environment(\.composerPreferences, session.composerPreferences)
    .modifier(ToolPresentationEnvironment(session: session, connectionID: pageState.owningConnectionID, threadID: threadID, headings: suite.runtimeItemHeadings))
    .modifier(CrewSessionRelaunchPresentation(state: pageState))
    .sheet(isPresented: $showsCompactThreadInfo) {
      RichChatInfoSheet(title: HomeStrings.threadInfo) {
        RichChatThreadInfoCard(
          thread: thread,
          project: pageState.project,
          projectLocation: pageState.projectLocation,
          gitSummary: session.gitSummary(forThread: threadID)
        )
      }
    }
    .modifier(RichChatForkPresentation(page: self))
    .confirmationDialog(
      RichChatStrings.closeThreadConfirmationTitle,
      isPresented: $isConfirmingClose,
      titleVisibility: .visible
    ) {
      Button(RichChatStrings.closeThread, role: .destructive) { confirmClose() }
      Button(RichChatStrings.cancel, role: .cancel) { isConfirmingClose = false }
    } message: {
      Text(RichChatStrings.closeThreadConfirmationMessage)
    }
    // `lastCompletedOperation` stays scoped to the current lease & revision.
    .onChange(of: suite.conversation.state.lastCompletedOperation) { _, operation in
      guard operation == .close else { return }
      closeAndDismiss()
    }
    .task(id: pageState.activationID) { await pageState.activate() }
    .task(id: pageState.settingsRefreshKey) {
      await pageState.refreshProviderUsage()
      await pageState.loadVisibilityOverrides()
    }
    // Session-action inventory tracks live owner changes; ambiguous refreshes below.
    .task(id: pageState.sessionActionRefreshKey) {
      suite.sessionActions.updateOwner(pageState.sessionActionOwner)
      await suite.sessionActions.refreshInventory()
    }
    .onChange(of: session.phase) { pageState.updateAccess() }
    .onChange(of: session.socketState) { pageState.updateAccess() }
    .onChange(of: thread?.config) { previous, current in
      pageState.draft.synchronizeConfiguration(previous: previous, current: current)
    }
    .onChange(of: suite.transcript.state.transcript?.itemsInOrder, initial: true) { _, items in
      pageState.updateGallery(items ?? [])
    }
    .onChange(of: suite.sessionActions.state.requiresAuthoritativeRefresh) { _, needs in
      guard needs else { return }
      Task {
        await suite.refreshAuthoritativeHistory()
        suite.sessionActions.acknowledgeAuthoritativeRefresh()
        await suite.sessionActions.refreshInventory()
      }
    }
    .onAppear { if pageState.draft.consumeQueuedSegments() { composerExpanded = true } }
    .onChange(of: session.richChatComposerDrafts.revision) { _, _ in
      if pageState.draft.consumeQueuedSegments() { composerExpanded = true }
    }
    .onChange(of: pageState.composerFocusRevision) { _, _ in composerExpanded = true }
    .onChange(of: scenePhase) { _, phase in pageState.handleScenePhase(phase) }
    .onDisappear { pageState.detach() }
  }

  var suite: RichChatControllerSuite { pageState.suite }
  var thread: RemoteThread? { pageState.thread }
  var isAuxiliaryConversation: Bool { pageState.isAuxiliary }
  var currentComposerDraft: RichChatThreadDraftState { pageState.draft }
  var conversationConnectionID: ClientConnectionID? { pageState.owningConnectionID }
  var conversationOwner: RichChatSessionActionOwner? { pageState.sessionActionOwner }
  var threadStatusIsWorking: Bool { thread?.status == "working" }
  var activationID: String { pageState.activationID }
  var canOperate: Bool { pageState.canOperate }
  private var isTerminal: Bool { pageState.isTerminal }

  private func updateInspectorCapability(_ updated: RichChatInspectorCapability) {
    inspectorCapability = updated
  }

  private var guiContent: some View {
    VStack(spacing: 0) {
      if thread?.config.importedFrom != nil {
        Text(SessionImportStrings.textOnly)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
      }
      RichChatStatusView(suite: suite)
      RichChatResponsiveLayout(
        breakpoint: pageState.isAuxiliary ? .infinity : 960,
        isInspectorVisible: isInspectorVisible,
        onCapabilityChange: updateInspectorCapability
      ) {
        EmptyView()
      } transcript: {
        transcriptSurface
      } sidebar: {
        inspector
      } compactDock: {
        RichChatCompactControlDock(
          session: session, suite: suite, turnClock: pageState.draft.turnClock, destination: $compactControlDestination,
          thread: thread, project: pageState.project,
          projectLocation: pageState.projectLocation,
          gitSummary: session.gitSummary(forThread: threadID),
          agentStatus: pageState.agentStatus, config: pageState.config,
          canOperate: canOperate, canResolveRequests: pageState.canResolveRequests,
          refreshAuthentication: { await session.refreshSnapshot() },
          providerUsage: pageState.providerUsagePresentation,
          providerUsageState: pageState.providerUsageController.usageState,
          refreshProviderUsage: pageState.refreshProviderUsage,
          galleryImages: pageState.galleryImages,
          galleryVideos: pageState.galleryVideos,
          galleryIdentity: pageState.activationID,
          openWideGit: {
            rightPanelTab = .git
            isInspectorVisible = true
          }
        )
      } composer: {
        composerSurface
      }
    }
  }

  private var terminalContent: some View {
    RichChatResponsiveLayout(
      showsComposer: false,
      isInspectorVisible: isInspectorVisible,
      onCapabilityChange: updateInspectorCapability
    ) {
      EmptyView()
    } transcript: {
      if session.phase == .connecting {
        LoadingStateView(message: ProjectWorkspaceStrings.connecting)
          .accessibilityIdentifier("native-e2e.thread-connecting")
      } else {
        RichTerminalView(
          controller: suite.terminal,
          terminalID: threadID,
          canOperate: pageState.canOperateTerminal
        )
      }
    } sidebar: {
      inspector
    } compactDock: {
      EmptyView()
    } composer: {
      EmptyView()
    }
  }

  private var inspector: some View {
    RichChatThreadInspector(
      session: session, pageState: pageState, threadID: threadID,
      activeTab: $rightPanelTab, actionDestination: $actionDestination,
      sideChatEntry: retainedSideChat, openSideChat: offersSideChat ? { openSideChat() } : nil,
      hideSideChat: { hideSideChat() }, newSideChat: { openSideChat(fresh: true) }
    )
  }

  private var composerSurface: some View {
    RichChatThreadComposerSurface(
      state: pageState.draft, isExpanded: $composerExpanded,
      baseConfiguration: thread?.config ?? .empty, canOperate: canOperate,
      isTurnActive: isComposerTurnActive, controller: suite.conversation,
      requestController: suite.requests,
      activeRequest: suite.transcript.state.transcript?.openRequests.first,
      canResolveRequests: pageState.canResolveRequests, mediaController: suite.media,
      agentKind: thread?.agentKind ?? "", agentInstanceID: thread?.agentInstanceId,
      agentStatus: pageState.agentStatus,
      threadSlashCommands: thread?.slashCommands,
      sessionConfigOptions: thread?.sessionConfigOptions,
      canConfigure: pageState.canConfigureComposer, hasStartedSession: thread?.sessionRef != nil,
      hiddenModels: pageState.hiddenModels,
      fileMentionController: pageState.fileMentionController,
      skillPickerContext: pageState.skillPickerContext, sessionActions: suite.sessionActions,
      onInsertIntoComposer: pageState.insertIntoComposerDraft, resumeContext: composerResume,
      openSideChat: offersSideChat ? { openSideChat() } : nil,
      sideQuestion: offersSideChat ? { await openSideQuestion($0) } : nil,
      crewContext: richCrewContext,
      isConnectingHost: session.phase == .connecting
    )
  }

  private var transcriptSurface: some View {
    RichChatTranscriptSurface(
      controller: suite.transcript, notice: suite.notice, mediaController: suite.media,
      conversation: suite.conversation, checkpointController: suite.checkpoints,
      projectLocation: pageState.projectLocation, config: pageState.config,
      sharedTreeThreadCount: pageState.sharedTreeThreadCount,
      allowsCheckpointRevert: thread?.projectId != RemoteProject.homeScopeID,
      canOperate: canOperate, retry: { Task { await suite.refreshAuthoritativeHistory() } },
      requestFork: forkRequest, forkBoundaryItemID: forkBoundaryID,
      fallbackCompletedTurn: RichChatTurnTiming.completedFallback(thread: thread),
      askInSideChat: offersSideChat ? { addMessageToSideChat($0) } : nil,
      isConnectingHost: session.phase == .connecting
    )
  }

  private func confirmClose() {
    isConfirmingClose = false
    guard pageState.canCloseThread else { return }
    Task { await suite.conversation.close() }
  }

  private func closeAndDismiss() {
    pageState.draft.discard()
    closeThreadDetail?()
    dismiss()
  }
}
