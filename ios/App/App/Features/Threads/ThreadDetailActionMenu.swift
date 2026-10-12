import SwiftUI

/// Native thread-page counterpart to the compact PWA action drawer and
/// workspace bar. One toolbar menu keeps secondary project destinations and
/// thread lifecycle mutations reachable without crowding the navigation bar.
struct ThreadDetailActionMenu: View {
  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  let workspaceLocation: ProjectLocation
  let handoffItems: [RichRuntimeItem]
  let terminalScrollback: String?
  let canRefresh: Bool
  let canClose: Bool
  let refresh: () -> Void
  let requestClose: () -> Void
  let onThreadRemoved: () -> Void

  @State private var lifecycle: ThreadLifecycleController
  @State private var worktreeMover = ThreadWorktreeMoveController()
  @State private var destination: ThreadDetailDestination?
  @State private var renameIntent: ThreadRenameIntent?
  @State private var relaunchIntent: ThreadRelaunchIntent?
  @State private var worktreeComposeIntent: ThreadWorktreeComposeIntent?
  @State private var worktreeMoveIntent: ThreadWorktreeMoveMode?
  @State private var isChoosingHandoffMode = false
  @State private var handoffIntent: ThreadProviderHandoffIntent?
  @State private var openedThreadID: String?
  @State private var failureMessage: String?

  init(
    session: AppSession,
    thread: RemoteThread,
    project: RemoteProject,
    workspaceLocation: ProjectLocation,
    handoffItems: [RichRuntimeItem],
    terminalScrollback: String?,
    canRefresh: Bool,
    canClose: Bool,
    refresh: @escaping () -> Void,
    requestClose: @escaping () -> Void,
    onThreadRemoved: @escaping () -> Void
  ) {
    self.session = session
    self.thread = thread
    self.project = project
    self.workspaceLocation = workspaceLocation
    self.handoffItems = handoffItems
    self.terminalScrollback = terminalScrollback
    self.canRefresh = canRefresh
    self.canClose = canClose
    self.refresh = refresh
    self.requestClose = requestClose
    self.onThreadRemoved = onThreadRemoved
    _lifecycle = State(initialValue: session.makeThreadLifecycleController())
  }

