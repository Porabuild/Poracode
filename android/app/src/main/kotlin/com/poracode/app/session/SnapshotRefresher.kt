package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.transport.RemoteApiGateway
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Foreground shell refresh and the connection-recovery evidence pipeline:
 * every refresh takes a seq at start ([ConnectionEventSequencer]), delegates
 * the negotiate/install/walk work to the bounded catalog, and on success
 * retires the connection scope's failure claim — but only claims published
 * before the attempt began, so completion of an older request can never retire
 * a newer failure. Failures route back through
 * [LiveFailureSurface.handleApiException] (transport failures become
 * claims; host domain failures stay on the shared global error).
 */
internal class SnapshotRefresher(
    private val scope: CoroutineScope,
    private val jobs: SessionLifecycleJobs,
    private val lifecycleGate: AppLifecycleGate,
    private val api: () -> RemoteApiGateway?,
    private val readScopes: () -> List<String>,
    private val updateState: ((AppSession.UiState) -> AppSession.UiState) -> Unit,
    private val refreshShell: suspend (RemoteApiGateway, Long) -> Boolean,
    private val handleApiException: (RemoteClientException) -> Unit,
    private val events: ConnectionEventSequencer,
) {
    fun refresh(onResult: ((Boolean) -> Unit)? = null): kotlinx.coroutines.Job? {
        val client = api() ?: return null
        if (!RemoteAccessScopes.canRead(readScopes())) {
            updateState { it.copy(globalError = SessionPolicies.MISSING_SCOPE_READ_MESSAGE) }
            return null
        }
        val job = scope.launch {
            val attemptSeq = events.next()
            var success = false
            try {
                success = refreshShell(client, attemptSeq)
            } catch (e: CancellationException) {
                throw e
            } catch (e: RemoteClientException) {
                if (lifecycleGate.isForeground) handleApiException(e)
            } catch (e: Exception) {
                if (lifecycleGate.isForeground) events.publishFailure(e.message)
            } finally {
                onResult?.invoke(success)
            }
        }
        jobs.replace(SessionLifecycleJobs.SNAPSHOT, job)
        return job
    }
}
