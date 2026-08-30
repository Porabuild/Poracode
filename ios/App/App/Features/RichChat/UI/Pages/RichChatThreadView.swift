import SwiftUI

struct RichChatThreadView: View {
  @Bindable var session: AppSession
  let threadID: String
  let title: String

  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.dismiss) private var dismiss
  @State private var pageState: RichChatThreadPageState
  @State private var isConfirmingClose = false
  @State private var composerExpanded = false

  init(session: AppSession, threadID: String, title: String) {
    self.session = session
    self.threadID = threadID
    self.title = title
    _pageState = State(initialValue: RichChatThreadPageState(session: session, threadID: threadID))
  }

  var body: some View {
    Group {
      if isTerminal {
        RichTerminalView(
          controller: suite.terminal,
          terminalID: threadID,
          canOperate: canOperateTerminal
        )
      } else {
        guiContent
      }
    }
    .navigationTitle(thread?.title ?? title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .toolbar {
      if let thread, let project {
        ToolbarItem(placement: .principal) {
          PoracodeToolbarInfoBubble {
            ThreadDetailTitleView(
              session: session,
              thread: thread,
              project: project,
              hasBackgroundActivity: suite.transcript.state.transcript?.openTurn == true,
              showsProviderBadge: false
            )
          }
        }
      }
      if let thread, let project, let projectLocation {
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
            canClose: canCloseThread,
            refresh: { Task { await suite.refreshAuthoritativeHistory() } },
            requestClose: { isConfirmingClose = true },
            onThreadRemoved: {
              draftState.discard()
              dismiss()
            }
          )
        }
      }
    }
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
    // `lastCompletedOperation` is only ever written under the still-current
    // lease and activation revision, so a close that outran a host switch or a
    // thread change can never navigate this destination away.
    .onChange(of: suite.conversation.state.lastCompletedOperation) { _, operation in
      guard operation == .close else { return }
      draftState.discard()
      dismiss()
    }
    .task(id: activationID) { await pageState.activate() }
    .task(id: session.currentSettingsHostSelection?.lease) {
      await pageState.refreshProviderUsage()
    }
    .onChange(of: session.phase) { pageState.updateAccess() }
    .onChange(of: session.socketState) { pageState.updateAccess() }
    .onChange(of: thread?.config) { previous, current in
      draftState.synchronizeConfiguration(previous: previous, current: current)
    }
    .onChange(of: session.richChatComposerDrafts.revision) { draftState.consumeQueuedSegments() }
    .onAppear { draftState.consumeQueuedSegments() }
    .onChange(of: scenePhase) { _, phase in pageState.handleScenePhase(phase) }
    .onDisappear { pageState.detach() }
  }

  private var suite: RichChatControllerSuite { pageState.suite }
  private var providerUsageController: SettingsHostInformationController {
    pageState.providerUsageController
  }
  private var fileMentionController: RichChatFileMentionController {
    pageState.fileMentionController
  }
  private var draftState: RichChatThreadDraftState { pageState.draft }

  private var guiContent: some View {
    VStack(spacing: 0) {
      RichChatStatusView(suite: suite)
      RichChatResponsiveLayout {
        EmptyView()
      } transcript: {
        transcriptSurface
      } sidebar: {
        RichChatControlPanel(
          suite: suite,
          projectLocation: projectLocation,
          agentStatus: agentStatus,
          config: config,
          canOperate: canOperate,
          canResolveRequests: canResolveRequests,
          refreshAuthentication: { await session.refreshSnapshot() }
        )
      } compactDock: {
        RichChatCompactControlDock(
          session: session,
          suite: suite,
          thread: thread,
          project: project,
          projectLocation: projectLocation,
          gitSummary: session.gitSummary(forThread: threadID),
          agentStatus: agentStatus,
          config: config,
          canOperate: canOperate,
          canResolveRequests: canResolveRequests,
          refreshAuthentication: { await session.refreshSnapshot() },
          providerUsage: providerUsagePresentation,
          providerUsageState: providerUsageController.usageState,
          refreshProviderUsage: pageState.refreshProviderUsage
        )
      } composer: {
        composerSurface
      }
    }
  }

  private var composerSurface: some View {
    RichChatThreadComposerSurface(
      state: draftState,
      isExpanded: $composerExpanded,
      baseConfiguration: thread?.config ?? .empty,
      canOperate: canOperate,
      isTurnActive: suite.transcript.state.transcript?.openTurn == true || threadStatusIsWorking,
      controller: suite.conversation,
      requestController: suite.requests,
      activeRequest: suite.transcript.state.transcript?.openRequests.first,
      canResolveRequests: canResolveRequests,
      mediaController: suite.media,
      agentKind: thread?.agentKind ?? "",
      agentStatus: agentStatus,
      threadSlashCommands: thread?.slashCommands,
      canConfigure: canConfigureComposer,
      fileMentionController: fileMentionController,
      skillPickerContext: skillPickerContext
    )
  }

  private var transcriptSurface: some View {
    RichChatTranscriptSurface(
      controller: suite.transcript,
      mediaController: suite.media,
      conversation: suite.conversation,
      checkpointController: suite.checkpoints,
      projectLocation: projectLocation,
      config: config,
      sharedTreeThreadCount: sharedTreeThreadCount,
      allowsCheckpointRevert: thread?.projectId != RemoteProject.homeScopeID,
      canOperate: canOperate,
      retry: { Task { await suite.refreshAuthoritativeHistory() } }
    )
  }

  private var thread: RemoteThread? { session.richChatThread(id: threadID) }
  private var project: RemoteProject? {
    guard let projectID = thread?.projectId else { return nil }
    return session.projects.first { $0.id == projectID }
  }
  private var isTerminal: Bool {
    guard let thread else { return false }
    return ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)
  }
  private var threadStatusIsWorking: Bool {
    thread?.status == "working"
  }
  private var activeConfiguration: ThreadConfig {
    draftState.configuration ?? thread?.config ?? .empty
  }
  private var config: [String: RichJSON] { activeConfiguration.richChatObject }
  private var agentStatus: AgentStatusRecord? {
    guard let agentKind = thread?.agentKind else { return nil }
    return session.state.replay.agentStatuses.ordered.first {
      $0.kind == agentKind && $0.installed
    }
  }
  private var providerUsagePresentation: RichChatProviderUsagePresentation {
    RichChatProviderUsagePresentation.resolve(
      agentKind: thread?.agentKind ?? "",
      agentInstanceID: thread?.agentInstanceId,
      label: agentStatus?.label,
      usage: providerUsageController.providerUsage
    )
  }
  private var skillPickerContext: RichChatSkillPickerContext? {
    guard let project, let connectionID = session.selectedConnectionId else { return nil }
    return RichChatSkillPickerContext(
      session: session,
      projectIdentity: project.identity(on: connectionID),
      agentKind: thread?.agentKind ?? ""
    )
  }
  private var canConfigureComposer: Bool {
    guard let thread else { return false }
    return thread.canResumeWithConfig == true || thread.status == "launching"
  }
  private var projectLocation: ProjectLocation? {
    session.richChatProjectLocation(threadID: threadID)
  }
  private var sharedTreeThreadCount: Int {
    guard let thread else { return 0 }
    return (session.snapshot?.threads ?? []).count { candidate in
      candidate.id != thread.id
        && !candidate.isArchived
        && candidate.projectId == thread.projectId
        && (candidate.worktreePath ?? "") == (thread.worktreePath ?? "")
    }
  }
  private var canOperate: Bool {
    hasOperateAccess && !suite.requiresAuthoritativeRefresh
  }
  private var canOperateTerminal: Bool {
    session.currentRichChatAccess?.controllerGate(.terminalOperate) == nil
  }
  private var hasOperateAccess: Bool {
    session.currentRichChatAccess?.controllerGate(.sessionOperate) == nil
  }
  /// `thread-close` is a `session:operate` mutation on the open thread. It is
  /// offered only while the host is operable and nothing else is already
  /// mutating or replacing the transcript.
  private var canCloseThread: Bool {
    canOperate
      && thread != nil
      && suite.conversation.state.activeMutation == nil
      && !suite.conversation.state.isSending
      && suite.transcript.state.loadState != .loading
  }

  private func confirmClose() {
    isConfirmingClose = false
    guard canCloseThread else { return }
    Task { await suite.conversation.close() }
  }

  private var canResolveRequests: Bool {
    session.currentRichChatAccess?.controllerGate(.requestsResolve) == nil
      && !suite.requiresAuthoritativeRefresh
  }
  private var activationID: String {
    let lease = session.currentRichChatAccess?.lease
    return "\(lease?.connectionID.rawValue ?? "none"):\(lease?.generation ?? 0):\(threadID)"
  }

}