  var body: some View {
    ThreadDetailActionMenuContent(
      thread: thread,
      worktree: worktreeContext,
      canMoveToWorktree: canMoveToWorktree,
      hasHandoffTarget: handoffTarget != nil,
      canOperateLifecycle: canOperateLifecycle,
      canRefresh: canRefresh,
      canClose: canClose,
      isBusy: lifecycle.isBusy || worktreeMover.isMoving,
      selectDestination: { destination = $0 },
      composeInWorktree: { worktree in
        worktreeComposeIntent = ThreadWorktreeComposeIntent(
          projectID: project.id,
          worktreePath: worktree.path,
          worktreeBranch: worktree.branch
        )
      },
      moveToWorktree: { worktreeMoveIntent = $0 },
      chooseHandoff: { isChoosingHandoffMode = true },
      refresh: refresh,
      perform: perform,
      requestClose: requestClose,
      lifecycleButtons: { lifecycleButtons }
    )
    .disabled(!canUseMenu || worktreeMover.isMoving)
    .accessibilityLabel(ThreadLifecycleStrings.actions)
    .navigationDestination(item: $destination) { destination in
      ThreadDetailDestinationView(
        session: session,
        thread: thread,
        project: project,
        workspaceLocation: workspaceLocation,
        destination: destination
      )
    }
    .sheet(item: $relaunchIntent) { intent in
      ThreadRelaunchSheet(
        intent: Binding(
          get: { relaunchIntent ?? intent },
          set: { relaunchIntent = $0 }
        ),
        isBusy: lifecycle.isBusy,
        submit: { submitRelaunch(intent: intent, prompt: $0) }
      )
    }
    .sheet(item: $worktreeComposeIntent) { intent in
      ThreadWorktreeComposeSheet(
        session: session,
        projectID: intent.projectID,
        worktreePath: intent.worktreePath,
        worktreeBranch: intent.worktreeBranch
      ) { threadID in
        worktreeComposeIntent = nil
        openedThreadID = threadID
      }
    }
    .sheet(item: $handoffIntent) { intent in
      if let target = handoffTarget {
        ThreadProviderHandoffSheet(
          session: session,
          thread: thread,
          project: project,
          target: target,
          intent: intent,
          summary: handoffSummary,
          onStarted: finishHandoff
        )
      }
    }
    .navigationDestination(
      isPresented: Binding(
        get: { openedThreadID != nil },
        set: { if !$0 { openedThreadID = nil } }
      )
    ) {
      if let openedThreadID {
        RichChatThreadView(
          session: session,
          threadID: openedThreadID,
          title: HomeStrings.newThread
        )
      }
    }
    .threadRenameAlert(intent: $renameIntent) {
      submitRename()
    }
    .threadLifecycleDestructiveConfirmation(controller: lifecycle) {
      Task { await lifecycle.confirmDestructiveIntent() }
    }
    .confirmationDialog(
      RichChatStrings.continueInProvider,
      isPresented: $isChoosingHandoffMode,
      titleVisibility: .visible
    ) {
      Button(RichChatStrings.handoffFork) { prepareHandoff(.fork) }
      Button(ThreadLifecycleStrings.moveToWorktreeConfirm) { prepareHandoff(.move) }
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .confirmationDialog(
      ThreadLifecycleStrings.moveToWorktreeTitle,
      isPresented: Binding(
        get: { worktreeMoveIntent != nil },
        set: { if !$0 { worktreeMoveIntent = nil } }
      ),
      titleVisibility: .visible,
      presenting: worktreeMoveIntent
    ) { mode in
      Button(ThreadLifecycleStrings.moveToWorktreeConfirm) {
        confirmMoveToWorktree(mode)
      }
      Button(ThreadLifecycleStrings.cancel, role: .cancel) {
        worktreeMoveIntent = nil
      }
    } message: { mode in
      Text(
        mode == .withChanges
          ? ThreadLifecycleStrings.moveToWorktreeWithChangesMessage
          : ThreadLifecycleStrings.moveToCleanWorktreeMessage
      )
    }
    .threadLifecycleFailureAlert(message: failureBinding) {
      clearFailure()
    }
    .onChange(of: lifecycle.lastOutcome) { _, outcome in
      consume(outcome)
    }
    .onDisappear { lifecycle.deactivate() }
  }

  private var lifecycleButtons: some View {
    ThreadLifecyclePrimaryActionsContent(thread: thread, perform: perform)
  }

  private var canUseMenu: Bool {
    session.threadLifecycleTarget(threadID: thread.id) != nil
  }

  private var canOperateLifecycle: Bool {
    canUseMenu
      && session.currentThreadSessionAccess?.isReady == true
      && session.currentThreadSessionAccess?.isOnline == true
      && session.currentThreadSessionAccess?.isForeground == true
      && session.currentThreadSessionAccess?.scopes.contains("session:operate") == true
  }

  private var canMoveToWorktree: Bool {
    canOperateLifecycle
      && thread.status != "launching"
      && !lifecycle.isBusy
      && !worktreeMover.isMoving
  }

  private var handoffTarget: ThreadProviderHandoffTarget? {
    ThreadProviderHandoffPresentation.initialTarget(
      agents: session.state.replay.agentStatuses.ordered,
      sourceAgentKind: thread.agentKind,
      sourceMode: ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)
        ? .terminal : .gui
    )
  }

  private var handoffSummary: String? {
    let sourceLabel =
      session.state.replay.agentStatuses.ordered.first {
        $0.kind == thread.agentKind
      }?.label ?? thread.agentKind
    return ThreadProviderHandoffPresentation.transcriptSummary(
      items: handoffItems,
      terminalScrollback: terminalScrollback,
      sourceLabel: sourceLabel
    )
  }

  private var failureBinding: Binding<String?> {
    Binding(
      get: { failureMessage ?? worktreeMover.failureMessage },
      set: { if $0 == nil { clearFailure() } }
    )
  }

