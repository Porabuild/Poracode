package com.poracode.app.session.richchat

import com.poracode.app.protocol.ThreadPresentationPolicy
import com.poracode.app.session.AppSession
import com.poracode.app.storage.MultiHostCredentialRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** App-level rich-chat composition kept outside [AppSession]. */
class RichChatSessionComposition(
    private val appState: StateFlow<AppSession.UiState>,
    repository: MultiHostCredentialRepository,
    scope: CoroutineScope,
    dispatcher: CoroutineDispatcher,
) {
    private val leaseSource = SelectedRichChatHostLeaseSource(appState.value)
    val hostLease: StateFlow<RichChatHostLease?> = leaseSource.state
    private val provider = RepositoryRichChatGatewayProvider(
        repository,
        dispatcher,
        terminalScope = scope,
    )
    private val gateway = GeneratedRichChatSessionGateway(hostLease, provider)
    val runtime = RichChatSessionRuntime(hostLease, gateway)
    init {
        provider.setTerminalObserver(runtime.terminalObserver)
    }
    private val observation: Job = scope.launch {
        appState.collect { state ->
            leaseSource.update(state)
            synchronizeSelection(state)
        }
    }

    fun enterBackground() {
        provider.enterBackground()
        runtime.enterBackground()
    }

    fun enterForeground() {
        runtime.enterForeground()
        provider.enterForeground()
        synchronizeSelection(appState.value, forceRefresh = true)
    }

    fun close() {
        observation.cancel()
        provider.close()
        runtime.close()
    }

    private fun synchronizeSelection(state: AppSession.UiState, forceRefresh: Boolean = false) {
        runtime.reconcileSession()
        val desiredTerminalId = desiredTerminalThreadId(state)
        if (desiredTerminalId != null) {
            val host = hostLease.value ?: return
            if (!host.online || !host.ready) return
            if (forceRefresh && runtime.terminal.state.value.lease?.terminalId == desiredTerminalId) {
                runtime.reconnectTerminal()
            } else {
                runtime.presentTerminal(desiredTerminalId)
            }
            return
        }
        runtime.dismissTerminal()
        val desiredThreadId = desiredRichChatThreadId(state)
        val current = runtime.chat.selection.value
        if (desiredThreadId == null) {
            if (current != null) runtime.closeThread()
            return
        }
        val host = hostLease.value ?: return
        if (!host.online || !host.ready) return
        if (
            current?.threadId == desiredThreadId &&
            current.host.key == host.key
        ) {
            if (forceRefresh) runtime.refreshSelectedThread()
            return
        }
        when (runtime.selectThread(desiredThreadId)) {
            is RichChatOperationResult.Success -> runtime.refreshSelectedThread()
            else -> Unit
        }
    }
}

internal fun desiredTerminalThreadId(state: AppSession.UiState): String? {
    val threadId = state.openThreadId ?: return null
    val mode = state.threadSnapshot?.thread
        ?.takeIf { it.id == threadId }
        ?.presentationMode
        ?: state.snapshot?.threads?.firstOrNull { it.id == threadId }?.presentationMode
    return threadId.takeIf { ThreadPresentationPolicy.isTerminal(mode) }
}

internal fun desiredRichChatThreadId(state: AppSession.UiState): String? {
    val threadId = state.openThreadId ?: return null
    val detailMode = state.threadSnapshot?.thread
        ?.takeIf { it.id == threadId }
        ?.presentationMode
    val shellMode = state.snapshot?.threads
        ?.firstOrNull { it.id == threadId }
        ?.presentationMode
    return threadId.takeUnless {
        ThreadPresentationPolicy.isTerminal(detailMode ?: shellMode)
    }
}
