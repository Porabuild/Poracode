import Foundation

/// Owns pending gates and transactional shell (+ optional open history) resync.
///
/// Attempt identity is separate from retry scheduling so a canceled attempt A
/// cannot `noteFailure` / cancel newer attempt B, and a normal failure does not
/// self-cancel the currently executing task.
@MainActor
struct ResyncEngine {
    unowned let host: AppSession

    func trigger(reason: String = "test") {
        // Cancel only the previous attempt task — never the retry scheduler of a peer.
        host.scheduleResyncRun(reason: reason)
    }

    func run(reason: String) async {
        _ = reason
        let workGen = host.state.workGeneration
        let action = host.state.resyncCoordinator.noteNeedsResync()
        switch action {
        case .alreadyInFlight, .idle, .dropLiveEvent, .reconnect, .retryAfterFailure:
            return
        case .beginRefresh:
            break
        }

        host.state.resyncAttemptId &+= 1
        let attemptId = host.state.resyncAttemptId
        host.state.isResyncing = true
        defer {
            // Only clear isResyncing if we still own this attempt.
            if host.state.resyncAttemptId == attemptId {
                host.state.isResyncing = false
            }
        }

        func isCurrentAttempt() -> Bool {
            host.state.resyncAttemptId == attemptId
                && workGen == host.state.workGeneration
                && !host.state.liveLifecycle.isInBackground
        }

        // Capture socket identity at start — never resume a replacement socket later.
        let capturedSocket = host.state.webSocket
        let capturedSocketID = capturedSocket.map { ObjectIdentifier($0 as AnyObject) }

        guard workGen == host.state.workGeneration, !Task.isCancelled else {
            await releaseTerminal(
                attemptId: attemptId,
                workGen: workGen,
                capturedSocket: capturedSocket,
                capturedSocketID: capturedSocketID,
                outcome: .cancelled
            )
            return
        }

        if host.state.liveLifecycle.isInBackground {
            await releaseTerminal(
                attemptId: attemptId,
                workGen: workGen,
                capturedSocket: capturedSocket,
                capturedSocketID: capturedSocketID,
                outcome: .background
            )
            return
        }

        guard let api = host.state.api else {
            guard isCurrentAttempt() else { return }
            _ = host.state.resyncCoordinator.noteFailure()
            // Failure keeps pending; socket stays gated until retry success/abort.
            scheduleRetry(forAttempt: attemptId, workGeneration: workGen)
            return
        }

        let apiEndpoint = await api.httpEndpoint
        let openId = host.state.openThreadId
        let openEpoch = host.state.openThreadEpoch

        do {
            let snap = try await api.snapshot()
            // Decode the additive Git fields before anything is committed. A
            // malformed field is a host failure (retried), never a partial install.
            let preparedReplay = try HostSnapshotInstall.prepare(
                shell: snap,
                existing: host.state.replay
            )
            try Task.checkCancellation()
            guard host.state.resyncAttemptId == attemptId,
                  workGen == host.state.workGeneration
            else {
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: .stale
                )
                return
            }

            if host.state.liveLifecycle.isInBackground {
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: .background
                )
                return
            }

            var history: RemoteThreadSnapshot?
            if let openId {
                history = try await host.threads.fetchThreadHistory(id: openId)
                try Task.checkCancellation()
                guard host.state.resyncAttemptId == attemptId,
                      workGen == host.state.workGeneration
                else {
                    await releaseTerminal(
                        attemptId: attemptId,
                        workGen: workGen,
                        capturedSocket: capturedSocket,
                        capturedSocketID: capturedSocketID,
                        outcome: .stale
                    )
                    return
                }
            }

            let currentEndpoint: String?
            if let active = host.state.api {
                currentEndpoint = await active.httpEndpoint
            } else {
                currentEndpoint = nil
            }
            let currentSocketID = host.state.webSocket.map { ObjectIdentifier($0 as AnyObject) }
            let transaction = ResyncTransaction(
                workGeneration: workGen,
                openThreadId: openId,
                openThreadEpoch: openEpoch,
                apiEndpoint: apiEndpoint,
                socketObjectID: capturedSocketID,
                shell: snap,
                history: history
            )
            let decision = HostResyncPolicy.commitDecision(
                transaction: transaction,
                currentWorkGeneration: host.state.workGeneration,
                currentOpenThreadId: host.state.openThreadId,
                currentOpenThreadEpoch: host.state.openThreadEpoch,
                currentAPIEndpoint: currentEndpoint,
                currentSocketObjectID: currentSocketID,
                isCancelled: Task.isCancelled
                    || host.state.liveLifecycle.isInBackground
                    || host.state.resyncAttemptId != attemptId
            )

