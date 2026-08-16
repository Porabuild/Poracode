import Foundation

/// Open/close, history hydration, pagination, send, and interrupt.
@MainActor
struct ThreadController {
    unowned let host: AppSession

    private let threadMetaRefreshDebounceNs: UInt64 = 250_000_000

    func openThread(id: String) {
        guard host.state.canRead else {
            host.state.globalError = "This token cannot read threads."
            return
        }
        let mode = host.state.snapshot?.threads.first(where: { $0.id == id })?.presentationMode
            ?? host.state.threadSnapshot?.thread.presentationMode
        if let mode, !ThreadPresentationFilter.isGUIPresentation(mode) {
            host.state.globalError = "Terminal threads are not available on mobile yet."
            return
        }
        if mode == nil {
            if let thread = host.state.snapshot?.threads.first(where: { $0.id == id }),
               !ThreadPresentationFilter.isGUIPresentation(thread.presentationMode) {
                host.state.globalError = "Terminal threads are not available on mobile yet."
                return
            }
        }

        host.threadLoadTask.cancelCurrent()
        host.threadMetaRefreshTask.cancelCurrent()
        host.paginationTask.cancelCurrent()
        host.sendTask.cancelCurrent()
        host.interruptTask.cancelCurrent()
        host.state.isSending = false
        host.state.historyLoadGeneration += 1
        let loadGen = host.state.historyLoadGeneration

        let apiEndpoint = host.state.profile?.httpBaseURL
        let socketID = host.state.webSocket.map { ObjectIdentifier($0 as AnyObject) }
        let token = host.state.threadOwnership.open(
            threadId: id,
            sessionGeneration: host.state.workGeneration,
            apiEndpoint: apiEndpoint,
            socketObjectID: socketID
        )
        host.state.openThreadId = id
        host.state.openThreadEpoch = token.epoch
        host.state.hydrationBuffer.begin(threadId: id, workGeneration: host.state.workGeneration)
        host.state.threadSnapshot = nil
        host.state.threadItems = []
        host.state.threadOlderCursor = nil
        host.state.openRuntimeRequests = []
        host.state.threadDomain.reset()
        host.state.threadLoadState = .loading

        host.scheduleInterestFlush(threadIds: [id])
        host.scheduleThreadHistoryLoad(token: token, historyLoadGeneration: loadGen)
    }

    func closeThread() {
        host.threadLoadTask.cancelCurrent()
        host.threadMetaRefreshTask.cancelCurrent()
        host.paginationTask.cancelCurrent()
        host.sendTask.cancelCurrent()
        host.interruptTask.cancelCurrent()
        host.state.hydrationBuffer.discard()
        host.state.historyLoadGeneration += 1
        host.state.threadOwnership.close()
        host.state.openThreadId = nil
        host.state.openThreadEpoch = host.state.threadOwnership.epoch
        host.state.threadSnapshot = nil
        host.state.threadItems = []
        host.state.threadOlderCursor = nil
        host.state.openRuntimeRequests = []
        host.state.threadDomain.reset()
        host.state.threadLoadState = .idle
        host.scheduleInterestFlush(threadIds: [])
    }

    /// Install history snapshot + domain fields + replay buffered live frames (seq > snapshotSeq).
    func installThreadHistory(
        _ history: RemoteThreadSnapshot,
        threadId: String,
        workGeneration gen: Int
    ) {
        host.state.threadSnapshot = history
        host.state.threadOlderCursor = history.runtimeNextCursor

        // Domain hydration (contextUsage, completedTurns, pending requests).
        var domain = host.state.threadDomain
        // Do not wipe domain unconditionally — hydrate installs snapshot fields.
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        host.state.threadDomain = domain
        host.state.openRuntimeRequests = domain.openRequests

        if let replay = host.state.hydrationBuffer.commitHistory(
            threadId: threadId,
            workGeneration: gen,
            snapshotSeq: history.snapshotSeq
        ) {
            host.state.threadItems = ThreadHistoryHydration.install(
                historyItems: history.runtimeItems,
                threadId: threadId,
                snapshotSeq: history.snapshotSeq,
                buffered: replay
            )
            // Replay domain events from buffered frames as well.
            for frame in replay {
                let batches = RuntimeEventReducer.collectRuntimeEvents(from: frame.event)
                for batch in batches where batch.threadId == threadId {
                    for event in batch.events {
                        RuntimeEventReducer.applyDomain(
                            event: event,
                            threadId: threadId,
                            domain: &host.state.threadDomain
                        )
                        RuntimeEventReducer.applyRequestEvent(
                            event: event,
                            threadId: threadId,
                            to: &host.state.openRuntimeRequests
                        )
                    }
                }
            }
        } else {
            host.state.threadItems = history.runtimeItems
        }
        host.state.threadLoadState = host.state.threadItems.isEmpty ? .empty : .loaded
    }

