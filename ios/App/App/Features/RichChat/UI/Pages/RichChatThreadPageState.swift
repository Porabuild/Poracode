import Observation
import SwiftUI

/// Owns controllers and transport lifecycle for one thread page. The SwiftUI
/// page remains a projection of this state while transport/background work is
/// kept out of its view body.
@MainActor
@Observable
final class RichChatThreadPageState {
  let suite: RichChatControllerSuite
  let providerUsageController: SettingsHostInformationController
  let fileMentionController: RichChatFileMentionController
  let find: RichChatFindState
  private(set) var draft: RichChatThreadDraftState
  /// User-saved per-agent visibility lists from the host settings document —
  /// the model picker's show/hide override. Empty until loaded; a failed load
  /// leaves the provider's advertised defaults in charge.
  private(set) var hiddenModels: [String: [String]] = [:]
  private(set) var galleryImages: [RichImagePresentation] = []
  private(set) var galleryVideos: [RichVideoPresentation] = []
  private(set) var composerFocusRevision = 0

  let session: AppSession
  private let threadID: String
  private let chatWindow: RichChatWindowSession?
  private let windowThread: RichChatWindowSession.Thread?
  let isAuxiliary: Bool
  let owningConnectionID: ClientConnectionID?
  private let retainsAuxiliaryState: Bool
  private let presentationOwner = UUID()
  private let visibilityDocument: SettingsDocumentController
  private var ownedGitInterest: GitStateInterest?
  private var heldDraftKey: RichChatComposerDraftKey?
  private var isMounted = false
  @ObservationIgnored private var mediaIndex = RichChatMediaIndex()

  init(session: AppSession, threadID: String, auxiliary: Bool = false, retainedSuite: RichChatControllerSuite? = nil,
       chatWindow: RichChatWindowSession? = nil) {
    self.session = session
    self.threadID = threadID
    isAuxiliary = auxiliary
    owningConnectionID = session.selectedConnectionId
    self.chatWindow = chatWindow
    let windowThread = session.selectedConnectionId.flatMap { connectionID in
      chatWindow?.acquire(thread: CompositeRemoteID(connectionId: connectionID, remoteId: threadID)) {
        session.makeRichChatControllerSuite()
      }
    }
    self.windowThread = windowThread
    find = windowThread?.find ?? RichChatFindState()
    retainsAuxiliaryState = auxiliary && retainedSuite != nil
    suite = retainedSuite ?? windowThread?.suite ?? session.makeRichChatControllerSuite()
    providerUsageController = SettingsHostInformationController(
      gateway: session.makeSettingsSessionGateway()
    )
    visibilityDocument = SettingsDocumentController(gateway: session.makeSettingsSessionGateway())
    fileMentionController = RichChatFileMentionController(session: session, threadID: threadID)
    draft = RichChatThreadDraftState(store: session.richChatComposerDrafts)
  }

  /// Reads the host settings document once so the saved visibility lists reach
  /// the composer's model picker. An unavailable document (offline, no lease)
  /// is not a failure — the provider's advertised defaults still apply.
  func loadVisibilityOverrides() async {
    guard owningConnectionID == session.selectedConnectionId, !session.state.liveLifecycle.isInBackground else { return }
    visibilityDocument.activate(session.currentSettingsHostSelection?.lease)
    await visibilityDocument.load()
    guard owningConnectionID == session.selectedConnectionId else { return }
    hiddenModels = visibilityDocument.document?.hiddenModels ?? [:]
  }

  var settingsRefreshKey: ComposerSettingsRefreshKey {
    .init(selection: session.currentSettingsHostSelection,
      revision: session.settingsDocumentChanges.revision(for: owningConnectionID),
      foreground: !session.state.liveLifecycle.isInBackground)
  }

