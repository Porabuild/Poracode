package com.poracode.app.ui.richchat

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.ThreadPresentationPolicy
import com.poracode.app.session.richchat.RichChatLoadPhase
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.ui.GitSummaryText
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.terminal.RichTerminalPane
import kotlinx.coroutines.launch

private enum class AttachmentUiError { Invalid, UploadFailed }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RichChatThreadScreen(
    runtime: RichChatSessionRuntime,
    thread: RemoteThread?,
    projectLocation: ProjectLocation?,
    canOperate: Boolean,
    showBack: Boolean,
    onBack: () -> Unit,
    gitSummary: RemoteGitSummary?,
    modifier: Modifier = Modifier,
) {
    if (showBack) BackHandler(onBack = onBack)
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpointState by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val threadId = state.selection?.threadId ?: thread?.id.orEmpty()
    var draft by rememberSaveable(threadId) { mutableStateOf("") }
    var attachments by rememberSaveable(threadId, stateSaver = attachmentSaver) {
        mutableStateOf(emptyList())
    }
    var uploading by rememberSaveable(threadId) { mutableStateOf(false) }
    var attachmentError by rememberSaveable(threadId) {
        mutableStateOf<AttachmentUiError?>(null)
    }
    val sending = RichChatUiLogic.generationActive(
        state.activeOperations,
        hasOpenTurn = state.transcript?.openTurn == true,
    )
    val refreshing = "history" in state.activeOperations
    val mutating = state.activeOperations.any { it != "history" && it != "older" }
    val title = thread?.title?.ifBlank { null } ?: stringResource(R.string.rich_chat_conversation)
    var pendingTruncateItemId by rememberSaveable(threadId) { mutableStateOf<String?>(null) }
    var showCloseDialog by rememberSaveable(threadId) { mutableStateOf(false) }
    val canMutate = canOperate && state.selection != null && !mutating && !refreshing
    val closeThreadLabel = stringResource(R.string.rich_chat_close_thread)

    LaunchedEffect(state.selection?.generation, projectLocation) {
        val selection = state.selection ?: return@LaunchedEffect
        val location = projectLocation ?: return@LaunchedEffect
        runtime.checkpoints.refresh(
            RichChatUiLogic.checkpointListPayload(selection.threadId, location),
        )
    }
    LaunchedEffect(state.needsAuthoritativeRefresh) {
        if (state.needsAuthoritativeRefresh) runtime.refreshSelectedThread()
    }
    LaunchedEffect(checkpointState.needsAuthoritativeRefresh) {
        if (checkpointState.needsAuthoritativeRefresh) {
            runtime.refreshSelectedThread()
            val selection = state.selection
            val location = projectLocation
            if (selection != null && location != null) {
                runtime.checkpoints.refresh(
                    RichChatUiLogic.checkpointListPayload(selection.threadId, location),
                )
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
                        GitSummaryText.CompactLine(
                            summary = gitSummary,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                },
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.rich_chat_back),
                            )
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = runtime::refreshSelectedThread,
                        enabled = state.selection != null && !refreshing && !mutating,
                    ) {
                        Icon(
                            Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.rich_chat_refresh_transcript),
                        )
                    }
                    if (state.selection != null) {
                        IconButton(
                            onClick = { showCloseDialog = true },
                            enabled = canMutate,
                            modifier = Modifier.semantics { contentDescription = closeThreadLabel },
                        ) {
                            Icon(Icons.Outlined.PowerSettingsNew, contentDescription = null)
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
                RichChatComposer(
                    contextKey = threadId,
                    contextUsage = state.transcript?.contextUsage,
                    draft = draft,
                    attachments = attachments,
                    sending = sending,
                    uploading = uploading,
                    enabled = canOperate && state.selection != null && !refreshing,
                    errorText = attachmentError?.let {
                        stringResource(
                            if (it == AttachmentUiError.Invalid) {
                                R.string.rich_chat_attachment_invalid
                            } else {
                                R.string.rich_chat_attachment_upload_failed
                            },
                        )
                    },
                    onDraftChange = { draft = it },
                    onAttachmentUri = { uri ->
                        uploadAttachment(
                            uri,
                            context,
                            runtime,
                            scope,
                            onStart = { uploading = true; attachmentError = null },
                            onFinish = { uploading = false },
                            onFailure = { attachmentError = it },
                            onSuccess = { attachments = attachments + it },
                        )
                    },
                    onRemoveAttachment = { target -> attachments = attachments - target },
                    onSend = {
                        scope.launch {
                            when (
                                runtime.chat.send(
                                    prompt = draft,
                                    segments = RichChatUiLogic.attachmentSegments(attachments),
                                )
                            ) {
                                is RichChatOperationResult.Success -> {
                                    draft = ""
                                    attachments = emptyList()
                                }
                                else -> Unit
                            }
                        }
                    },
                    onInterrupt = { scope.launch { runtime.chat.interrupt() } },
                )
            }
        },
    ) { padding ->
        if (ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
            RichTerminalPane(
                runtime = runtime,
                canOperate = canOperate,
                projectLocation = projectLocation,
                modifier = Modifier.padding(padding),
            )
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            RichChatStatusBanners(state.failure, state.needsAuthoritativeRefresh, canOperate) {
                runtime.refreshSelectedThread()
            }
            pendingTruncateItemId?.let { itemId ->
                AlertDialog(
                    onDismissRequest = { pendingTruncateItemId = null },
                    title = { Text(stringResource(R.string.rich_chat_truncate_title)) },
                    text = { Text(stringResource(R.string.rich_chat_truncate_message)) },
                    dismissButton = {
                        TextButton(onClick = { pendingTruncateItemId = null }) {
                            Text(stringResource(R.string.rich_chat_cancel))
                        }
                    },
                    confirmButton = {
                        Button(
                            enabled = !mutating,
                            onClick = {
                                val captured = itemId
                                pendingTruncateItemId = null
                                scope.launch { runtime.chat.truncate(captured) }
                            },
                        ) { Text(stringResource(R.string.rich_chat_truncate)) }
                    },
                )
            }
            if (showCloseDialog) {
                AlertDialog(
                    onDismissRequest = { showCloseDialog = false },
                    title = { Text(stringResource(R.string.rich_chat_close_thread_title)) },
                    text = { Text(stringResource(R.string.rich_chat_close_thread_message)) },
                    dismissButton = {
                        TextButton(onClick = { showCloseDialog = false }) {
                            Text(stringResource(R.string.rich_chat_cancel))
                        }
                    },
                    confirmButton = {
                        Button(
                            enabled = !mutating,
                            onClick = {
                                showCloseDialog = false
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
                        ) { Text(stringResource(R.string.rich_chat_close_thread_action)) }
                    },
                )
            }
            when (state.loadPhase) {
                RichChatLoadPhase.Idle, RichChatLoadPhase.Loading -> LoadingStateView(
                    stringResource(R.string.rich_chat_loading_transcript),
                )
                RichChatLoadPhase.Failed -> ErrorStateView(
                    message = richChatFailureText(state.failure)
                        ?: stringResource(R.string.rich_chat_request_failed),
                    onRetry = runtime::refreshSelectedThread,
                    retryLabel = stringResource(R.string.rich_chat_retry),
                )
                RichChatLoadPhase.Empty -> EmptyStateView(
                    title = stringResource(R.string.rich_chat_empty_title),
                    message = stringResource(R.string.rich_chat_empty_message),
                )
                RichChatLoadPhase.Loaded -> {
                    val transcript = state.transcript ?: return@Column
                    BoxWithConstraints(Modifier.fillMaxSize()) {
                        val controlContent: @Composable (Modifier) -> Unit = { controlModifier ->
                            RichChatControlPanel(
                                runtime = runtime,
                                items = transcript.itemsInOrder,
                                requests = transcript.openRequests,
                                pendingSteer = transcript.pendingSteer,
                                checkpointState = checkpointState,
                                projectLocation = projectLocation,
                                selection = state.selection,
                                config = state.config,
                                canOperate = canOperate,
                                busy = mutating || refreshing,
                                modifier = controlModifier,
                            )
                        }
                        if (maxWidth >= 760.dp) {
                            Row(Modifier.fillMaxSize()) {
                                RichTimelineView(
                                    transcript,
                                    state.olderCursor,
                                    state.loadingOlder || refreshing,
                                    runtime,
                                    onLoadOlder = { scope.launch { runtime.chat.loadOlder() } },
                                    canTruncate = canMutate,
                                    onTruncateItem = { pendingTruncateItemId = it },
                                    modifier = Modifier.weight(1f),
                                )
                                VerticalDivider()
                                controlContent(
                                    Modifier
                                        .width(320.dp)
                                        .verticalScroll(rememberScrollState())
                                        .padding(12.dp),
                                )
                            }
                        } else {
                            Column(Modifier.fillMaxSize()) {
                                controlContent(
                                    Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 280.dp)
                                        .verticalScroll(rememberScrollState())
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                                HorizontalDivider()
                                RichTimelineView(
                                    transcript,
                                    state.olderCursor,
                                    state.loadingOlder || refreshing,
                                    runtime,
                                    onLoadOlder = { scope.launch { runtime.chat.loadOlder() } },
                                    canTruncate = canMutate,
                                    onTruncateItem = { pendingTruncateItemId = it },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RichChatStatusBanners(
    failure: RichChatOperationFailure?,
    needsRefresh: Boolean,
    canOperate: Boolean,
    onRefresh: () -> Unit,
) {
    failure?.let {
        Text(
            richChatFailureText(it) ?: stringResource(R.string.rich_chat_request_failed),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
    }
    if (needsRefresh) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
        ) {
            Text(
                stringResource(R.string.rich_chat_refresh_required),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = onRefresh) { Text(stringResource(R.string.rich_chat_retry)) }
        }
    }
    if (!canOperate) {
        Text(
            stringResource(R.string.rich_chat_read_only),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun richChatFailureText(failure: RichChatOperationFailure?): String? = when (failure) {
    null -> null
    RichChatOperationFailure.NoSession -> stringResource(R.string.rich_chat_no_session)
    RichChatOperationFailure.Offline -> stringResource(R.string.rich_chat_offline)
    RichChatOperationFailure.SessionNotReady -> stringResource(R.string.rich_chat_session_not_ready)
    RichChatOperationFailure.NoThread -> stringResource(R.string.rich_chat_no_thread)
    RichChatOperationFailure.Backgrounded -> stringResource(R.string.rich_chat_backgrounded)
    RichChatOperationFailure.AuthenticationRequired -> stringResource(R.string.rich_chat_auth_required)
    is RichChatOperationFailure.AuthorizationDenied -> stringResource(R.string.rich_chat_permission_denied)
    RichChatOperationFailure.InvalidRequest -> stringResource(R.string.rich_chat_invalid_request)
    RichChatOperationFailure.InvalidResponse -> stringResource(R.string.rich_chat_invalid_response)
    is RichChatOperationFailure.Remote -> stringResource(
        if (failure.requestMayHaveCommitted) {
            R.string.rich_chat_request_uncertain
        } else {
            R.string.rich_chat_request_failed
        },
    )
}

private fun uploadAttachment(
    uri: Uri,
    context: android.content.Context,
    runtime: RichChatSessionRuntime,
    scope: kotlinx.coroutines.CoroutineScope,
    onStart: () -> Unit,
    onFinish: () -> Unit,
    onFailure: (AttachmentUiError) -> Unit,
    onSuccess: (UploadedAttachment) -> Unit,
) {
    scope.launch {
        onStart()
        try {
            val picked = prepareAttachment(context, uri)
            if (picked == null) {
                onFailure(AttachmentUiError.Invalid)
                return@launch
            }
            when (
                val result = runtime.media.uploadAttachment(
                    picked.name,
                    picked.mimeType,
                    picked.body,
                )
            ) {
                is RichChatOperationResult.Success -> onSuccess(
                    UploadedAttachment(picked.name, picked.mimeType, result.value),
                )
                else -> onFailure(AttachmentUiError.UploadFailed)
            }
        } finally {
            onFinish()
        }
    }
}

private val attachmentSaver = listSaver<List<UploadedAttachment>, String>(
    save = { values -> values.flatMap { listOf(it.name, it.mimeType, it.remotePath) } },
    restore = { values ->
        values.chunked(3).mapNotNull { chunk ->
            if (chunk.size == 3) UploadedAttachment(chunk[0], chunk[1], chunk[2]) else null
        }
    },
)
