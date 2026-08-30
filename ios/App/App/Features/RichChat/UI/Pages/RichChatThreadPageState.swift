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

  private let session: AppSession
  private let threadID: String
  private var ownedGitInterest: GitStateInterest?

  init(session: AppSession, threadID: String) {
    self.session = session
    self.threadID = threadID
    suite = session.makeRichChatControllerSuite()
    providerUsageController = SettingsHostInformationController(
      gateway: session.makeSettingsSessionGateway()
    )
    fileMentionController = RichChatFileMentionController(session: session, threadID: threadID)
    draft = RichChatThreadDraftState(store: session.richChatComposerDrafts)
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
}
