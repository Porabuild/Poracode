package com.poracode.app.ui.richchat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.ThreadPresentationPolicy
import com.poracode.app.session.projects.ProjectOperationResult
import com.poracode.app.session.projects.ProjectWorkspaceController
import com.poracode.app.session.richchat.RichChatLoadPhase
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.GitSummaryText
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.terminal.RichTerminalPane
import com.poracode.app.ui.thread.ThreadLifecycleActions
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RichChatThreadScreen(
    runtime: RichChatSessionRuntime,
    threadLifecycleController: ThreadLifecycleController,
    thread: RemoteThread?,
    agentStatus: AgentStatusEntry?,
    projectLocation: ProjectLocation?,
    canOperate: Boolean,
    showBack: Boolean,
    onBack: () -> Unit,
    onOpenAgentSettings: () -> Unit,
    gitSummary: RemoteGitSummary?,
    mentionThreads: List<RemoteThread> = emptyList(),
    workspaceController: ProjectWorkspaceController? = null,
    workspaceTarget: ProjectWorkspaceTarget? = null,
    terminalTextSizeSp: Int = 13,
    modifier: Modifier = Modifier,
) {
    if (showBack) BackHandler(onBack = onBack)
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpointState by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val threadId = state.selection?.threadId ?: thread?.id.orEmpty()
    val initialConfiguration = thread?.config ?: ThreadConfig()
    var draft by rememberSaveable(threadId) { mutableStateOf("") }
    var composerConfiguration by rememberSaveable(
        threadId,
        stateSaver = threadConfigSaver,
    ) { mutableStateOf(initialConfiguration) }
    var baseConfiguration by rememberSaveable(
        threadId,
        stateSaver = threadConfigSaver,
    ) { mutableStateOf(initialConfiguration) }
    var attachments by rememberSaveable(threadId, stateSaver = attachmentSaver) {
        mutableStateOf(emptyList())
    }
    var queuedSegments by rememberSaveable(threadId, stateSaver = promptSegmentsSaver) {
        mutableStateOf(emptyList())
    }
    var uploading by rememberSaveable(threadId) { mutableStateOf(false) }
    var attachmentError by rememberSaveable(threadId) {
        mutableStateOf<AttachmentUiError?>(null)
    }
    var workspaceFiles by remember(threadId) {
        mutableStateOf(emptyList<ProjectFileEntry>())
    }
    val isTurnActive = RichChatUiLogic.generationActive(
        state.activeOperations,
        hasOpenTurn = state.transcript?.openTurn == true,
    )
    val currentThreadForComposer = thread
        ?: mentionThreads.firstOrNull { it.id == state.selection?.threadId }
    val sending = "send" in state.activeOperations
    val refreshing = "history" in state.activeOperations
    val mutating = state.activeOperations.any { it != "history" && it != "older" }
    val title = thread?.title?.ifBlank { null } ?: stringResource(R.string.rich_chat_conversation)
    var pendingTruncateItemId by rememberSaveable(threadId) { mutableStateOf<String?>(null) }
    var pendingRevertItemId by rememberSaveable(threadId) { mutableStateOf<String?>(null) }
    var showCloseDialog by rememberSaveable(threadId) { mutableStateOf(false) }
    val canMutate = canOperate && state.selection != null && !mutating && !refreshing
    val closeThreadLabel = stringResource(R.string.rich_chat_close_thread)
    val canConfigure = canOperate && agentStatus != null &&
        (thread?.canResumeWithConfig == true || thread?.status == "launching")

    LaunchedEffect(
        RichChatMentionCatalog.trailingMentionQuery(draft),
        state.selection?.generation,
        workspaceController,
        workspaceTarget,
    ) {
        workspaceFiles = emptyList()
        val query = RichChatMentionCatalog.trailingMentionQuery(draft) ?: return@LaunchedEffect
        val controller = workspaceController ?: return@LaunchedEffect
        val target = workspaceTarget ?: return@LaunchedEffect
        if (query.isNotEmpty()) delay(150)
        when (val result = controller.searchFiles(target, query, limit = 20)) {
            is ProjectOperationResult.Success -> workspaceFiles = result.value.entries
            else -> Unit
        }
    }

    LaunchedEffect(state.config, thread?.config) {
        val currentBase = state.config ?: thread?.config ?: return@LaunchedEffect
        composerConfiguration = synchronizeComposerConfiguration(
            composerConfiguration,
            baseConfiguration,
            currentBase,
        )
        baseConfiguration = currentBase
    }

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
                    if (thread != null && projectLocation != null) {
                        ThreadLifecycleActions(
                            thread = thread,
                            projectLocation = projectLocation,
                            controller = threadLifecycleController,
                            enabled = canMutate,
                            onThreadRemoved = onBack,
                        )
                    }
                },
            )
        },
        bottomBar = {
            if (!ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
                Column(Modifier.imePadding().navigationBarsPadding()) {
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
                                when (it) {
                                    AttachmentUiError.Invalid -> R.string.rich_chat_attachment_invalid
                                    AttachmentUiError.UploadFailed -> R.string.rich_chat_attachment_upload_failed
                                    AttachmentUiError.CameraUnavailable -> R.string.rich_chat_camera_unavailable
                                },
                            )
                        },
                        configuration = composerConfiguration,
                        agentStatus = agentStatus,
                        canConfigure = canConfigure,
                        threadSlashCommands = thread?.slashCommands,
                        currentThread = currentThreadForComposer,
                        mentionItems = state.transcript?.itemsInOrder.orEmpty(),
                        workspaceFiles = workspaceFiles,
                        mentionThreads = mentionThreads,
                        isTurnActive = isTurnActive,
                        queuedSegments = queuedSegments,
                        onDraftChange = { draft = it },
                        onConfigurationChange = { composerConfiguration = it },
                        onQueueSegment = { segment ->
                            if (queuedSegments.none { it == segment }) queuedSegments += segment
                        },
                        onRemoveSegment = { segment ->
                            queuedSegments = queuedSegments.filterNot { it == segment }
                        },
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
                        onCameraUnavailable = { attachmentError = AttachmentUiError.CameraUnavailable },
                        onSend = {
                            scope.launch {
                                when (submitRichChatComposer(
                                    runtime = runtime,
                                    draft = draft,
                                    configuration = composerConfiguration,
                                    queuedSegments = queuedSegments,
                                    attachments = attachments,
                                    isTurnActive = isTurnActive,
                                    activeRequest = state.transcript?.openRequests?.firstOrNull(),
                                )) {
                                    is RichChatOperationResult.Success -> {
                                        draft = ""
                                        attachments = emptyList()
                                        queuedSegments = emptyList()
                                    }
                                    else -> Unit
                                }
                            }
                        },
                        onInterrupt = { scope.launch { runtime.chat.interrupt() } },
                    )
                }
            }
        },
    ) { padding ->
        if (ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
            RichTerminalPane(
                runtime = runtime,
                canOperate = canOperate,
                projectLocation = projectLocation,
                textSizeSp = terminalTextSizeSp,
                modifier = Modifier.padding(padding),
            )
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Mirrors iOS's merged status view: a checkpoint restore/rollback/load failure is
            // otherwise only visible if the checkpoints sheet happens to be open.
            RichChatStatusBanners(
                state.failure ?: checkpointState.failure,
                state.needsAuthoritativeRefresh,
                canOperate,
            ) {
                runtime.refreshSelectedThread()
            }
            pendingTruncateItemId?.let { itemId ->
                RichChatTruncateConfirmDialog(
                    enabled = !mutating,
                    onDismiss = { pendingTruncateItemId = null },
                    onConfirm = {
                        pendingTruncateItemId = null
                        scope.launch { runtime.chat.truncate(itemId) }
                    },
                )
            }
            pendingRevertItemId?.let { userItemId ->
                RichChatRevertConfirmDialog(
                    enabled = !mutating,
                    onDismiss = { pendingRevertItemId = null },
                    onConfirm = {
                        val items = state.transcript?.itemsInOrder.orEmpty()
                        val checkpointItemId =
                            RichChatUiLogic.revertCheckpointItemId(items, userItemId)
                        val selection = state.selection
                        pendingRevertItemId = null
                        if (checkpointItemId != null && selection != null) {
                            scope.launch {
                                runtime.checkpoints.revert(
                                    RichChatUiLogic.checkpointRevertPayload(
                                        selection.threadId,
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
                    onDismiss = { showCloseDialog = false },
                    onConfirm = {
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
                        if (maxWidth >= 760.dp) {
                            Row(Modifier.fillMaxSize()) {
                                RichTimelineView(
                                    transcript,
                                    state.olderCursor,
                                    state.loadingOlder || refreshing,
                                    runtime,
                                    onLoadOlder = { scope.launch { runtime.chat.loadOlder() } },
                                    canMutate = canMutate,
                                    onTruncateItem = { pendingTruncateItemId = it },
                                    revertableItemIds = revertableItemIds,
                                    onRevertItem = { pendingRevertItemId = it },
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
                                RichTimelineView(
                                    transcript,
                                    state.olderCursor,
                                    state.loadingOlder || refreshing,
                                    runtime,
                                    onLoadOlder = { scope.launch { runtime.chat.loadOlder() } },
                                    canMutate = canMutate,
                                    onTruncateItem = { pendingTruncateItemId = it },
                                    revertableItemIds = revertableItemIds,
                                    onRevertItem = { pendingRevertItemId = it },
                                    modifier = Modifier.weight(1f),
                                )
                                RichChatCompactControlDock(
                                    runtime = runtime,
                                    items = transcript.itemsInOrder,
                                    agentStatus = agentStatus,
                                    requests = transcript.openRequests,
                                    pendingSteer = transcript.pendingSteer,
                                    checkpointState = checkpointState,
                                    projectLocation = projectLocation,
                                    selection = state.selection,
                                    config = state.config,
                                    canOperate = canOperate,
                                    busy = mutating || refreshing,
                                    onOpenAgentSettings = onOpenAgentSettings,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
