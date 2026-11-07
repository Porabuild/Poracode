package com.poracode.app.ui.richchat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatControllerState
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * The empty composer's resume for a cut-off turn on [RichChatThreadScreen]:
 * the plan it offers, the post-send suppression, and the relaunch for a send
 * the host refused because it lost the thread's session. Split from the
 * screen below the source-size gate.
 */
@Stable
internal class RichChatThreadResume(
    private val runtime: RichChatSessionRuntime,
    private val scope: CoroutineScope,
    private val relaunch: RichChatResumeRelaunch,
    private val continuePrompt: () -> String,
) {
    /**
     * Row a successful send was made against: the host owns the turn from then
     * on, so the action waits for the host to restate the row.
     */
    private var suppressedRow by mutableStateOf<RemoteThread?>(null)

    /** A resume (its send, then any relaunch) is in flight; the action waits for it. */
    private var inFlight by mutableStateOf(false)

    /** A settled row with a cut-off marker outranks a stale open turn. */
    fun isTurnActive(state: RichChatControllerState, thread: RemoteThread?): Boolean =
        RichChatUiLogic.generationActive(
            state.activeOperations,
            RichChatResumePlanner.countsOpenTurn(state.transcript?.openTurn == true, thread),
        )

    /**
     * The action the empty composer offers for [thread], or null. It is withheld
     * while an uncertain send or relaunch awaits a successful authoritative read:
     * a failed read reconciles nothing, so the earlier attempt may still be live.
     */
    fun plan(
        thread: RemoteThread?,
        state: RichChatControllerState,
        canSubmit: Boolean,
        composerEmpty: Boolean,
    ): RichChatResumePlan? {
        if (!RichChatResumePlanner.isInterrupted(thread)) return null
        return RichChatResumePlanner.offer(
            thread = thread,
            items = state.transcript?.itemsInOrder.orEmpty(),
            composerEmpty = composerEmpty,
            canSubmit = canSubmit && !inFlight && state.selection != null &&
                !state.needsAuthoritativeRefresh &&
                "history" !in state.activeOperations && "send" !in state.activeOperations,
            isTurnActive = isTurnActive(state, thread),
            suppressedRow = suppressedRow,
        )
    }

    /** Records how a submission made against [rowAtSubmit] ended. */
    fun settle(result: RichChatOperationResult<Unit>?, rowAtSubmit: RemoteThread?) {
        suppressedRow = RichChatResumePlanner.suppressionAfterSubmit(result, rowAtSubmit, suppressedRow)
    }

    /**
     * Sends [plan], offered against [rowAtSubmit]; a failure leaves the action in
     * place to retry. A tap that outran a pending reconciliation does nothing.
     */
    fun resume(
        plan: RichChatResumePlan?,
        configuration: ThreadConfig,
        state: RichChatControllerState,
        rowAtSubmit: RemoteThread?,
    ) {
        if (plan == null || inFlight || runtime.chat.state.value.needsAuthoritativeRefresh) return
        inFlight = true
        scope.launch {
            try {
                val result = submitRichChatResume(
                    runtime = runtime,
                    plan = plan,
                    continuePrompt = continuePrompt(),
                    configuration = configuration,
                    activeRequest = state.transcript?.openRequests?.firstOrNull(),
                    relaunch = relaunch,
                )
                settle(result, rowAtSubmit)
            } finally {
                inFlight = false
            }
        }
    }
}

/**
 * The thread screen's [RichChatThreadResume]. Its relaunch reads [catalogThread]
 * and the project location on use, so it sees a `thread-state` delivered while
 * the send was out.
 */
@Composable
internal fun rememberRichChatThreadResume(
    runtime: RichChatSessionRuntime,
    threadId: String,
    catalogThread: RemoteThread?,
    threadLifecycleController: ThreadLifecycleController,
    projectLocation: ProjectLocation?,
): RichChatThreadResume {
    val scope = rememberCoroutineScope()
    val latestThread by rememberUpdatedState(catalogThread)
    val latestLocation by rememberUpdatedState(projectLocation)
    val continuePrompt by rememberUpdatedState(
        stringResource(R.string.rich_chat_resume_continue_prompt),
    )
    return remember(threadId, runtime, threadLifecycleController) {
        RichChatThreadResume(
            runtime = runtime,
            scope = scope,
            relaunch = RichChatResumeRelaunch(
                threadLifecycleController,
                latestThread = { latestThread },
                projectLocation = { latestLocation },
            ),
            continuePrompt = { continuePrompt },
        )
    }
}
