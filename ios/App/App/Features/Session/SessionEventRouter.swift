import Foundation

/// Routes live WebSocket frames into shell refresh / thread reducer state.
@MainActor
struct SessionEventRouter {
    unowned let host: AppSession

    func handleServerMessage(_ message: RemoteWebSocketServerMessage) {
        if !host.state.resyncCoordinator.allowsLiveEvents {
            if case .resyncRequired(let seq, _) = message {
                host.state.lastSeenSeq = seq
            }
            return
        }
        switch message {
        case .ready(let seq):
            // The server emits ready before replaying buffered events. Preserve
            // that boundary so historical notifications advance without alerting.
            host.state.socketReplayCeiling = seq
            host.scheduleInterestFlushAfterReady()
        case .event(let seq, let event):
            _ = applySequencedEvent(seq: seq, event: event)
        case .resyncRequired(let seq, _):
            host.state.lastSeenSeq = seq
        case .pong, .terminalOutput, .unknown:
            break
        }
    }

    /// Applies one contiguous sequenced event and reports whether the socket may
    /// advance its cursor. `false` means nothing was mutated.
    @discardableResult
    func applySequencedEvent(seq: Int, event: JSONValue) -> Bool {
        guard host.state.resyncCoordinator.allowsLiveEvents else { return false }
        do {
            if let notification = try RemoteUserNotificationEvent.decodeIfPresent(event) {
                host.receiveRichChatSupervisoryEvent(event, sequence: seq)
                present(notification, seq: seq)
                noteAppliedSeq(seq)
                return true
            }
        } catch {
            // A known notification with a malformed body must not advance the cursor.
            return false
        }
        switch SessionReplayEventRouter(host: host).route(seq: seq, event: event) {
        case .rejected:
            return false
        case .applied:
            // Supervisory mirror still observes every accepted frame.
            host.receiveRichChatSupervisoryEvent(event, sequence: seq)
            noteAppliedSeq(seq)
            return true
        case .notReplayEvent:
            break
        }
        host.receiveRichChatSupervisoryEvent(event, sequence: seq)
        applyLiveEvent(event, seq: seq)
        noteAppliedSeq(seq)
        return true
    }

    private func present(_ notification: RemoteUserNotificationEvent, seq: Int) {
        guard let connectionId = host.state.selectedConnectionId,
              let desktopId = host.state.profile?.desktopId
        else { return }
        let route = NotificationRoute(
            version: NotificationRoute.version,
            clientConnectionId: connectionId,
            desktopId: desktopId,
            threadId: notification.threadId
        )
        host.remoteNotificationPresentations.receive(
            notification,
            route: route,
            isReplay: seq <= host.state.socketReplayCeiling,
            isThreadOpen: host.activeRichChatSuite?.scope.threadID == notification.threadId
        )
    }

    /// Mirrors the socket's applied cursor into the host state and the selected
    /// pool slot so eviction, host reselection, and background reconnects resume
    /// from the freshest applied seq instead of a stale baseline.
    private func noteAppliedSeq(_ seq: Int) {
        host.state.lastSeenSeq = seq
        host.sessionPool.noteSelectedHostAppliedSeq(seq)
    }

    /// Catalog-level live events only. RichChat runtime payloads are routed by
    /// `receiveRichChatSupervisoryEvent` before this; the legacy open-thread
    /// item/domain projection was removed with the legacy thread surface.
    func applyLiveEvent(_ event: JSONValue, seq: Int) {
        guard case .object(let object) = event else { return }
        let type = object["type"]?.stringValue

        if type == "remote-projects-changed" || type == "remote-threads-changed" {
            host.catalog.onMembershipEvent(
                threads: true, projects: type == "remote-projects-changed"
            )
            return
        }
        if type == "thread-state" {
            // In-place row update under the per-row applied-seq guard; unknown
            // rows fall back to a coalesced catalog pass.
            _ = host.catalog.applyThreadStateEvent(object, seq: seq)
            return
        }
    }
}
