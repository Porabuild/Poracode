import Foundation

/// Git-state interest flushing for the live connection.
///
/// Kept in its own file so `LiveConnectionController` stays focused on bootstrap,
/// snapshot install, and scene-phase recovery.
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
            selectedThreadId: host.state.openThreadId,
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
