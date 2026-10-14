import Foundation

extension AppSession {
  /// Builds the `thread-start-existing` request for a relaunch the user just
  /// asked for.
  ///
  /// The request is derived entirely from the authoritative snapshot: the
  /// thread must still exist, and its real execution location — the project
  /// root, or the worktree overlay when the thread runs in one — must be
  /// derivable. When it is not, this returns `nil` so the action stays
  /// unavailable instead of starting a runtime in the wrong directory.
  func threadStartExistingRequest(
    threadID: String,
    prompt: String
  ) -> ThreadStartExistingRequest? {
    let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !threadID.isEmpty, !trimmedPrompt.isEmpty,
      let thread = richChatThread(id: threadID),
      let location = richChatProjectLocation(threadID: threadID)
    else { return nil }

    return ThreadStartExistingRequest(
      threadID: thread.id,
      projectLocation: ThreadProjectLocation(location),
      agentKind: thread.agentKind,
      config: thread.config.lifecycleLaunchConfiguration,
      agentInstanceID: thread.agentInstanceId,
      prompt: trimmedPrompt,
      presentationMode: thread.presentationMode.flatMap(
        ThreadPresentationMode.init(rawValue:)
      )
    )
  }
}