  func activate() async {
    guard !Task.isCancelled else { return }
    isMounted = true
    guard let access = session.currentRichChatAccess else { return }
    guard access.lease.connectionID == owningConnectionID else {
      session.detachRichChatSuite(suite, owner: presentationOwner)
      return
    }
    let key = RichChatComposerDraftKey(
      connectionID: access.lease.connectionID,
      threadID: threadID
    )
    if heldDraftKey != key {
      releaseDraft()
      draft = session.richChatComposerDrafts.acquireState(for: key)
      heldDraftKey = key
    }
    draft.prepare(for: key, baseConfiguration: thread?.config)
    if draft.crews == nil { draft.crews = SavedCrewsController(gateway: session.makeSettingsSessionGateway()) }
    draft.crews?.activate(session.currentSettingsHostSelection)
    if draft.consumeQueuedSegments() { composerFocusRevision &+= 1 }
    let target = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    let wasLive = chatWindow != nil && session.activeRichChatSuite === suite
      && suite.scope.target == target && !suite.scope.isBackgrounded
    suite.select(access: access, threadID: threadID)
    updateGallery(suite.transcript.state.transcript?.itemsInOrder ?? [])
    if (retainsAuxiliaryState || chatWindow != nil), suite.scope.isBackgrounded { suite.leaveBackground(access: access) }
    session.attachRichChatSuite(suite, auxiliary: isAuxiliary, owner: presentationOwner)
    if let chatWindow, let windowThread { chatWindow.retain(windowThread) }
    if !isAuxiliary { activateGitInterest() }
    if isTerminal {
      await suite.terminal.ensureWatching(terminalID: threadID)
      return
    }
    switch (wasLive, suite.transcript.state.loadState) {
    case (true, .loaded), (true, .empty): return
    case (true, .loading): await suite.transcript.waitForCurrentHistoryRead()
    default:
      if access.controllerGate(.sessionRead) != nil, suite.transcript.state.transcript != nil { return }
      await suite.refreshAuthoritativeHistory()
    }
    if !Task.isCancelled, isMounted, suite.scope.target == target, !suite.scope.isBackgrounded,
      suite.transcript.state.loadState == .idle, let latest = session.currentRichChatAccess,
      latest.lease == target.lease, latest.controllerGate(.sessionRead) == nil {
      await suite.refreshAuthoritativeHistory()
    }
    if !Task.isCancelled, suite.scope.target == nil, let latestAccess = session.currentRichChatAccess,
      latestAccess.lease.connectionID == owningConnectionID {
      suite.select(access: latestAccess, threadID: threadID)
      session.attachRichChatSuite(suite, auxiliary: isAuxiliary, owner: presentationOwner)
      await suite.refreshAuthoritativeHistory()
    }
    guard !Task.isCancelled, suite.scope.target != nil else { return }
    if let projectLocation {
      await suite.checkpoints.load(projectLocation: projectLocation)
    }
  }

  var canDisplayHistory: Bool {
    session.phase != .connecting && suite.transcript.state.canDisplayHistory(for: session.currentRichChatAccess?.lease)
  }

  func refreshProviderUsage() async {
    guard ownsSelection else { providerUsageController.activate(nil); return }
    let lease = session.currentSettingsHostSelection?.lease
    providerUsageController.activate(lease)
    guard lease != nil else { return }
    await providerUsageController.refresh(.usage)
  }

  func updateGallery(_ items: [RichRuntimeItem]) {
    let media = mediaIndex.media(in: items)
    if galleryImages != media.images { galleryImages = media.images }
    if galleryVideos != media.videos { galleryVideos = media.videos }
  }

  func updateAccess() {
    guard isMounted else { return }
    guard ownsSelection, let access = session.currentRichChatAccess else {
      suite.deselect()
      return
    }
    if suite.scope.access?.lease == access.lease {
      let previouslyCouldRead = suite.scope.access.map { $0.controllerGate(.sessionRead) == nil } ?? false
      suite.updateAccess(access)
      if isTerminal {
        updateTerminalAccess(access)
      } else if !previouslyCouldRead, !suite.scope.isBackgrounded, access.controllerGate(.sessionRead) == nil {
        refreshAuthoritativeState()
      }
    } else {
      Task { if isMounted { await activate() } }
    }
  }

  func handleScenePhase(_ phase: ScenePhase) {
    guard isMounted, ownsSelection, let access = session.currentRichChatAccess else { return }
    if phase == .background {
      suite.enterBackground()
      Task { await suite.terminal.suspendTransport() }
    } else if phase == .active {
      suite.leaveBackground(access: access)
      Task { await refreshProviderUsage() }
      if isTerminal {
        Task { await suite.terminal.ensureWatching(terminalID: threadID) }
      } else {
        Task { await suite.refreshAuthoritativeHistory() }
      }
    }
  }

  func detach() {
    isMounted = false
    releaseDraft()
    session.detachRichChatSuite(suite, owner: presentationOwner,
      preservingState: retainsAuxiliaryState || chatWindow?.retains(windowThread) == true)
    if session.activeRichChatSuite === suite {
      ownedGitInterest = nil
    } else {
      releaseGitInterest()
    }
  }

