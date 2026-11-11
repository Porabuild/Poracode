package com.poracode.app.ui.richchat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.session.richchat.RichChatSessionRuntime

/** Runtime decisions remain above the composer even while history loads/reloads. */
@Composable
internal fun RichChatCompactRuntimeDock(
    runtime: RichChatSessionRuntime,
    agentStatus: AgentStatusEntry?,
    projectLocation: ProjectLocation?,
    canOperate: Boolean,
    onOpenAgentSettings: () -> Unit,
) {
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpoints by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val actions by runtime.sessionActions.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val openTask = rememberRichChatBackgroundTaskDetails(runtime, state, actions.actionIds, canOperate, scope)
    RichChatCompactControlDock(
        runtime = runtime,
        items = state.transcript?.itemsInOrder.orEmpty(),
        agentStatus = agentStatus,
        requests = state.transcript?.openRequests.orEmpty(),
        pendingSteer = state.transcript?.pendingSteer,
        backgroundTasks = state.backgroundTasks.orEmpty(),
        sessionActionIds = actions.actionIds,
        onOpenBackgroundTask = openTask,
        checkpointState = checkpoints,
        projectLocation = projectLocation,
        selection = state.selection,
        config = state.config,
        canOperate = canOperate,
        busy = state.activeOperations.any { it != "older" },
        onOpenAgentSettings = onOpenAgentSettings,
    )
}
