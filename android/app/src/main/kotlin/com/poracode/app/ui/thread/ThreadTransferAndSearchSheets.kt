package com.poracode.app.ui.thread

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteConversationSearchEntry
import com.poracode.app.transport.searchConversations
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeChoiceOption
import com.poracode.app.ui.components.PoracodeChoiceSection
import com.poracode.app.ui.components.PoracodeInlineSearchField
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class ThreadTransferHostOption(
    val hostId: String,
    val label: String,
    val projects: List<Pair<String, String>>,
)

@Composable
internal fun ThreadTransferSheet(
    threadTitle: String,
    destinations: List<ThreadTransferHostOption>,
    onTransfer: suspend (hostId: String, projectId: String) -> Result<Unit>,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selectedHostId by remember(destinations) { mutableStateOf(destinations.firstOrNull()?.hostId.orEmpty()) }
    val selectedHost = destinations.firstOrNull { it.hostId == selectedHostId } ?: destinations.firstOrNull()
    var selectedProjectId by remember(selectedHost) { mutableStateOf(selectedHost?.projects?.firstOrNull()?.first.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    PoracodeSheet(onDismissRequest = { if (!busy) onDismiss() }, title = "Move $threadTitle") {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (destinations.isNotEmpty()) {
                PoracodeChoiceSection(
                    label = "Target host",
                    options = destinations.map { PoracodeChoiceOption(it.hostId, it.label) },
                    selectedId = selectedHostId,
                    onSelect = { selectedHostId = it },
                )
            }
            selectedHost?.takeIf { it.projects.isNotEmpty() }?.let { host ->
                PoracodeChoiceSection(
                    label = "Target project",
                    options = host.projects.map { (id, name) -> PoracodeChoiceOption(id, name) },
                    selectedId = selectedProjectId,
                    onSelect = { selectedProjectId = it },
                )
            }
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = PoracodeTheme.colors.danger) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                FilledTonalButton(
                    onClick = {
                        val hostId = selectedHost?.hostId ?: return@FilledTonalButton
                        val projId = selectedProjectId.ifBlank { selectedHost.projects.firstOrNull()?.first.orEmpty() }
                        if (projId.isBlank()) return@FilledTonalButton
                        busy = true
                        error = null
                        scope.launch {
                            onTransfer(hostId, projId)
                                .onSuccess { onDismiss() }
                                .onFailure { error = it.message ?: "Transfer failed"; busy = false }
                        }
                    },
                    enabled = !busy && selectedHost != null && selectedProjectId.isNotBlank(),
                ) {
                    Text("Move")
                }
            }
        }
    }
}

data class ConversationSearchHitUi(
    val threadId: String,
    val snippet: String,
    val matchCount: Int,
)

/**
 * Remote full-text saved-message search sheet backed by `RemoteApiClient.searchConversations`.
 */
@Composable
internal fun ConversationFullTextSearchSheet(
    apiClient: RemoteApiClient?,
    onOpenThread: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var hits by remember { mutableStateOf<List<RemoteConversationSearchEntry>>(emptyList()) }

    LaunchedEffect(query, apiClient) {
        val trimmed = query.trim()
        if (apiClient == null || trimmed.length < 2) {
            hits = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        delay(250L)
        val result = runCatching { apiClient.searchConversations(trimmed) }.getOrNull()
        hits = result?.entries.orEmpty()
        loading = false
    }

    PoracodeSheet(onDismissRequest = onDismiss, title = "Search messages") {
        Column(Modifier.fillMaxWidth().heightIn(max = 500.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PoracodeInlineSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search conversation messages…",
                modifier = Modifier.fillMaxWidth(),
            )
            if (loading) {
                CircularProgressIndicator()
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(hits, key = { "${it.threadId}:${it.itemId}" }) { hit ->
                        PoracodeCard(modifier = Modifier.clickable { onDismiss(); onOpenThread(hit.threadId) }) {
                            Text(
                                hit.title.ifBlank { hit.projectName },
                                style = PoracodeTextStyles.rowTitle,
                                color = colors.foreground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                hit.excerpt,
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.muted,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}