  private func releaseDraft() {
    guard let heldDraftKey else { return }
    session.richChatComposerDrafts.releaseState(draft, for: heldDraftKey)
    self.heldDraftKey = nil
  }

  var thread: RemoteThread? {
    ownsSelection ? session.richChatThread(id: threadID) : nil
  }

  var dismissesOnCompletion: Bool {
    isMounted && ownsSelection && !isAuxiliary && chatWindow == nil
  }

  var project: RemoteProject? {
    guard let projectID = thread?.projectId else { return nil }
    return session.projects.first { $0.id == projectID }
  }

  var isTerminal: Bool {
    guard let thread else { return false }
    return ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)
  }

  var projectLocation: ProjectLocation? {
    ownsSelection ? session.richChatProjectLocation(threadID: threadID) : nil
  }

  var activeConfiguration: ThreadConfig {
    let owner = thread.map { ModelSelectionOwner(agentKind: $0.agentKind, agentInstanceID: $0.agentInstanceId,
      presentationMode: isTerminal ? .terminal : .gui) }
    return ModelSelectionBindings.validated(draft.configuration ?? thread?.config ?? .empty, owner: owner)
  }

  var config: [String: RichJSON] {
    activeConfiguration.richChatObject
  }

  var inspectorSavedCrews: [SavedCrew] {
    guard session.selectedConnectionId == owningConnectionID else { return [] }
    return draft.crews?.document?.savedCrews ?? visibilityDocument.document?.savedCrews ?? []
  }

  var agentStatus: AgentStatusRecord? {
    guard let agentKind = thread?.agentKind else { return nil }
    return ComposerProviderCatalog.inEnvironment(session.state.replay.agentStatuses.ordered, location: projectLocation).first {
      $0.kind == agentKind && $0.installed
    }
  }

  var providerUsagePresentation: RichChatProviderUsagePresentation {
    RichChatProviderUsagePresentation.resolve(
      agentKind: thread?.agentKind ?? "",
      agentInstanceID: thread?.agentInstanceId,
      label: agentStatus?.label,
      usage: providerUsageController.providerUsage
    )
  }

  var skillPickerContext: RichChatSkillPickerContext? {
    guard let project, let connectionID = session.selectedConnectionId else { return nil }
    return RichChatSkillPickerContext(
      session: session,
      projectIdentity: project.identity(on: connectionID),
      agentKind: thread?.agentKind ?? ""
    )
  }

  var canConfigureComposer: Bool {
    guard let thread else { return false }
    return thread.canResumeWithConfig == true || thread.status == "launching"
  }

  var sharedTreeThreadCount: Int {
    guard let thread else { return 0 }
    return (session.snapshot?.threads ?? []).count { candidate in
      candidate.id != thread.id
        && !candidate.isArchived
        && candidate.projectId == thread.projectId
        && (candidate.worktreePath ?? "") == (thread.worktreePath ?? "")
    }
  }

  var canOperate: Bool {
    ownsSelection
      && hasOperateAccess && !suite.requiresAuthoritativeRefresh
      && suite.conversation.state.activeMutation != .unload
  }

  var canOperateTerminal: Bool {
    ownsSelection && session.currentRichChatAccess.map { $0.controllerGate(.terminalOperate) == nil } == true
  }

  var canCloseThread: Bool {
    canOperate && thread != nil
      && suite.conversation.state.activeMutation == nil
      && !suite.conversation.state.isSending
      && suite.transcript.state.loadState != .loading
  }

  var canResolveRequests: Bool {
    ownsSelection && session.currentRichChatAccess.map { $0.controllerGate(.requestsResolve) == nil } == true
      && !suite.requiresAuthoritativeRefresh
  }

  private var hasOperateAccess: Bool {
    ownsSelection && session.currentRichChatAccess.map { $0.controllerGate(.sessionOperate) == nil } == true
  }

  private var ownsSelection: Bool {
    owningConnectionID != nil && session.selectedConnectionId == owningConnectionID
  }

  private func activateGitInterest() {
    guard let thread else { return }
    let interest = GitStateInterest.target(
      projectId: thread.projectId,
      worktreePath: thread.worktreePath,
      includePrDetails: true
    )
    ownedGitInterest = interest
    if !session.state.explicitGitInterests.contains(interest) {
      session.state.explicitGitInterests.append(interest)
    }
    session.scheduleGitStateInterestFlush()
  }

  private func releaseGitInterest() {
    guard let ownedGitInterest else { return }
    session.state.explicitGitInterests.removeAll { $0 == ownedGitInterest }
    self.ownedGitInterest = nil
    session.scheduleGitStateInterestFlush()
  }

  private func updateTerminalAccess(_ access: RichChatSessionAccess) {
    if access.controllerGate(.terminalRead) == nil {
      if suite.terminal.state.lifecycle == .inactive {
        Task { await suite.terminal.ensureWatching(terminalID: threadID) }
      }
    } else {
      Task { await suite.terminal.suspendTransport() }
    }
  }

  private func refreshAuthoritativeState() {
    Task {
      guard isMounted else { return }
      await suite.refreshAuthoritativeHistory()
      guard !Task.isCancelled, suite.scope.target != nil else { return }
      if let projectLocation {
        await suite.checkpoints.load(projectLocation: projectLocation)
      }
    }
  }

  /// Explicit draft insertion after reviewing the suggested command.
  func insertIntoComposerDraft(_ text: String) {
    let current = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
    draft.text = current.isEmpty ? text : current + "\n" + text
  }

  func recordRevertedPrompt(_ prompt: RichChatRevertedPrompt, target: RichChatThreadTarget) {
    let connectionID = target.lease.connectionID
    guard connectionID == owningConnectionID, target.threadID == threadID,
      session.state.hosts.contains(where: { $0.connectionId == connectionID })
    else { return }
    let key = RichChatComposerDraftKey(connectionID: connectionID, threadID: threadID)
    session.richChatComposerDrafts.enqueueRevertedPrompt(prompt, for: key)
  }

  var activationID: String {
    let lease = session.currentRichChatAccess?.lease
    return "\(lease?.connectionID.rawValue ?? "none"):\(lease?.generation ?? 0):\(threadID)"
  }

  /// Live session-action owner identity: every axis that distinguishes "the
  /// same live session this thread is showing". `status` is deliberately not
  /// an owner axis (working→idle is the same session) but is part of the
  /// refresh key so a structured session that arrives or replaces re-reads.
  var sessionActionOwner: RichChatSessionActionOwner? {
    guard let thread else { return nil }
    return RichChatSessionActionOwner(thread: thread)
  }

  var sessionActionRefreshKey: String {
    let owner = sessionActionOwner
    return [
      activationID,
      thread?.status ?? "",
      owner?.agentKind ?? "",
      owner?.agentInstanceID ?? "",
      owner?.presentationMode ?? "",
      owner?.sessionRefID ?? "",
      owner?.executionIdentity ?? "",
    ].joined(separator: "|")
  }
}

