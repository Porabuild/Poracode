package com.poracode.app.ui.thread

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.protocol.RuntimeEventSchema
import com.poracode.app.session.AppSession
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import kotlinx.coroutines.flow.distinctUntilChanged

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadDetailScreen(
    state: AppSession.UiState,
    onBack: () -> Unit,
    onLoadOlder: () -> Unit,
    /** Invoked with prompt text and a completion callback; clear draft only on success. */
    onSend: (text: String, onResult: (Boolean) -> Unit) -> Unit,
    onInterrupt: () -> Unit,
    showBack: Boolean,
    modifier: Modifier = Modifier,
) {
    if (showBack) {
        BackHandler(onBack = onBack)
    }

    val thread = state.threadSnapshot?.thread
        ?: state.snapshot?.threads?.firstOrNull { it.id == state.openThreadId }
    val title = thread?.title?.ifBlank { null }
        ?: stringResource(R.string.thread_fallback_title)
    // Survive rotation / process recreation for the open thread's draft.
    // Never clear preemptively — only after RemoteApiClient confirms success.
    var draft by rememberSaveable(state.openThreadId) { mutableStateOf("") }
    val listState = rememberLazyListState()

    val backCd = stringResource(R.string.back)
    val interruptCd = stringResource(R.string.interrupt_thread)

    LaunchedEffect(listState, state.threadOlderCursor) {
        snapshotFlow {
            listState.firstVisibleItemIndex to state.threadOlderCursor
        }
            .distinctUntilChanged()
            .collect { (index, cursor) ->
                if (index <= 1 && cursor != null && !state.isLoadingOlder) {
                    onLoadOlder()
                }
            }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title, maxLines = 1)
                        thread?.let {
                            Text(
                                stringResource(R.string.thread_status_line, it.agentKind, it.status),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    if (showBack) {
                        IconButton(
                            onClick = onBack,
                            modifier = Modifier.semantics { contentDescription = backCd },
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                        }
                    }
                },
                actions = {
                    if (state.canSessionOperate) {
                        IconButton(
                            onClick = onInterrupt,
                            modifier = Modifier.semantics { contentDescription = interruptCd },
                        ) {
                            Icon(Icons.Filled.Stop, contentDescription = null)
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (state.canSessionOperate) {
                ComposerBar(
                    draft = draft,
                    onDraftChange = { draft = it },
                    isSending = state.isSending,
                    onSend = {
                        val text = draft
                        onSend(text) { success ->
                            if (success) {
                                draft = ""
                            }
                        }
                    },
                    onInterrupt = onInterrupt,
                )
            }
        },
    ) { padding ->
        when (state.threadLoadState) {
            AppSession.LoadState.Loading, AppSession.LoadState.Idle -> {
                LoadingStateView(
                    stringResource(R.string.loading_transcript),
                    modifier = Modifier.padding(padding),
                )
            }
            AppSession.LoadState.Failed -> {
                ErrorStateView(
                    message = state.threadLoadError
                        ?: stringResource(R.string.failed_load_transcript),
                    modifier = Modifier.padding(padding),
                )
            }
            AppSession.LoadState.Empty -> {
                EmptyStateView(
                    title = stringResource(R.string.empty_transcript_title),
                    message = stringResource(R.string.empty_transcript_message),
                    modifier = Modifier.padding(padding),
                )
            }
            AppSession.LoadState.Loaded -> {
                // Presentation grouping: parentItemId children nest under parent;
                // recursive children retained (never top-level duplicate/discard).
                val grouped = RuntimeEventSchema.groupForPresentation(state.threadItems)
                TranscriptList(
                    presentation = grouped,
                    isLoadingOlder = state.isLoadingOlder,
                    hasOlder = state.threadOlderCursor != null,
                    onLoadOlder = onLoadOlder,
                    listState = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                )
            }
        }
    }
}

@Composable
private fun TranscriptList(
    presentation: List<RuntimeEventSchema.PresentationItem>,
    isLoadingOlder: Boolean,
    hasOlder: Boolean,
    onLoadOlder: () -> Unit,
    listState: androidx.compose.foundation.lazy.LazyListState,
    modifier: Modifier = Modifier,
) {
    val transcriptCd = stringResource(R.string.thread_transcript)
    val loadOlderCd = stringResource(R.string.load_older_messages)
    LazyColumn(
        modifier = modifier.semantics { contentDescription = transcriptCd },
        state = listState,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (hasOlder || isLoadingOlder) {
            item(key = "older") {
                TextButton(
                    onClick = onLoadOlder,
                    enabled = !isLoadingOlder,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = loadOlderCd },
                ) {
                    Text(
                        if (isLoadingOlder) {
                            stringResource(R.string.loading_older)
                        } else {
                            stringResource(R.string.load_older_messages)
                        },
                    )
                }
            }
        }
        items(presentation, key = { it.item.id }) { node ->
            PresentationNodeCard(node, depth = 0)
        }
    }
}

@Composable
private fun PresentationNodeCard(
    node: RuntimeEventSchema.PresentationItem,
    depth: Int,
) {
    Column(Modifier.fillMaxWidth()) {
        TranscriptItemCard(node.item, depth = depth)
        for (child in node.children) {
            PresentationNodeCard(child, depth = depth + 1)
        }
    }
}

@Composable
private fun TranscriptItemCard(item: PersistedRuntimeItem, depth: Int = 0) {
    val isUser = item.type.contains("user", ignoreCase = true)
    val indent = (depth * 12).dp
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (isUser) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = indent)
            .semantics {
                contentDescription = "${item.type}: ${item.displayText.take(120)}"
            },
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                item.type,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                item.displayText,
                style = MaterialTheme.typography.bodyMedium,
            )
            if (item.state != "completed") {
                Spacer(Modifier.height(4.dp))
                Text(
                    item.state,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun ComposerBar(
    draft: String,
    onDraftChange: (String) -> Unit,
    isSending: Boolean,
    onSend: () -> Unit,
    onInterrupt: () -> Unit,
) {
    val messageCd = stringResource(R.string.message_input)
    val sendCd = stringResource(R.string.send_message)
    val stopCd = stringResource(R.string.stop_generation)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        OutlinedTextField(
            value = draft,
            onValueChange = onDraftChange,
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .semantics { contentDescription = messageCd },
            placeholder = { Text(stringResource(R.string.message_placeholder)) },
            maxLines = 6,
            enabled = !isSending,
        )
        Spacer(Modifier.width(8.dp))
        FilledIconButton(
            onClick = onSend,
            enabled = draft.isNotBlank() && !isSending,
            modifier = Modifier
                .height(48.dp)
                .width(48.dp)
                .semantics { contentDescription = sendCd },
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
        }
        Spacer(Modifier.width(4.dp))
        Button(
            onClick = onInterrupt,
            modifier = Modifier
                .height(48.dp)
                .semantics { contentDescription = stopCd },
        ) {
            Text(stringResource(R.string.stop))
        }
    }
}