            switch decision {
            case .abortStale:
                // Must not partially commit shell/history/cursor.
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: .stale
                )
                return
            case .abortCancelled:
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: host.state.liveLifecycle.isInBackground ? .background : .cancelled
                )
                return
            case .commit(let reconnectSeq, let installHistory):
                guard host.state.resyncAttemptId == attemptId,
                      workGen == host.state.workGeneration
                else {
                    await releaseTerminal(
                        attemptId: attemptId,
                        workGen: workGen,
                        capturedSocket: capturedSocket,
                        capturedSocketID: capturedSocketID,
                        outcome: .stale
                    )
                    return
                }

                host.state.historyLoadGeneration += 1
                host.state.hydrationBuffer.discard()

                // One transactional replacement: shell lists, replayed Git/agent
                // state, and the cursor move together or not at all.
                host.state.snapshot = snap
                host.state.replay = preparedReplay.replay
                host.state.replayInstallBuffer.discard()
                host.state.replayInstallGeneration &+= 1
                host.state.lastSeenSeq = reconnectSeq
                if snap.projects.isEmpty && snap.threads.isEmpty {
                    host.state.projectsLoadState = .empty
                } else {
                    host.state.projectsLoadState = .loaded
                }

                if installHistory, let history, let openId, host.state.openThreadId == openId {
                    host.threads.installThreadHistory(
                        history,
                        threadId: openId,
                        workGeneration: workGen
                    )
                }

                let success = host.state.resyncCoordinator.noteSuccess(appliedSeq: reconnectSeq)
                guard case .reconnect(let seq) = success else { return }
                guard host.state.resyncAttemptId == attemptId,
                      workGen == host.state.workGeneration,
                      !Task.isCancelled,
                      !host.state.liveLifecycle.isInBackground
                else {
                    await releaseTerminal(
                        attemptId: attemptId,
                        workGen: workGen,
                        capturedSocket: capturedSocket,
                        capturedSocketID: capturedSocketID,
                        outcome: .stale
                    )
                    return
                }

                host.state.needsAuthoritativeRefresh = false

                // The rich native transcript owns its own history surface. Refresh it while
                // the socket is still resync-gated so post-reconnect deltas cannot race an
                // older transcript baseline.
                if let richSuite = host.activeRichChatSuite {
                    await richSuite.refreshAuthoritativeHistory()
                }

                // Resume only the captured socket when it is still the session socket.
                if let capturedSocket,
                   let current = host.state.webSocket,
                   current.matchesIdentity(capturedSocket) {
                    await capturedSocket.resumeAfterResync(fromSeq: seq)
                    // Re-assert interests for the freshly reconnected generation,
                    // including an unchanged set: the server map restarts empty.
                    await host.live.flushGitStateInterests(generation: workGen)
                }
            }
        } catch is CancellationError {
            await releaseTerminal(
                attemptId: attemptId,
                workGen: workGen,
                capturedSocket: capturedSocket,
                capturedSocketID: capturedSocketID,
                outcome: host.state.liveLifecycle.isInBackground ? .background : .cancelled
            )
            return
        } catch let error as RemoteClientError where error.isUnauthorized {
            guard host.state.resyncAttemptId == attemptId,
                  workGen == host.state.workGeneration
            else {
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: .stale
                )
                return
            }
            host.state.resyncCoordinator.reset()
            // stop() clears resyncSuspended on the live socket.
            await host.handleAuthenticatedFailure(
                error,
                message: "Session expired. Pair again.",
                generation: workGen
            )
        } catch {
            guard host.state.resyncAttemptId == attemptId,
                  workGen == host.state.workGeneration
            else {
                await releaseTerminal(
                    attemptId: attemptId,
                    workGen: workGen,
                    capturedSocket: capturedSocket,
                    capturedSocketID: capturedSocketID,
                    outcome: .stale
                )
                return
            }
            // Normal failure: noteFailure does not cancel this task; scheduleRetry is separate.
            // Socket remains resync-suspended until retry success or a terminal abort.
            _ = host.state.resyncCoordinator.noteFailure()
            host.state.globalError = error.localizedDescription
            scheduleRetry(forAttempt: attemptId, workGeneration: workGen)
        }
    }

    private enum TerminalOutcome {
        case stale
        case cancelled
        case background
    }

    /// Every stale/cancel/background terminal path releases the session coordinator
    /// and recovers the **captured** socket gate without touching a replacement.
    private func releaseTerminal(
        attemptId: UInt64,
        workGen: Int,
        capturedSocket: (any SessionLiveSocket)?,
        capturedSocketID: ObjectIdentifier?,
        outcome: TerminalOutcome
    ) async {
        _ = capturedSocketID
        guard host.state.resyncAttemptId == attemptId else { return }

        switch outcome {
        case .stale, .cancelled:
            // Leave pending/inFlight false so a subsequent live event may apply.
            host.state.resyncCoordinator.reset()
            host.state.needsAuthoritativeRefresh = false
        case .background:
            host.state.resyncCoordinator.resetInFlightOnly()
            host.state.needsAuthoritativeRefresh = true
            host.state.liveLifecycle.noteResyncRetryBlockedByBackground()
        }

        await recoverCapturedSocketIfCurrent(capturedSocket)
        _ = workGen
    }

    /// Clear resync gate / reconnect only when the captured socket is still the session socket.
    private func recoverCapturedSocketIfCurrent(_ captured: (any SessionLiveSocket)?) async {
        guard let captured else { return }
        guard let current = host.state.webSocket, current.matchesIdentity(captured) else {
            // Replacement present (or nil after stop) — never resume the replacement from stale baseline.
            return
        }
        await captured.recoverFromResyncAbort()
    }

    /// Schedule retry on a **separate** task identity from the attempt task.
    func scheduleRetry(forAttempt attemptId: UInt64? = nil, workGeneration: Int? = nil) {
        guard !host.state.liveLifecycle.isInBackground else {
            host.state.liveLifecycle.noteResyncRetryBlockedByBackground()
            host.state.needsAuthoritativeRefresh = true
            return
        }
        let gen = workGeneration ?? host.state.workGeneration
        let expectedAttempt = attemptId
        let delayMs = host.state.resyncCoordinator.nextRetryDelayMs()
        host.scheduleResyncRetry(
            delayMs: delayMs,
            workGeneration: gen,
            expectedAttempt: expectedAttempt
        )
    }

    /// Public entry used by scene-phase recovery (no attempt coupling).
    func scheduleRetry() {
        scheduleRetry(forAttempt: nil, workGeneration: host.state.workGeneration)
    }
}
