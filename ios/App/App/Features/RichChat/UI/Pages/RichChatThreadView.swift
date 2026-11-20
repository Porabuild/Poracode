import SwiftUI

struct RichChatThreadView: View {
  @Bindable var session: AppSession
  let threadID: String
  let title: String
  let openLinkedThread: ((RemoteThread) -> Bool)?
  let returnToForkSource: ((String) -> Bool)?
  private let openWorkspaceTools: (() -> Void)?

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
  @State private var sourceFileDestination: RichChatSourceFileDestination?
  @State var fork = RichChatForkState()
  @State var resumeState = RichChatThreadResumeState()

  init(
    session: AppSession, threadID: String, title: String, auxiliary: Bool = false,
    retainedSuite: RichChatControllerSuite? = nil, chatWindow: RichChatWindowSession? = nil,
    openLinkedThread: ((RemoteThread) -> Bool)? = nil,
    returnToForkSource: ((String) -> Bool)? = nil,
    openWorkspaceTools: (() -> Void)? = nil
  ) {
    self.session = session
    self.threadID = threadID
    self.title = title
    self.openLinkedThread = openLinkedThread
    self.returnToForkSource = returnToForkSource
    self.openWorkspaceTools = openWorkspaceTools
    _pageState = State(initialValue: RichChatThreadPageState(session: session, threadID: threadID,
      auxiliary: auxiliary, retainedSuite: retainedSuite, chatWindow: chatWindow))
  }

  var body: some View {
    Group {
      if isTerminal {
        terminalContent
      } else {
        guiContent
      }
    }
    .environment(\.richChatImageSources) { pageState.galleryImages }
    .modifier(RichChatRequestFormPresentation(suite: suite, canResolve: pageState.canResolveRequests))
    .poracodeThemeBackground(theme.variant(for: inheritedColorScheme).background)
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
        ToolbarItemGroup(placement: .topBarTrailing) {
          if inspectorCapability.supportsInspector {
            PoracodeToolbarIconButton(
              title: HomeStrings.toggleInspector,
              systemImage: "sidebar.right",
              color: isInspectorCurrentlyOpen ? .primary : .secondary,
              sharesBackground: true
            ) { toggleInspector() }
            .accessibilityIdentifier("native-e2e.inspector-toggle")
          } else if isTerminal {
            PoracodeToolbarIconButton(
              title: HomeStrings.threadInfo,
              systemImage: "info.circle",
              sharesBackground: true
            ) { showsCompactThreadInfo = true }
          }
          if let thread, let project = pageState.project, let projectLocation = pageState.projectLocation {
            ThreadDetailActionMenu(
              session: session,
              owningConnectionID: pageState.owningConnectionID,
              thread: thread,
              project: project,
              workspaceLocation: projectLocation,
              handoffItems: suite.transcript.state.transcript?.itemsInOrder ?? [],
              terminalScrollback: isTerminal
                ? suite.terminal.state.cursor?.transcript
                : suite.transcript.state.terminalScrollback,
              canRefresh: !isTerminal && suite.transcript.state.loadState != .loading,
              canClose: pageState.canCloseThread,
              selectDestination: { actionDestination = $0 },
              externalHandoffRequest: crewHandoffBinding,
              refresh: { Task { await suite.refreshAuthoritativeHistory() } },
              requestClose: { isConfirmingClose = true },
              onThreadRemoved: closeAndDismiss
            ) {
              if let openWorkspaceTools {
                Section {
                  Button(action: openWorkspaceTools) {
                    PoracodeActionLabel(HomeStrings.workspace, systemImage: "briefcase")
                  }
                }
              }
              RichChatThreadInformationMenu(
                showsResourceDetails: !isTerminal,
                hasContext: suite.transcript.state.contextUsage != nil, find: pageState.canDisplayHistory ? pageState.find : nil,
                showInfo: { showsCompactThreadInfo = true },
                select: { compactControlDestination = $0 }
              )
            }
          }
        }
      }
    }
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
    .modifier(RichChatSourceFilePresentation(session: session, threadID: threadID, destination: $sourceFileDestination))
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
    .onChange(of: thread?.isDone) { previous, current in
      // Home owns selection across layout changes. Standalone destinations
      // dismiss their own page and let departure park the unsent draft.
      if pageState.dismissesOnCompletion, previous == false, current == true { dismiss() }
    }
    .modifier(RichChatThreadLifecycle(pageState: pageState, composerExpanded: $composerExpanded))
    .modifier(NativeThreadPanelCommands(page: pageState, capability: $inspectorCapability,
      isVisible: $isInspectorVisible, activeTab: $rightPanelTab, destination: $actionDestination))
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
        onCapabilityChange: { inspectorCapability = $0 }
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
      onCapabilityChange: { inspectorCapability = $0 }
    ) {
      EmptyView()
    } transcript: {
      RichChatTerminalSurface(controller: suite.terminal, terminalID: threadID,
        canOperate: pageState.canOperateTerminal, isConnectingHost: session.phase == .connecting)
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
    let baseConfiguration: ThreadConfig = thread?.config ?? .empty
    let activeRequest: RichOpenRequest? = suite.transcript.state.transcript?.openRequests.first
    let agentKind: String = thread?.agentKind ?? ""
    let hasStartedSession: Bool = thread?.sessionRef != nil
    let insertIntoComposer: (String) -> Void = { pageState.insertIntoComposerDraft($0) }
    let openSideChatHandler: (() -> Void)? = offersSideChat ? { openSideChat() } : nil
    let sideQuestionHandler: ((String) async -> Bool)? = offersSideChat
      ? { await openSideQuestion($0) }
      : nil
    let isConnectingHost: Bool = session.phase == .connecting
    return RichChatThreadComposerSurface(
      state: pageState.draft, isExpanded: $composerExpanded,
      baseConfiguration: baseConfiguration, canOperate: canOperate,
      isTurnActive: isComposerTurnActive, controller: suite.conversation,
      requestController: suite.requests, activeRequest: activeRequest,
      canResolveRequests: pageState.canResolveRequests, mediaController: suite.media,
      agentKind: agentKind, agentInstanceID: thread?.agentInstanceId,
      agentStatus: pageState.agentStatus, threadSlashCommands: thread?.slashCommands,
      sessionConfigOptions: thread?.sessionConfigOptions,
      canConfigure: pageState.canConfigureComposer, hasStartedSession: hasStartedSession,
      hiddenModels: pageState.hiddenModels,
      fileMentionController: pageState.fileMentionController,
      skillPickerContext: pageState.skillPickerContext, sessionActions: suite.sessionActions,
      onInsertIntoComposer: insertIntoComposer, resumeContext: composerResume,
      openSideChat: openSideChatHandler, sideQuestion: sideQuestionHandler,
      crewContext: richCrewContext, isConnectingHost: isConnectingHost
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
      requestFork: forkRequest, forkBoundaryItemID: forkBoundaryID, forkSource: forkSourceLink,
      fallbackCompletedTurn: RichChatTurnTiming.completedFallback(thread: thread),
      askInSideChat: offersSideChat ? { addMessageToSideChat($0) } : nil,
      recordRevertedPrompt: pageState.recordRevertedPrompt,
      openProjectFile: pageState.projectFileOpener { sourceFileDestination = $0 },
      resolveAttachmentBasename: pageState.attachmentBasenameResolver,
      isConnectingHost: session.phase == .connecting, find: pageState.find,
      showsHistory: pageState.canDisplayHistory, allowsThreadToolbar: !pageState.isAuxiliary
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
