import Foundation

/// Legacy AppSession send/interrupt mutations.
///
/// Each mutation is submitted exactly once. A post-send failure whose outcome cannot be
/// established (HTTP >= 500, status 0 / network / timeout) is classified as
/// `requestMayHaveCommitted`: the mutation is never replayed, and exactly one
/// authoritative read reconciles the thread state under the existing ownership guards.
extension ThreadController {
    @discardableResult
    func sendMessage(_ text: String) async -> Bool {
        let prompt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return false }

        guard host.state.canOperate else {
            host.state.globalError = "This session is read-only."
            return false
        }

        guard let access = host.currentThreadSessionAccess,
              access.isOnline,
              access.isReady,
              access.isForeground
        else {
            host.state.globalError = "Not connected to a thread."
            return false
        }

        guard let api = host.state.api, let openThreadId = host.state.openThreadId else {
            host.state.globalError = "Not connected to a thread."
            return false
        }

        guard let config = host.state.threadSnapshot?.thread.config
            ?? host.state.snapshot?.threads.first(where: { $0.id == openThreadId })?.config
        else {
            host.state.globalError =
                "Thread configuration is not available yet. Try again when the thread finishes loading."
            return false
        }

        guard let token = host.state.threadOwnership.currentToken() else {
            host.state.globalError = "Not connected to a thread."
            return false
        }
        let gen = host.state.workGeneration
        host.state.isSending = true
        var installToken: UInt64 = 0
        let task = Task { @MainActor in
            defer {
                if host.sendTask.isCurrent(installToken) {
                    host.state.isSending = false
                }
                host.sendTask.clearIfCurrent(installToken)
            }
            do {
                try await api.sendThreadInput(
                    threadId: openThreadId,
                    prompt: prompt,
                    config: config
                )
                try Task.checkCancellation()
                guard host.ownsThreadMutation(token: token, generation: gen) else {
                    return false
                }
                return true
            } catch is CancellationError {
                return false
            } catch let error as RemoteClientError {
                guard !Task.isCancelled else { return false }
                guard host.ownsThreadMutation(token: token, generation: gen) else { return false }
                if RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted {
                    await host.threads.refreshOpenThreadMetadata()
                    return false
                }
                await host.handleAuthenticatedFailure(
                    error,
                    message: "Session expired. Pair again.",
                    generation: gen
                )
                if !error.isUnauthorized {
                    host.state.globalError = error.localizedDescription
                }
                return false
            } catch {
                guard !Task.isCancelled else { return false }
                guard host.ownsThreadMutation(token: token, generation: gen) else { return false }
                host.state.globalError = error.localizedDescription
                return false
            }
        }
        installToken = host.sendTask.install(task)
        return await task.value
    }

    func interruptOpenThread() async {
        guard host.state.canOperate else {
            host.state.globalError = "This session is read-only."
            return
        }
        guard let access = host.currentThreadSessionAccess,
              access.isOnline,
              access.isReady,
              access.isForeground
        else { return }
        guard let api = host.state.api, let openThreadId = host.state.openThreadId else { return }
        guard let token = host.state.threadOwnership.currentToken() else { return }
        let gen = host.state.workGeneration
        var installToken: UInt64 = 0
        let task = Task { @MainActor in
            defer { host.interruptTask.clearIfCurrent(installToken) }
            do {
                try await api.interruptThread(threadId: openThreadId)
                try Task.checkCancellation()
                guard host.ownsThreadMutation(token: token, generation: gen) else { return }
            } catch is CancellationError {
                return
            } catch let error as RemoteClientError {
                guard !Task.isCancelled else { return }
                guard host.ownsThreadMutation(token: token, generation: gen) else { return }
                if RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted {
                    await host.threads.refreshOpenThreadMetadata()
                    return
                }
                await host.handleAuthenticatedFailure(
                    error,
                    message: "Session expired. Pair again.",
                    generation: gen
                )
                if !error.isUnauthorized {
                    host.state.globalError = error.localizedDescription
                }
            } catch {
                guard !Task.isCancelled else { return }
                guard host.ownsThreadMutation(token: token, generation: gen) else { return }
                host.state.globalError = error.localizedDescription
            }
        }
        installToken = host.interruptTask.install(task)
        await task.value
    }
}
