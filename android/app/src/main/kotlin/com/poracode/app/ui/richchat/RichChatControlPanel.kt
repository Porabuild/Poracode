package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.chat.RichOpenRequest
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.RichChatThreadLease
import com.poracode.app.session.richchat.RichCheckpointState
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.coroutines.launch

/**
 * Side/control surface for the open rich-chat thread: open requests, goal, pending
 * steer, and file checkpoints. Extracted from [RichChatThreadScreen] to keep the
 * screen composable under the source-size gate; behavior is unchanged.
 */
@Composable
internal fun RichChatControlPanel(
    runtime: RichChatSessionRuntime,
    items: List<RichRuntimeItem>,
    requests: List<RichOpenRequest>,
    pendingSteer: RichPendingSteer?,
    checkpointState: RichCheckpointState,
    projectLocation: ProjectLocation?,
    selection: RichChatThreadLease?,
    config: ThreadConfig?,
    canOperate: Boolean,
    busy: Boolean,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        RichRequestCards(
            requests = requests,
            resolving = busy,
            enabled = selection?.host?.scopes?.contains("requests:resolve") == true,
            onResolve = { resolution ->
                scope.launch { runtime.chat.resolveRequest(resolution) }
            },
        )
        RichGoalCard(
            items = items,
            busy = busy || !canOperate,
            onUpdate = { update -> scope.launch { runtime.chat.updateGoal(update) } },
        )
        RichPendingSteerCard(
            pending = pendingSteer,
            busy = busy || !canOperate,
            onSet = { prompt ->
                config?.let {
                    scope.launch {
                        runtime.chat.setSteer(ThreadSteerInput(prompt, it.toJsonObject()))
                    }
                }
            },
            onClear = { scope.launch { runtime.chat.clearSteer() } },
        )
        if (projectLocation != null && selection != null) {
            RichCheckpointControls(
                state = checkpointState,
                canOperate = canOperate,
                interactionBusy = busy,
                onRefresh = {
                    scope.launch {
                        runtime.checkpoints.refresh(
                            RichChatUiLogic.checkpointListPayload(
                                selection.threadId,
                                projectLocation,
                            ),
                        )
                    }
                },
                onRestore = { checkpoint ->
                    scope.launch {
                        runtime.checkpoints.restore(
                            RichChatUiLogic.checkpointRestorePayload(
                                selection.threadId,
                                checkpoint.checkpointItemId,
                                projectLocation,
                            ),
                        )
                    }
                },
                onRollback = {
                    scope.launch {
                        runtime.checkpoints.rollback(
                            RichChatUiLogic.rollbackPayload(selection.threadId, 1, config),
                        )
                    }
                },
            )
        }
    }
}
