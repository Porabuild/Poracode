package com.poracode.app.ui.richchat

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.chat.RichHandoffSummary
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * The thread screen's confirmation dialogs: transcript truncate, checkpoint
 * revert, and thread close. Pure presentation around screen-owned pending
 * state — the screen keeps the pending slots and the coroutine scope.
 */
@Composable
internal fun RichChatThreadConfirmDialogs(
    runtime: RichChatSessionRuntime,
    scope: CoroutineScope,
    pendingTruncateItemId: String?,
    pendingRevertItemId: String?,
    showCloseDialog: Boolean,
    mutating: Boolean,
    transcriptItems: List<RichRuntimeItem>,
    selectionThreadId: String?,
    onBack: () -> Unit,
    onDismissTruncate: () -> Unit,
    onDismissRevert: () -> Unit,
    onDismissClose: () -> Unit,
) {
    pendingTruncateItemId?.let { itemId ->
        RichChatTruncateConfirmDialog(
            enabled = !mutating,
            onDismiss = onDismissTruncate,
            onConfirm = {
                onDismissTruncate()
                scope.launch { runtime.chat.truncate(itemId) }
            },
        )
    }
    pendingRevertItemId?.let { userItemId ->
        RichChatRevertConfirmDialog(
            enabled = !mutating,
            onDismiss = onDismissRevert,
            onConfirm = {
                val checkpointItemId =
                    RichChatUiLogic.revertCheckpointItemId(transcriptItems, userItemId)
                onDismissRevert()
                if (checkpointItemId != null && selectionThreadId != null) {
                    scope.launch {
                        runtime.checkpoints.revert(
                            RichChatUiLogic.checkpointRevertPayload(
                                selectionThreadId,
                                checkpointItemId,
                            ),
                        )
                    }
                }
            },
        )
    }
    if (showCloseDialog) {
        RichChatCloseThreadConfirmDialog(
            enabled = !mutating,
            onDismiss = onDismissClose,
            onConfirm = {
                onDismissClose()
                scope.launch {
                    // Dismiss only on a confirmed, owned success. A stale
                    // host or ambiguous delivery leaves the selection intact so
                    // the authoritative feed reconciles the runtime state.
                    when (runtime.chat.closeThreadRuntime()) {
                        is RichChatOperationResult.Success -> onBack()
                        else -> Unit
                    }
                }
            },
        )
    }
}

@Composable
internal fun RichChatMoveAndHandoffOverlays(
    pendingMoveBringChanges: Boolean?,
    onDismissMove: () -> Unit,
    onConfirmMove: (Boolean) -> Unit,
    showHandoff: Boolean,
    thread: RemoteThread?,
    transcriptItems: List<RichRuntimeItem>,
    agentStatus: AgentStatusEntry?,
    handoffAgents: List<AgentStatusEntry>,
    controller: ThreadLifecycleController,
    onDismissHandoff: () -> Unit,
    onOpenThread: (String) -> Unit,
) {
    pendingMoveBringChanges?.let { bringChanges ->
        AlertDialog(
            onDismissRequest = onDismissMove,
            title = { Text(stringResource(R.string.thread_lifecycle_move_worktree_title)) },
            text = {
                Text(
                    stringResource(
                        if (bringChanges) {
                            R.string.thread_lifecycle_move_worktree_changes_message
                        } else {
                            R.string.thread_lifecycle_move_worktree_clean_message
                        },
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { onDismissMove(); onConfirmMove(bringChanges) }) {
                    Text(stringResource(R.string.thread_lifecycle_move_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = onDismissMove) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
    if (showHandoff && thread != null) {
        val handoffSummary = remember(transcriptItems, agentStatus?.label, thread.agentKind) {
            RichHandoffSummary.transcriptSummary(
                items = transcriptItems,
                sourceLabel = agentStatus?.label ?: thread.agentKind,
            )
        }
        RichChatHandoffSheet(
            thread = thread,
            agents = handoffAgents,
            summary = handoffSummary,
            controller = controller,
            onDismiss = onDismissHandoff,
            onOpenThread = onOpenThread,
        )
    }
}
