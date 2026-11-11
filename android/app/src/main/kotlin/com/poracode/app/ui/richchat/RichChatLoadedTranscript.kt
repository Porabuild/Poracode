package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.session.richchat.RichChatSessionRuntime
import kotlinx.coroutines.launch

/**
 * The loaded rich-chat transcript: timeline plus the control surface, split into a
 * wide side-by-side layout or a compact timeline-over-dock column. Floating chrome
 * belongs to RichChatThreadSurface, independently of history load state.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RichChatLoadedTranscript(
    runtime: RichChatSessionRuntime,
    threadId: String,
    agentStatus: AgentStatusEntry?,
    projectLocation: ProjectLocation?,
    canOperate: Boolean,
    onOpenAgentSettings: () -> Unit,
    onTruncateItem: (String) -> Unit,
    onRevertItem: (String) -> Unit,
    requestFork: ((String) -> Unit)?,
    forkBoundaryItemId: String?,
    fileDownloadSnackbarHost: SnackbarHostState,
    layout: RichChatThreadLayout,
) {
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpointState by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val sessionActionsState by runtime.sessionActions.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val refreshing = "history" in state.activeOperations
    val mutating = state.activeOperations.any { it != "history" && it != "older" }
    val canMutate = canOperate && state.selection != null && !mutating && !refreshing
    val openBackgroundTask = rememberRichChatBackgroundTaskDetails(
        runtime,
        state,
        sessionActionsState.actionIds,
        canOperate,
        scope,
    )
    val transcript = state.transcript ?: return

    val revertableItemIds = remember(transcript.itemsInOrder) {
        RichChatUiLogic.revertableUserItemIds(transcript.itemsInOrder)
    }
    val controlContent: @Composable (Modifier) -> Unit = { controlModifier ->
        RichChatControlPanel(
            runtime = runtime,
            items = transcript.itemsInOrder,
            agentStatus = agentStatus,
            requests = transcript.openRequests,
            pendingSteer = transcript.pendingSteer,
            backgroundTasks = state.backgroundTasks.orEmpty(),
            sessionActionIds = sessionActionsState.actionIds,
            onOpenBackgroundTask = openBackgroundTask,
            checkpointState = checkpointState,
            projectLocation = projectLocation,
            selection = state.selection,
            config = state.config,
            canOperate = canOperate,
            busy = mutating || refreshing,
            onOpenAgentSettings = onOpenAgentSettings,
            modifier = controlModifier,
        )
    }
    val timelineContent: @Composable (Modifier) -> Unit = { timelineModifier ->
        RichTimelineView(
            transcript,
            state.olderCursor,
            state.olderTurnsCursor,
            state.loadingOlder || refreshing,
            runtime,
            onLoadOlder = { scope.launch { runtime.chat.loadOlder() } },
            canMutate = canMutate,
            onTruncateItem = onTruncateItem,
            revertableItemIds = revertableItemIds,
            onRevertItem = onRevertItem,
            onForkItem = requestFork,
            forkBoundaryItemId = forkBoundaryItemId,
            modifier = timelineModifier,
            backdrop = Modifier,
            bottomOverlayClearance = layout.composerClearance,
            contentPadding = PaddingValues(start = 12.dp, top = 8.dp, end = 12.dp, bottom = 16.dp + layout.composerClearance),
        )
    }
    val fileActions = projectLocation?.let {
        RichChatFileActions(
            runtime.media,
            it,
            context.cacheDir,
            fileDownloadSnackbarHost,
            "${threadId}:${state.selection?.generation}",
        )
    }
    CompositionLocalProvider(
        LocalRichChatFileActions provides fileActions,
    ) {
        if (!layout.compact) {
            Row(Modifier.fillMaxSize()) {
                timelineContent(Modifier.weight(1f))
                VerticalDivider()
                Column(
                    Modifier
                        .width(320.dp)
                        .verticalScroll(rememberScrollState())
                        .padding(12.dp),
                ) {
                    RuntimeContextUsageDock(threadId, transcript.contextUsage) {}
                    controlContent(Modifier)
                }
            }
        } else {
            timelineContent(Modifier.fillMaxSize())
        }
    }
}
