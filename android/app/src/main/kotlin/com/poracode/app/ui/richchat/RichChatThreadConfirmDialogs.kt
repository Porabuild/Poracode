package com.poracode.app.ui.richchat

import androidx.compose.runtime.Composable
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.chat.RichRuntimeItem
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
