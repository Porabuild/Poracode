import SwiftUI

struct RichChatThreadView: View {
  @Bindable var session: AppSession
  let threadID: String
  let title: String

  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.dismiss) private var dismiss
  @State private var suite: RichChatControllerSuite
  @State private var draft = ""
  @State private var attachments: [RichChatUploadedAttachment] = []
  @State private var isConfirmingClose = false

  init(session: AppSession, threadID: String, title: String) {
    self.session = session
    self.threadID = threadID
    self.title = title
    _suite = State(initialValue: session.makeRichChatControllerSuite())
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
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        NavigationLink {
          AdvancedOperationsSessionView(session: session, surface: .thread(threadID: threadID))
        } label: {
          Label(
            AdvancedOperationsStrings.openFromThread,
            systemImage: "slider.horizontal.3"
          )
          .labelStyle(.iconOnly)
        }
        .disabled(!canOpenAdvancedOperations)
        .accessibilityLabel(AdvancedOperationsStrings.openFromThread)
      }
      if !isTerminal {
        ToolbarItem(placement: .topBarTrailing) {
          Button(RichChatStrings.refreshTranscript, systemImage: "arrow.clockwise") {
            Task { await suite.refreshAuthoritativeHistory() }
          }
          .labelStyle(.iconOnly)
          .disabled(suite.transcript.state.loadState == .loading)
        }
      }
      // A shell started here runs where this thread runs: the worktree overlay
      // when the thread has one, otherwise the project root.
      if !isTerminal, let projectLocation {
        ToolbarItem(placement: .topBarTrailing) {
          NavigationLink {
            ProjectShellTerminalView(
              session: session,
              projectLocation: projectLocation,
              worktreePath: thread?.worktreePath
            )
          } label: {
            Label(TerminalStrings.shellOpen, systemImage: "terminal")
              .labelStyle(.iconOnly)
          }
          .accessibilityLabel(TerminalStrings.shellOpen)
        }
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button(RichChatStrings.closeThread, systemImage: "xmark.circle", role: .destructive) {
          isConfirmingClose = true
        }
        .labelStyle(.iconOnly)
        .disabled(!canCloseThread)
        .accessibilityLabel(RichChatStrings.closeThread)
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
      dismiss()
    }
    .task(id: activationID) { await activate() }
    .onChange(of: session.phase) { updateAccess() }
    .onChange(of: session.socketState) { updateAccess() }
    .onChange(of: scenePhase) { _, phase in handleScenePhase(phase) }
    .onDisappear { session.detachRichChatSuite(suite) }
  }

  private var guiContent: some View {
    VStack(spacing: 0) {
      RichChatStatusView(suite: suite, canOperate: hasOperateAccess)
      Divider()
      GeometryReader { proxy in
        if proxy.size.width >= 760 {
          HStack(spacing: 0) {
            transcriptContent.frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            ScrollView {
              RichChatControlPanel(
                suite: suite,
                projectLocation: projectLocation,
                config: config,
                canOperate: canOperate,
                canResolveRequests: canResolveRequests
              )
              .padding(12)
            }
            .frame(width: min(350, proxy.size.width * 0.36))
          }
        } else {
          VStack(spacing: 0) {
            ScrollView(.vertical, showsIndicators: false) {
              RichChatControlPanel(
                suite: suite,
                projectLocation: projectLocation,
                config: config,
                canOperate: canOperate,
                canResolveRequests: canResolveRequests
              )
              .frame(width: max(300, proxy.size.width - 24))
              .padding(.horizontal, 12)
              .padding(.vertical, 7)
            }
            .frame(maxHeight: 250)
            Divider()
            transcriptContent
          }
        }
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      RichChatComposerView(
        draft: $draft,
        attachments: $attachments,
        canOperate: canOperate,
        isWorking: suite.transcript.state.transcript?.openTurn == true || threadIsWorking,
        controller: suite.conversation,
        mediaController: suite.media,
        config: config
      )
    }
  }

  @ViewBuilder
  private var transcriptContent: some View {
    switch suite.transcript.state.loadState {
    case .idle, .loading:
      LoadingStateView(message: RichChatStrings.loadingTranscript)
    case .empty:
      ContentUnavailableView {
        Label(RichChatStrings.emptyTranscript, systemImage: "text.bubble")
      } description: {
        Text(RichChatStrings.emptyTranscriptMessage)
      }
    case .failed(let failure):
      ErrorStateView(message: RichChatStrings.failure(failure), retryTitle: RichChatStrings.retry) {
        Task { await suite.refreshAuthoritativeHistory() }
      }
    case .loaded:
      RichChatTimelineView(
        controller: suite.transcript,
        mediaController: suite.media,
        conversation: suite.conversation,
        canOperate: canOperate,
        isRefreshing: suite.transcript.state.loadState == .loading
      )
    }
  }

  private var thread: RemoteThread? { session.richChatThread(id: threadID) }
  private var isTerminal: Bool {
    guard let mode = thread?.presentationMode else { return false }
    return !ThreadPresentationFilter.isGUIPresentation(mode)
  }
  private var threadIsWorking: Bool {
    guard let status = thread?.status else { return false }
    return ["working", "launching", "needs_reply"].contains(status)
  }
  private var config: [String: RichJSON] { session.richChatInputConfig(threadID: threadID) }
  private var projectLocation: ProjectLocation? {
    session.richChatProjectLocation(threadID: threadID)
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
  /// The entry is offered only when this thread still exists on the selected
  /// host. The owner itself is derived inside the composition from the current
  /// authoritative snapshot, never from this view.
  private var canOpenAdvancedOperations: Bool {
    session.currentRichChatAccess != nil && thread != nil
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

  private func activate() async {
    guard let access = session.currentRichChatAccess else { return }
    suite.select(access: access, threadID: threadID)
    session.attachRichChatSuite(suite)
    if isTerminal {
      await suite.terminal.watch(terminalID: threadID)
      return
    }
    await suite.refreshAuthoritativeHistory()
    if let projectLocation { await suite.checkpoints.load(projectLocation: projectLocation) }
  }

  private func updateAccess() {
    guard let access = session.currentRichChatAccess else {
      suite.deselect()
      return
    }
    if suite.scope.access?.lease == access.lease {
      let becameOnline = suite.scope.access?.isOnline != true && access.isOnline
      suite.updateAccess(access)
      if isTerminal {
        if access.controllerGate(.terminalRead) == nil {
          if suite.terminal.state.lifecycle == .inactive {
            Task { await suite.terminal.watch(terminalID: threadID) }
          }
        } else {
          Task { await suite.terminal.suspendTransport() }
        }
      } else if becameOnline, access.controllerGate(.sessionRead) == nil {
        Task {
          await suite.refreshAuthoritativeHistory()
          if let projectLocation { await suite.checkpoints.load(projectLocation: projectLocation) }
        }
      }
    } else {
      Task { await activate() }
    }
  }

  private func handleScenePhase(_ phase: ScenePhase) {
    guard let access = session.currentRichChatAccess else { return }
    if phase == .background {
      suite.enterBackground()
      Task { await suite.terminal.suspendTransport() }
    } else if phase == .active {
      suite.leaveBackground(access: access)
      if isTerminal {
        Task { await suite.terminal.watch(terminalID: threadID) }
      } else {
        Task { await suite.refreshAuthoritativeHistory() }
      }
    }
  }
}
