import SwiftUI

extension AppSession {
  /// Called only after the bounded catalog accepted this exact row/sequence,
  /// so a foreign provider or stale socket frame cannot relaunch the chat.
  func receiveRichChatLaunchState(_ object: [String: JSONValue], sequence: Int) {
    guard let id = object["threadId"]?.stringValue, let row = richChatThread(id: id) else { return }
    for suite in attachedRichChatSuites {
      guard let target = suite.scope.target, target.threadID == id,
        currentRichChatAccess?.lease == target.lease, !suite.scope.isBackgrounded else { continue }
      suite.runtimeLaunch.receive(object, sequence: sequence, thread: row)
    }
  }
}

extension RichChatThreadPageState {
  var crewRuntimeCandidate: CrewRuntimeRelaunch? {
    guard let thread, thread.status == "idle", let launch = suite.runtimeLaunch.snapshot,
      ThreadCrewBinding(wire: activeConfiguration.crew) != nil else { return nil }
    let state = suite.transcript.state
    let loaded = state.loadState == .loaded || state.loadState == .empty
    let capabilities = agentStatus.map { HomeComposerCatalog.capabilities(for: $0, presentationMode: .gui) } ?? [:]
    return CrewRuntimeRelaunchPlanner.candidate(target: suite.scope.target, thread: thread,
      configuration: activeConfiguration, launch: launch, capabilities: capabilities,
      canOperate: canOperate, isBusy: suite.conversation.state.isSending || suite.conversation.state.activeMutation != nil,
      hasLoadedHistory: loaded, pendingSteer: state.pendingSteer != nil, queuedFollowUp: state.followUpQueue != nil,
      openRequest: state.transcript?.openRequests.isEmpty != true,
      activeSubAgent: !RichChatPresentation.activeDelegatedAgents(in: state.transcript?.itemsInOrder ?? []).isEmpty)
  }

  func relaunchCrewRuntime(_ candidate: CrewRuntimeRelaunch) async {
    guard candidate == crewRuntimeCandidate, session.currentRichChatAccess?.lease == candidate.target.lease,
      suite.runtimeLaunch.reserve(candidate) else { return }
    _ = await suite.conversation.unloadForRelaunch()
  }
}

struct CrewSessionRelaunchPresentation: ViewModifier {
  let state: RichChatThreadPageState

  func body(content: Content) -> some View {
    content.onChange(of: state.crewRuntimeCandidate, initial: true) { _, candidate in
      if let candidate { Task { await state.relaunchCrewRuntime(candidate) } }
    }
  }
}