    func flushInterests(threadIds: [String]) async {
        let socket = host.state.webSocket
        let socketID = socket.map { ObjectIdentifier($0 as AnyObject) }
        let update = host.state.interestCoordinator.enqueue(
            threadIds: threadIds,
            socketObjectID: socketID
        )
        guard let socket else { return }
        guard host.state.interestCoordinator.shouldApply(update, activeSocketObjectID: socketID)
        else { return }
        await socket.setThreadItemInterests(update.threadIds)
        let activeID = host.state.webSocket.map { ObjectIdentifier($0 as AnyObject) }
        guard host.state.interestCoordinator.shouldApply(update, activeSocketObjectID: activeID)
        else {
            if let active = host.state.webSocket {
                await active.setThreadItemInterests(host.state.interestCoordinator.latestDesired)
            }
            return
        }
    }

    func loadThreadHistory(
        token: ThreadOpenOwnership.Token,
        historyLoadGeneration loadGen: Int
    ) async {
        guard host.state.api != nil else { return }
        do {
            try await loadThreadHistoryThrowing(token: token, historyLoadGeneration: loadGen)
        } catch is CancellationError {
            exitHydrationIfOwner(token: token, workGeneration: host.state.workGeneration)
        } catch let error as RemoteClientError {
            guard host.state.threadOwnership.isCurrent(
                token,
                sessionGeneration: host.state.workGeneration,
                apiEndpoint: host.state.profile?.httpBaseURL
            ) else { return }
            exitHydrationIfOwner(token: token, workGeneration: host.state.workGeneration)
            await host.handleAuthenticatedFailure(
                error,
                message: "Session expired. Pair again.",
                generation: host.state.workGeneration
            )
            if !error.isUnauthorized {
                host.state.threadLoadState = .failed(error.localizedDescription)
            }
        } catch {
            guard host.state.threadOwnership.isCurrent(
                token,
                sessionGeneration: host.state.workGeneration,
                apiEndpoint: host.state.profile?.httpBaseURL
            ) else { return }
            exitHydrationIfOwner(token: token, workGeneration: host.state.workGeneration)
            host.state.threadLoadState = .failed(error.localizedDescription)
        }
    }

    private func exitHydrationIfOwner(
        token: ThreadOpenOwnership.Token,
        workGeneration gen: Int
    ) {
        host.state.hydrationBuffer.discardIfMatching(
            threadId: token.threadId,
            workGeneration: gen
        )
        if host.state.threadOwnership.isCurrent(
            token,
            sessionGeneration: host.state.workGeneration,
            apiEndpoint: host.state.profile?.httpBaseURL
        ), host.state.threadLoadState == .loading {
            host.state.threadLoadState = .idle
        }
    }

    func loadThreadHistoryThrowing(
        token: ThreadOpenOwnership.Token,
        historyLoadGeneration loadGen: Int
    ) async throws {
        guard let api = host.state.api else { return }
        let gen = host.state.workGeneration
        let endpoint = await api.httpEndpoint
        let history = try await api.threadHistory(
            threadId: token.threadId,
            targetTimelineEntryCount: 40
        )
        guard loadGen == host.state.historyLoadGeneration else {
            exitHydrationIfOwner(token: token, workGeneration: gen)
            return
        }
        guard !Task.isCancelled else {
            exitHydrationIfOwner(token: token, workGeneration: gen)
            return
        }
        guard host.state.threadOwnership.isCurrent(
            token,
            sessionGeneration: gen,
            apiEndpoint: endpoint
        ), gen == host.state.workGeneration else {
            exitHydrationIfOwner(token: token, workGeneration: gen)
            return
        }

        let currentEndpoint: String?
        if let active = host.state.api {
            currentEndpoint = await active.httpEndpoint
        } else {
            currentEndpoint = nil
        }
        guard currentEndpoint == endpoint else {
            exitHydrationIfOwner(token: token, workGeneration: gen)
            return
        }

        if !ThreadPresentationFilter.isGUIPresentation(history.thread.presentationMode) {
            host.state.threadLoadState = .failed("Terminal threads are not available on mobile yet.")
            closeThread()
            return
        }

        _ = GlobalCursorOwnership.shouldAdvanceGlobalCursorFromThreadHistory()
        guard host.state.threadOwnership.isCurrent(
            token,
            sessionGeneration: host.state.workGeneration,
            apiEndpoint: endpoint
        ) else {
            exitHydrationIfOwner(token: token, workGeneration: gen)
            return
        }
        installThreadHistory(history, threadId: token.threadId, workGeneration: gen)
    }

