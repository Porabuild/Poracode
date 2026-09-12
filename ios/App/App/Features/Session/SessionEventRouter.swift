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
        if let openThreadId = host.state.openThreadId,
           host.state.hydrationBuffer.isActive,
           host.state.hydrationBuffer.threadId == openThreadId {
            let batches = RuntimeEventReducer.collectRuntimeEvents(from: event)
            let touchesOpen = batches.contains { $0.threadId == openThreadId }
            if touchesOpen,
               host.state.hydrationBuffer.bufferIfHydrating(
                   threadId: openThreadId,
                   workGeneration: host.state.workGeneration,
                   seq: seq,
                   event: event
               ) {
                if RuntimeEventReducer.shouldRefreshShell(from: event) {
                    host.live.scheduleShellRefresh()
                }
                noteAppliedSeq(seq)
                return true
            }
        }
        applyLiveEvent(event)
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
            isThreadOpen: host.state.openThreadId == notification.threadId
        )
    }

    /// Mirrors the socket's applied cursor into the host state and the selected
    /// pool slot so eviction, host reselection, and background reconnects resume
    /// from the freshest applied seq instead of a stale baseline.
    private func noteAppliedSeq(_ seq: Int) {
        host.state.lastSeenSeq = seq
        host.sessionPool.noteSelectedHostAppliedSeq(seq)
    }

    func applyLiveEvent(_ event: JSONValue) {
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: event)
        if !batches.isEmpty {
            for batch in batches {
                guard batch.threadId == host.state.openThreadId else { continue }
                RuntimeEventReducer.apply(events: batch.events, to: &host.state.threadItems)
                for ev in batch.events {
                    RuntimeEventReducer.applyDomain(
                        event: ev,
                        threadId: batch.threadId,
                        domain: &host.state.threadDomain
                    )
                    RuntimeEventReducer.applyRequestEvent(
                        event: ev,
                        threadId: batch.threadId,
                        to: &host.state.openRuntimeRequests
                    )
                }
                if host.state.threadLoadState == .empty || host.state.threadLoadState == .loading {
                    host.state.threadLoadState =
                        host.state.threadItems.isEmpty ? .empty : .loaded
                }
            }
            if RuntimeEventReducer.shouldRefreshOpenThreadMetadata(from: event) {
                host.threads.scheduleOpenThreadMetadataRefresh()
            }
            if RuntimeEventReducer.shouldRefreshShell(from: event) {
                host.live.scheduleShellRefresh()
            }
            return
        }

        guard case .object(let object) = event else { return }
        let type = object["type"]?.stringValue

        if type == "remote-projects-changed" || type == "remote-threads-changed" {
            host.live.scheduleShellRefresh()
            return
        }

        guard let openThreadId = host.state.openThreadId else {
            if type == "thread-state"
                || type?.hasPrefix("turn.") == true
                || type?.hasPrefix("session.") == true {
                host.live.scheduleShellRefresh()
            }
            return
        }
        let threadId = object["threadId"]?.stringValue
            ?? object["thread"]?.objectValue?["id"]?.stringValue
        guard threadId == nil || threadId == openThreadId else {
            if type == "thread-state"
                || type == "remote-threads-changed"
                || type?.hasPrefix("turn.") == true
                || type?.hasPrefix("session.") == true {
                host.live.scheduleShellRefresh()
            }
            return
        }

        // Non-canonical flat item / runtimeItem path is quarantined.

        if type == "thread-state"
            || type?.hasPrefix("turn.") == true
            || type?.hasPrefix("session.") == true
            || type == "error"
            || type == "warning"
            || type?.hasPrefix("request.") == true {
            if type == "error" {
                let message = object["message"]?.stringValue ?? "Runtime error"
                let synthetic = RuntimeEventReducer.RuntimeEvent(
                    type: "error",
                    threadId: openThreadId,
                    itemId: nil,
                    itemType: nil,
                    state: nil,
                    stream: nil,
                    delta: nil,
                    payload: nil,
                    payloadSpecified: false,
                    parentItemId: nil,
                    requestId: nil,
                    requestType: nil,
                    message: message,
                    raw: object
                )
                RuntimeEventReducer.apply(event: synthetic, to: &host.state.threadItems)
                if host.state.threadLoadState == .empty {
                    host.state.threadLoadState = .loaded
                }
            }
            if type?.hasPrefix("request.") == true,
               let parsed = RuntimeEventReducer.collectRuntimeEvents(
                from: .object([
                    "type": .string("thread-runtime-event"),
                    "threadId": .string(openThreadId),
                    "event": .object(object),
                ])
               ).first?.events.first {
                RuntimeEventReducer.applyRequestEvent(
                    event: parsed,
                    threadId: openThreadId,
                    to: &host.state.openRuntimeRequests
                )
            } else if type?.hasPrefix("request.") == true {
                let ev = RuntimeEventReducer.RuntimeEvent(
                    type: type ?? "request",
                    threadId: openThreadId,
                    itemId: nil,
                    itemType: nil,
                    state: nil,
                    stream: nil,
                    delta: nil,
                    payload: object["payload"],
                    payloadSpecified: object.keys.contains("payload"),
                    parentItemId: nil,
                    requestId: object["requestId"]?.stringValue,
                    requestType: object["requestType"]?.stringValue,
                    message: nil,
                    raw: object
                )
                RuntimeEventReducer.applyRequestEvent(
                    event: ev,
                    threadId: openThreadId,
                    to: &host.state.openRuntimeRequests
                )
            }
            host.threads.scheduleOpenThreadMetadataRefresh()
            host.live.scheduleShellRefresh()
        }
    }
}
