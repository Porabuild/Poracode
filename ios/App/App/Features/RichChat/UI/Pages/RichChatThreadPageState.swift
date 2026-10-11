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
  let draft: RichChatThreadDraftState
  /// User-saved per-agent visibility lists from the host settings document —
  /// the model picker's show/hide override. Empty until loaded; a failed load
  /// leaves the provider's advertised defaults in charge.
  private(set) var hiddenModels: [String: [String]] = [:]

  private let session: AppSession
  private let threadID: String
  private let visibilityDocument: SettingsDocumentController
  private var ownedGitInterest: GitStateInterest?

  init(session: AppSession, threadID: String) {
    self.session = session
    self.threadID = threadID
    suite = session.makeRichChatControllerSuite()
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
    visibilityDocument.activate(session.currentSettingsHostSelection?.lease)
    guard visibilityDocument.document == nil else {
      hiddenModels = visibilityDocument.document?.hiddenModels ?? [:]
      return
    }
    await visibilityDocument.load()
    hiddenModels = visibilityDocument.document?.hiddenModels ?? [:]
  }

  func activate() async {
    guard let access = session.currentRichChatAccess else { return }
    draft.prepare(
      for: RichChatComposerDraftKey(
        connectionID: access.lease.connectionID,
        threadID: threadID
      ),
      baseConfiguration: thread?.config
    )
    suite.select(access: access, threadID: threadID)
    session.attachRichChatSuite(suite)
    activateGitInterest()
    if isTerminal {
      await suite.terminal.watch(terminalID: threadID)
      return
    }
    await suite.refreshAuthoritativeHistory()
    if let projectLocation {
      await suite.checkpoints.load(projectLocation: projectLocation)
    }
  }

  func refreshProviderUsage() async {
    let lease = session.currentSettingsHostSelection?.lease
    providerUsageController.activate(lease)
    guard lease != nil else { return }
    await providerUsageController.refresh(.usage)
  }

  func updateAccess() {
    guard let access = session.currentRichChatAccess else {
      suite.deselect()
      return
    }
    if suite.scope.access?.lease == access.lease {
      let becameOnline = suite.scope.access?.isOnline != true && access.isOnline
      suite.updateAccess(access)
      if isTerminal {
        updateTerminalAccess(access)
      } else if becameOnline, access.controllerGate(.sessionRead) == nil {
        refreshAuthoritativeState()
      }
    } else {
      Task { await activate() }
    }
  }

  func handleScenePhase(_ phase: ScenePhase) {
    guard let access = session.currentRichChatAccess else { return }
    if phase == .background {
      suite.enterBackground()
      Task { await suite.terminal.suspendTransport() }
    } else if phase == .active {
      suite.leaveBackground(access: access)
      Task { await refreshProviderUsage() }
      if isTerminal {
        Task { await suite.terminal.watch(terminalID: threadID) }
      } else {
        Task { await suite.refreshAuthoritativeHistory() }
      }
    }
  }

  func detach() {
    draft.park()
    releaseGitInterest()
    session.detachRichChatSuite(suite)
  }

  private var thread: RemoteThread? {
    session.richChatThread(id: threadID)
  }

  private var isTerminal: Bool {
    guard let thread else { return false }
    return ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)
  }

  private var projectLocation: ProjectLocation? {
    session.richChatProjectLocation(threadID: threadID)
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
        Task { await suite.terminal.watch(terminalID: threadID) }
      }
    } else {
      Task { await suite.terminal.suspendTransport() }
    }
  }

  private func refreshAuthoritativeState() {
    Task {
      await suite.refreshAuthoritativeHistory()
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

  private var activationID: String {
    let lease = session.currentRichChatAccess?.lease
    return "\(lease?.connectionID.rawValue ?? "none"):\(lease?.generation ?? 0):\(threadID)"
  }

  /// Live session-action owner identity: every axis that distinguishes "the
  /// same live session this thread is showing". `status` is deliberately not
  /// an owner axis (working→idle is the same session) but is part of the
  /// refresh key so a structured session that arrives or replaces re-reads.
  var sessionActionOwner: RichChatSessionActionOwner? {
    guard let thread else { return nil }
    return RichChatSessionActionOwner(
      threadID: thread.id,
      agentKind: thread.agentKind,
      agentInstanceID: thread.agentInstanceId,
      presentationMode: thread.presentationMode,
      sessionRefID: thread.sessionRef?.providerSessionID,
      executionIdentity: thread.sessionRef?.executionIdentity
    )
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