    func loadOlderItems() async {
        guard host.state.canRead else { return }
        guard let api = host.state.api,
              let openThreadId = host.state.openThreadId,
              let cursor = host.state.threadOlderCursor,
              !host.state.isLoadingOlder
        else { return }
        let token = host.state.threadOwnership.currentToken()
        guard let token else { return }
        let gen = host.state.workGeneration
        let loadGen = host.state.historyLoadGeneration
        let endpoint = await api.httpEndpoint
        host.state.isLoadingOlder = true
        var installToken: UInt64 = 0
        let task = Task { @MainActor in
            defer {
                host.state.isLoadingOlder = false
                host.paginationTask.clearIfCurrent(installToken)
            }
            do {
                let page = try await api.threadRuntimeItemsPage(
                    threadId: openThreadId,
                    beforePosition: cursor,
                    limit: 100,
                    targetTimelineEntryCount: 40
                )
                try Task.checkCancellation()
                guard loadGen == host.state.historyLoadGeneration else { return }
                guard host.state.threadOwnership.isCurrent(
                    token,
                    sessionGeneration: gen,
                    apiEndpoint: endpoint
                ), gen == host.state.workGeneration,
                    host.state.openThreadId == openThreadId,
                    host.state.openThreadEpoch == token.epoch
                else { return }
                var seen = Set(host.state.threadItems.map(\.id))
                let older = page.items.filter { seen.insert($0.id).inserted }
                host.state.threadItems = older + host.state.threadItems
                host.state.threadOlderCursor = page.nextCursor
                if !host.state.threadItems.isEmpty { host.state.threadLoadState = .loaded }
            } catch is CancellationError {
                return
            } catch let error as RemoteClientError {
                guard !Task.isCancelled else { return }
                guard host.state.threadOwnership.isCurrent(
                    token,
                    sessionGeneration: host.state.workGeneration,
                    apiEndpoint: endpoint
                ) else { return }
                await host.handleAuthenticatedFailure(
                    error,
                    message: "Session expired. Pair again.",
                    generation: host.state.workGeneration
                )
                if !error.isUnauthorized {
                    host.state.globalError = error.localizedDescription
                }
            } catch {
                guard !Task.isCancelled else { return }
                host.state.globalError = error.localizedDescription
            }
        }
        installToken = host.paginationTask.install(task)
        await task.value
    }

    func scheduleOpenThreadMetadataRefresh() {
        host.scheduleOpenThreadMetadataRefresh(delayNs: threadMetaRefreshDebounceNs)
    }

    func refreshOpenThreadMetadata() async {
        guard host.state.canRead else { return }
        guard let api = host.state.api, let openThreadId = host.state.openThreadId else { return }
        let gen = host.state.workGeneration
        let token = host.state.threadOwnership.currentToken()
        let epoch = host.state.openThreadEpoch
        do {
            let history = try await api.threadHistory(
                threadId: openThreadId,
                targetTimelineEntryCount: 1
            )
            guard !Task.isCancelled, gen == host.state.workGeneration else { return }
            guard host.state.openThreadId == openThreadId,
                  host.state.openThreadEpoch == epoch
            else { return }
            if let token {
                guard host.state.threadOwnership.isCurrent(
                    token,
                    sessionGeneration: gen,
                    apiEndpoint: host.state.profile?.httpBaseURL
                ) else { return }
            }
            host.state.threadSnapshot = history
            host.live.scheduleShellRefresh()
        } catch let error as RemoteClientError {
            guard gen == host.state.workGeneration else { return }
            await host.handleAuthenticatedFailure(
                error,
                message: "Session expired. Pair again.",
                generation: gen
            )
        } catch {
            // Ignore transient failures.
        }
    }

    func fetchThreadHistory(id: String) async throws -> RemoteThreadSnapshot {
        guard let api = host.state.api else {
            throw RemoteClientError.invalidResponse("No API client.")
        }
        return try await api.threadHistory(threadId: id, targetTimelineEntryCount: 40)
    }
}