  private var worktreeContext: ThreadDetailWorktreeContext? {
    guard let path = thread.worktreePath?.trimmingCharacters(in: .whitespacesAndNewlines),
      !path.isEmpty,
      let branch = (thread.worktreeBranch ?? session.gitSummary(forThread: thread.id)?.branch)?
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !branch.isEmpty
    else { return nil }
    return ThreadDetailWorktreeContext(path: path, branch: branch)
  }

  private func activate() -> ThreadLifecycleTarget? {
    guard canOperateLifecycle,
      let target = session.threadLifecycleTarget(threadID: thread.id)
    else { return nil }
    lifecycle.activate(target)
    return target
  }

  private func perform(_ action: ThreadLifecycleMenuAction) {
    guard let target = activate() else { return }
    switch action {
    case .rename:
      renameIntent = ThreadRenameIntent(
        id: thread.id,
        thread: thread,
        target: target,
        title: thread.title
      )
    case .relaunch:
      relaunchIntent = ThreadRelaunchIntent(id: thread.id, thread: thread, target: target)
    case .setPinned(let pinned):
      Task { await lifecycle.setPinned(pinned, target: target) }
    case .setDone(let done):
      Task { await lifecycle.setDone(done, target: target) }
    case .acknowledge:
      Task { await lifecycle.acknowledge(target: target) }
    case .removeFromGroup:
      Task { await lifecycle.clearGroup(target: target) }
    case .archive:
      lifecycle.archive()
    case .unarchive:
      Task { await lifecycle.unarchive(target: target) }
    case .delete:
      lifecycle.delete()
    }
  }

  private func submitRename() {
    guard let intent = renameIntent,
      session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target
    else { return }
    let title = intent.title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else { return }
    lifecycle.activate(intent.target)
    renameIntent = nil
    Task { await lifecycle.rename(to: title, target: intent.target) }
  }

  private func submitRelaunch(intent: ThreadRelaunchIntent, prompt: String) {
    guard session.threadLifecycleTarget(threadID: intent.thread.id) == intent.target,
      let request = session.threadStartExistingRequest(
        threadID: intent.thread.id,
        prompt: prompt
      )
    else { return }
    lifecycle.activate(intent.target)
    Task { await lifecycle.start(request, target: intent.target) }
  }

  private func prepareHandoff(_ mode: ThreadProviderHandoffMode) {
    guard handoffTarget != nil, canOperateLifecycle else { return }
    let forksConversation = mode == .fork
    handoffIntent = ThreadProviderHandoffIntent(
      mode: mode,
      groupID: forksConversation ? thread.groupId ?? UUID().uuidString.lowercased() : nil,
      groupName: forksConversation ? thread.groupName ?? thread.title : nil
    )
  }

  private func finishHandoff(threadID: String, intent: ThreadProviderHandoffIntent) {
    handoffIntent = nil
    openedThreadID = threadID
    guard let target = activate() else { return }
    Task {
      switch intent.mode {
      case .fork:
        if thread.groupId == nil, let groupID = intent.groupID, let groupName = intent.groupName {
          await lifecycle.setGroup(id: groupID, name: groupName)
        }
      case .move:
        await lifecycle.setDone(true, target: target)
      }
      await session.refreshSnapshot()
    }
  }

  private func confirmMoveToWorktree(_ mode: ThreadWorktreeMoveMode) {
    worktreeMoveIntent = nil
    guard canMoveToWorktree else { return }
    Task {
      _ = await worktreeMover.move(
        session: session,
        thread: thread,
        project: project,
        mode: mode
      )
    }
  }

  private func consume(_ outcome: ThreadLifecycleOutcome?) {
    switch outcome {
    case .succeeded(let action):
      Task {
        await session.refreshSnapshot()
        if action == .archive || action == .delete { onThreadRemoved() }
      }
    case .failed(_, let failure):
      failureMessage = ThreadLifecycleStrings.failureMessage(failure)
    case nil:
      break
    }
  }

  private func clearFailure() {
    failureMessage = nil
    worktreeMover.clearFailure()
    lifecycle.clearLastOutcome()
  }
}
