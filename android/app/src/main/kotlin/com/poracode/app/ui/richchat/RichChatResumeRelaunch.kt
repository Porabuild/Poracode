package com.poracode.app.ui.richchat

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSessionRef
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.session.threads.ThreadOperationFailure
import com.poracode.app.session.threads.ThreadOperationResult
import com.poracode.app.ui.thread.ThreadLifecycleUiLogic
import java.util.UUID
import kotlinx.serialization.json.jsonObject

/**
 * Desktop's resume launch (`threadRuntimeActions.ts`) for the empty composer's
 * resume. A host that restarted since the turn was cut off holds no session
 * for the thread and refuses the send with the typed `unknown_thread_session`
 * before any effect, so the same prompt relaunches the thread through the
 * Relaunch action's thread-start-existing path: [controller], the project
 * location the screen resolves for it, and the live catalog row, whose session
 * reference the relaunch resumes. Both are read when the refusal arrives. The
 * row must be the catalog one: a `thread-state` delivered while the send was
 * out (another client started the turn) lands there at once, so the relaunch
 * never restarts a running thread from a stale history read.
 */
internal class RichChatResumeRelaunch(
    private val controller: ThreadLifecycleController,
    private val latestThread: () -> RemoteThread?,
    private val projectLocation: () -> ProjectLocation?,
) {
    /**
     * Relaunches after a resume send failed with [refusal]; null when that
     * failure does not qualify or the relaunch failed too, which keeps the
     * refusal on the banner and the action in place to retry. An uncertain
     * relaunch is reconciled by one authoritative read and never resent.
     */
    suspend fun afterRefusal(
        runtime: RichChatSessionRuntime,
        refusal: RichChatOperationFailure,
        prompt: String,
        configuration: ThreadConfig,
    ): RichChatOperationResult<Unit>? {
        val latest = latestThread()?.takeIf { it.id == runtime.chat.selection.value?.threadId }
            ?: return null
        if (!RichChatResumePlanner.relaunchesAfter(refusal, latest)) return null
        val location = projectLocation() ?: return null
        val request = ThreadLifecycleUiLogic.startExistingRequest(
            latest,
            location,
            prompt,
            ThreadCommandId(UUID.randomUUID().toString()),
        ).copy(
            config = configuration,
            sessionRef = latest.sessionRef?.let {
                RemoteJson.encodeToJsonElement(RemoteSessionRef.serializer(), it).jsonObject
            },
        )
        val started = controller.startExisting(request)
        val failure = (started as? ThreadOperationResult.Failed)?.failure
        return when {
            started is ThreadOperationResult.Success -> {
                runtime.chat.replaceFailure(refusal, null)
                RichChatOperationResult.Success(Unit)
            }
            failure is ThreadOperationFailure.Remote && failure.requestMayHaveCommitted -> {
                val uncertain = RichChatOperationFailure.Remote(failure.statusCode, failure.code, true)
                runtime.chat.replaceFailure(refusal, uncertain)
                RichChatOperationResult.Failed(uncertain)
            }
            else -> null
        }
    }
}