/// One retained primary conversation per Home window. Adaptive navigation can
/// mount several pages for it before the old pages have finished disappearing.
@MainActor final class RichChatWindowSession {
  @MainActor final class Thread {
    let id: CompositeRemoteID
    let find = RichChatFindState()
    let suite: RichChatControllerSuite

    init(id: CompositeRemoteID, suite: RichChatControllerSuite) {
      self.id = id
      self.suite = suite
    }
  }

  private final class StagedThread {
    weak var thread: Thread?

    init(_ thread: Thread) { self.thread = thread }
  }

  private var retained: Thread?
  private var staged: [CompositeRemoteID: StagedThread] = [:]

  func acquire(thread id: CompositeRemoteID, makeSuite: () -> RichChatControllerSuite) -> Thread {
    if let retained, retained.id == id { return retained }
    if let thread = staged[id]?.thread { return thread }
    staged = staged.filter { $0.value.thread != nil }
    let thread = Thread(id: id, suite: makeSuite())
    staged[id] = StagedThread(thread)
    return thread
  }

  func retain(_ thread: Thread) {
    if let retained, retained !== thread { retained.find.close() }
    retained = thread
  }

  func retire(_ id: CompositeRemoteID, presentedBy suite: RichChatControllerSuite?) -> Bool {
    // A fork or provider handoff can be displayed above the Home detail.
    guard let retained, retained.id == id, retained.suite === suite else { return false }
    staged.removeValue(forKey: id)
    retained.find.close()
    self.retained = nil
    return true
  }

  func retains(_ thread: Thread?) -> Bool { thread != nil && retained === thread }
}
