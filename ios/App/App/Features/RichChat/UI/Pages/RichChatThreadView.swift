import SwiftUI

struct RichChatThreadView: View {
  @Bindable var session: AppSession
  let threadID: String
  let title: String

  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.colorScheme) private var inheritedColorScheme
  @Environment(\.dismiss) private var dismiss
  @State private var pageState: RichChatThreadPageState
  @State private var isConfirmingClose = false
  @State private var composerExpanded = false
  @State private var forkAnchor: String?
  @State private var forkTitle = ""
  @State private var forkID = UUID().uuidString
  @State private var forkPending = false
  @State private var forkAttempt: RichChatThreadCommand?
  @State private var forkDestination: RemoteThread?
  @State private var navigationGeneration: UInt64 = 0
  @State private var navigationFailure = false
  @State private var pageVisible = false

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
    .environment(\.colorScheme, isTerminal ? .dark : inheritedColorScheme)
    .sheet(isPresented: Binding(get: { forkAnchor != nil }, set: { if !$0 && !forkPending { forkAnchor = nil } })) {
      NavigationStack {
        Form {
          Text(RichChatMessageActionStrings.forkExplanation).foregroundStyle(.secondary)
          TextField(RichChatMessageActionStrings.forkName, text: $forkTitle)
            .disabled(forkPending || forkAttempt != nil)
          if let failure = suite.conversation.state.failure {
            Text(RichChatStrings.failure(failure)).foregroundStyle(.red)
          }
          if navigationFailure {
            Text(RichChatMessageActionStrings.sourceUnavailable).foregroundStyle(.red)
          }
        }
        .navigationTitle(RichChatMessageActionStrings.forkTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RichChatStrings.cancel) { forkAnchor = nil }.disabled(forkPending)
          }
          ToolbarItem(placement: .confirmationAction) {
            Button(RichChatMessageActionStrings.forkCreate) { createFork() }
              .disabled(forkPending || forkTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          }
        }
        .interactiveDismissDisabled(forkPending)
      }
    }
    .navigationDestination(item: $forkDestination) { destination in
      RichChatThreadView(session: session, threadID: destination.id, title: destination.title)
    }
    .alert(RichChatMessageActionStrings.sourceUnavailable, isPresented: Binding(
      get: { navigationFailure && forkAnchor == nil },
      set: { if !$0 { navigationFailure = false } }
    )) { Button(RichChatStrings.cancel, role: .cancel) { navigationFailure = false } }
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
    .onChange(of: activationID) {
      navigationGeneration &+= 1
      forkAnchor = nil
      forkAttempt = nil
      forkPending = false
      forkDestination = nil
      navigationFailure = false
    }
    .task(id: session.currentSettingsHostSelection?.lease) {
      await pageState.refreshProviderUsage()
      await pageState.loadVisibilityOverrides()
    }
    // Session-action inventory: one live read per selected thread, status
    // change, and owner-axis change (presentation, provider instance, live
    // SessionRef). Only the typed old-host answer collapses the inventory
    // quietly — every other failure stays visible with a retry.
    .task(id: pageState.sessionActionRefreshKey) {
      suite.sessionActions.updateOwner(pageState.sessionActionOwner)
      await suite.sessionActions.refreshInventory()
    }
    .onChange(of: session.phase) { pageState.updateAccess() }
    .onChange(of: session.socketState) { pageState.updateAccess() }
    .onChange(of: thread?.config) { previous, current in
      draftState.synchronizeConfiguration(previous: previous, current: current)
    }
    .onChange(of: session.richChatComposerDrafts.revision) { draftState.consumeQueuedSegments() }
    // An ambiguous session-action invoke may have committed; the host
    // reconciles through one authoritative refresh, then the flag clears and
    // the inventory is read fresh — the session may have been replaced.
    .onChange(of: suite.sessionActions.state.requiresAuthoritativeRefresh) { _, needs in
      guard needs else { return }
      Task {
        await suite.refreshAuthoritativeHistory()
        suite.sessionActions.acknowledgeAuthoritativeRefresh()
        await suite.sessionActions.refreshInventory()
      }
    }
    .onAppear { pageVisible = true; draftState.consumeQueuedSegments() }
    .onChange(of: scenePhase) { _, phase in pageState.handleScenePhase(phase) }
    .onDisappear { pageVisible = false; forkPending = false; navigationGeneration &+= 1; pageState.detach() }
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
      if let source = thread?.forkedFrom?.objectValue,
        let sourceID = source["threadId"]?.stringValue,
        let sourceTitle = source["title"]?.stringValue
      {
        Button(RichChatMessageActionStrings.forkSource(sourceTitle), systemImage: "arrow.triangle.branch") {
          navigateToForkThread(sourceID)
        }
        .font(.caption)
        .tint(.secondary)
        .padding(8)
      }
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
      sessionConfigOptions: thread?.sessionConfigOptions,
      canConfigure: canConfigureComposer,
      hasStartedSession: thread?.sessionRef != nil,
      hiddenModels: pageState.hiddenModels,
      fileMentionController: fileMentionController,
      skillPickerContext: skillPickerContext,
      sessionActions: suite.sessionActions,
      onInsertIntoComposer: pageState.insertIntoComposerDraft
    )
  }

  private var transcriptSurface: some View {
    RichChatTranscriptSurface(
      controller: suite.transcript,
      notice: suite.notice,
      mediaController: suite.media,
      conversation: suite.conversation,
      checkpointController: suite.checkpoints,
      projectLocation: projectLocation,
      config: config,
      sharedTreeThreadCount: sharedTreeThreadCount,
      allowsCheckpointRevert: thread?.projectId != RemoteProject.homeScopeID,
      canOperate: canOperate,
      retry: { Task { await suite.refreshAuthoritativeHistory() } },
      requestFork: canFork ? { anchor in
        forkID = UUID().uuidString
        forkAttempt = nil
        navigationFailure = false
        forkTitle = thread?.title ?? title
        forkAnchor = anchor
      } : nil,
      forkBoundaryItemID: thread?.forkedFrom?["throughItemId"]?.stringValue
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

  private var canFork: Bool {
    canOperate && session.state.threadForksSupported
      && ["idle", "inactive", "error"].contains(thread?.status ?? "")
  }

  private func createFork() {
    guard let forkAnchor, !forkPending, forkAttempt != nil || canFork else { return }
    if forkAttempt == nil {
      forkAttempt = RichChatThreadCommand(payload: [
        "kind": .string("fork"), "sourceThreadId": .string(threadID),
        "throughItemId": .string(forkAnchor),
        "title": .string(forkTitle.trimmingCharacters(in: .whitespacesAndNewlines)),
      ], commandID: forkID, destinationThreadID: forkID)
    }
    guard let command = forkAttempt else { return }
    let owner = activationID
    let navigation = navigationGeneration
    let targetID = forkID
    forkPending = true
    navigationFailure = false
    Task {
      let success = await suite.conversation.runCommand(command)
      guard activationID == owner, pageVisible, navigation == navigationGeneration else { return }
      if success {
        let destination = await session.ensureThreadLoadedForOpen(id: targetID)
        guard activationID == owner, pageVisible, navigation == navigationGeneration else {
          session.releasePendingNavigationPin(id: targetID)
          return
        }
        if let destination {
          self.forkAnchor = nil
          forkDestination = destination
        } else { navigationFailure = true }
      }
      forkPending = false
    }
  }

  private func navigateToForkThread(_ id: String) {
    let owner = activationID
    navigationGeneration &+= 1
    let navigation = navigationGeneration
    Task {
      let destination = await session.ensureThreadLoadedForOpen(id: id)
      guard activationID == owner, pageVisible, navigation == navigationGeneration else { session.releasePendingNavigationPin(id: id); return }
      if let destination { forkDestination = destination } else { navigationFailure = true }
    }
  }

}
