package com.poracode.app.ui.richchat

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichOpenRequest
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.RichChatThreadLease
import com.poracode.app.session.richchat.RichCheckpointState
import kotlinx.coroutines.launch

/** Phone-width control surface; the transcript stays primary and details move to a sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RichChatCompactControlDock(
    runtime: RichChatSessionRuntime,
    items: List<RichRuntimeItem>,
    agentStatus: AgentStatusEntry?,
    requests: List<RichOpenRequest>,
    pendingSteer: RichPendingSteer?,
    checkpointState: RichCheckpointState,
    projectLocation: ProjectLocation?,
    selection: RichChatThreadLease?,
    config: ThreadConfig?,
    canOperate: Boolean,
    busy: Boolean,
    onOpenAgentSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (requests.isEmpty() && pendingSteer == null && !hasCompactInfo(items, agentStatus)) {
        return
    }
    var showDetails by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val canResolve = selection?.host?.scopes?.contains("requests:resolve") == true
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Resolve every request inline (including multi-select) so the dock never
        // defers a decision to the details sheet just because it has >2 options.
        RichRequestCards(
            requests = requests,
            resolving = false,
            enabled = canResolve && !busy,
            onResolve = { resolution -> scope.launch { runtime.chat.resolveRequest(resolution) } },
        )
        pendingSteer?.let {
            CompactPendingSteerRow(
                pending = it,
                enabled = canOperate && !busy,
                onOpenDetails = { showDetails = true },
                onClear = { scope.launch { runtime.chat.clearSteer() } },
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            compactInfoLabels(items, agentStatus).forEach { label ->
                AssistChip(onClick = { showDetails = true }, label = { Text(label) })
            }
            if (projectLocation != null && selection != null) {
                FilterChip(
                    selected = false,
                    onClick = { showDetails = true },
                    label = { Text(stringResource(R.string.rich_chat_checkpoints)) },
                )
            }
            AssistChip(
                onClick = { showDetails = true },
                label = { Text(stringResource(R.string.rich_chat_composer_controls)) },
            )
        }
    }
    if (showDetails) {
        ModalBottomSheet(onDismissRequest = { showDetails = false }) {
            Text(
                stringResource(R.string.rich_chat_composer_controls),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp),
            ) {
                RichChatControlPanel(
                    runtime = runtime,
                    items = items,
                    agentStatus = agentStatus,
                    requests = requests,
                    pendingSteer = pendingSteer,
                    checkpointState = checkpointState,
                    projectLocation = projectLocation,
                    selection = selection,
                    config = config,
                    canOperate = canOperate,
                    busy = busy,
                    onOpenAgentSettings = onOpenAgentSettings,
                    modifier = Modifier.padding(bottom = 24.dp),
                )
            }
        }
    }
}

@Composable
private fun CompactPendingSteerRow(
    pending: RichPendingSteer,
    enabled: Boolean,
    onOpenDetails: () -> Unit,
    onClear: () -> Unit,
) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors()) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, top = 7.dp, bottom = 7.dp)) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.rich_chat_pending_steer), style = MaterialTheme.typography.labelLarge)
                Text(
                    pending.prompt,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
            TextButton(onClick = onOpenDetails, enabled = enabled) {
                Text(stringResource(R.string.rich_chat_edit_steer))
            }
            TextButton(onClick = onClear, enabled = enabled) {
                Text(stringResource(R.string.rich_chat_clear_steer))
            }
        }
    }
}

private fun hasCompactInfo(items: List<RichRuntimeItem>, agentStatus: AgentStatusEntry?): Boolean {
    val delegated = RichChatRuntimeInfo.activeDelegatedAgents(items)
    val errors = RichChatRuntimeInfo.recentErrors(items)
    return delegated.isNotEmpty() ||
        RichChatRuntimeInfo.authenticationRequired(agentStatus, errors) ||
        RichChatRuntimeInfo.latestActivePlan(items) != null ||
        RichChatRuntimeInfo.visibleRecentErrors(errors, agentStatus).isNotEmpty()
}

@Composable
private fun compactInfoLabels(
    items: List<RichRuntimeItem>,
    agentStatus: AgentStatusEntry?,
): List<String> = buildList {
    val delegated = RichChatRuntimeInfo.activeDelegatedAgents(items)
    if (delegated.isNotEmpty()) add(stringResource(R.string.rich_chat_activity_count, delegated.size))
    val errors = RichChatRuntimeInfo.recentErrors(items)
    if (RichChatRuntimeInfo.authenticationRequired(agentStatus, errors)) {
        add(stringResource(R.string.rich_chat_sign_in_required))
    }
    val plan = RichChatRuntimeInfo.latestActivePlan(items)
    if (plan != null) add(stringResource(R.string.rich_chat_plan))
    if (RichChatRuntimeInfo.visibleRecentErrors(errors, agentStatus).isNotEmpty()) {
        add(stringResource(R.string.rich_chat_errors))
    }
}
