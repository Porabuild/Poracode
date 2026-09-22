import Foundation

/// Interest flushing for the live connection: per-thread runtime-item interests
/// (RichChat suite attach/detach and socket `ready`) and Git-state interests.
///
/// Kept in its own file so `LiveConnectionController` stays focused on bootstrap,
/// snapshot install, and scene-phase recovery.
@MainActor
extension AppSession {
    /// Pushes the desired runtime-item interest set to the current socket only.
    /// Identity-safe: a superseded ordinal or a replaced socket drops, and the
    /// replacement is re-flushed from the latest desired set. Moved verbatim
    /// from the removed legacy `ThreadController`; the flush itself is live.
    func flushThreadItemInterests(threadIds: [String]) async {
        let socket = state.webSocket
        let socketID = socket.map { ObjectIdentifier($0 as AnyObject) }
        let update = state.interestCoordinator.enqueue(
            threadIds: threadIds,
            socketObjectID: socketID
        )
        guard let socket else { return }
        guard state.interestCoordinator.shouldApply(update, activeSocketObjectID: socketID)
        else { return }
        await socket.setThreadItemInterests(update.threadIds)
        let activeID = state.webSocket.map { ObjectIdentifier($0 as AnyObject) }
        guard state.interestCoordinator.shouldApply(update, activeSocketObjectID: activeID)
        else {
            if let active = state.webSocket {
                await active.setThreadItemInterests(state.interestCoordinator.latestDesired)
            }
            return
        }
    }
}

@MainActor
extension LiveConnectionController {
    /// Recomputes the desired Git-state interest set and pushes it to the current
    /// socket only. Identity-safe: a superseded ordinal or a replaced socket drops.
    func flushGitStateInterests(generation gen: Int) async {
        guard gen == host.state.workGeneration,
              !host.state.liveLifecycle.isInBackground,
              let socket = host.state.webSocket
        else { return }
        let socketID = ObjectIdentifier(socket as AnyObject)
        let desired = GitStateInterestPlanner.desired(
            snapshot: host.state.snapshot,
            // The legacy open-thread selection priority is gone; the open
            // RichChat page contributes its target through
            // `explicitGitInterests` (see `RichChatThreadPageState`).
            selectedThreadId: nil,
            explicit: host.state.explicitGitInterests,
            isOnline: host.state.canRead
        )
        let update = host.state.gitInterestCoordinator.enqueue(
            interests: desired,
            socketObjectID: socketID
        )
        let isCurrentUpdate = host.state.gitInterestCoordinator.shouldApply(
            update,
            activeSocketObjectID: socketID
        )
        guard isCurrentUpdate else { return }
        guard gen == host.state.workGeneration,
              let current = host.state.webSocket,
              ObjectIdentifier(current as AnyObject) == socketID
        else { return }
        await current.setGitStateInterests(update.interests)
    }
}
