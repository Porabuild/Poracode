package com.poracode.app.ui.richchat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.poracode.app.session.richchat.acknowledgeHistoryGap
import com.poracode.app.session.richchat.readHistoryGapIfSupported
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
    userHiddenModels: kotlinx.serialization.json.JsonObject? = null,
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
    val sessionActionsState by runtime.sessionActions.state.collectAsStateWithLifecycle()
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
    // Session-action inventory: one live read per selected thread, status
    // change, and owner-axis change (host, presentation, provider instance,
    // live SessionRef). Only the typed old-host answer collapses the inventory
    // quietly — every other failure stays visible with a retry.
    LaunchedEffect(
        state.selection?.generation,
        state.selection?.host?.key,
        state.selection?.threadId,
        thread?.status,
        RichChatUiLogic.sessionActionOwnerKey(thread),
    ) {
        if (state.selection != null) runtime.sessionActions.refreshInventory()
    }
    LaunchedEffect(sessionActionsState.needsAuthoritativeRefresh) {
        if (sessionActionsState.needsAuthoritativeRefresh) {
            runtime.refreshSelectedThread()
            runtime.sessionActions.acknowledgeAuthoritativeRefresh()
            // The ambiguous mutation may have replaced the session; the
            // inventory is read fresh instead of trusting the old list.
            runtime.sessionActions.refreshInventory()
        }
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

    /** Sends, or while a turn is active steers by default / queues on the
     * long-press affordance — desktop parity through followUpSubmitAction. */
    fun submitComposer(queueInsteadOfSteer: Boolean) {
        scope.launch {
            when (
                submitRichChatComposer(
                    runtime = runtime,
                    draft = draft,
                    configuration = composerConfiguration,
                    queuedSegments = queuedSegments,
                    attachments = attachments,
                    isTurnActive = isTurnActive,
                    activeRequest = state.transcript?.openRequests?.firstOrNull(),
                    queueInsteadOfSteer = queueInsteadOfSteer,
                )
            ) {
                is RichChatOperationResult.Success -> {
                    draft = ""
                    attachments = emptyList()
                    queuedSegments = emptyList()
                }
                else -> Unit
            }
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            RichChatThreadTopBar(
                title = title,
                thread = thread,
                gitSummary = gitSummary,
                showBack = showBack,
                hasSelection = state.selection != null,
                refreshing = refreshing,
                mutating = mutating,
                canMutate = canMutate,
                closeThreadLabel = closeThreadLabel,
                runtime = runtime,
                threadLifecycleController = threadLifecycleController,
                projectLocation = projectLocation,
                onBack = onBack,
                onShowCloseDialog = { showCloseDialog = true },
            )
        },
        bottomBar = {
            if (!ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
                RichChatThreadComposerSection(
                    userHiddenModels = userHiddenModels,
                    runtime = runtime,
                    contextKey = threadId,
                    sessionActionOwnerKey = RichChatUiLogic.sessionActionOwnerKey(
                        currentThreadForComposer,
                    ),
                    canOperate = canOperate,
                    enabled = canOperate && state.selection != null && !refreshing,
                    draft = draft,
                    attachments = attachments,
                    sending = sending,
                    uploading = uploading,
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
                    currentThread = currentThreadForComposer,
                    followUpQueue = state.transcript?.followUpQueue,
                    contextUsage = state.transcript?.contextUsage,
                    mentionItems = state.transcript?.itemsInOrder.orEmpty(),
                    workspaceFiles = workspaceFiles,
                    mentionThreads = mentionThreads,
                    isTurnActive = isTurnActive,
                    queuedSegments = queuedSegments,
                    sessionActionIds = if (state.selection != null) {
                        sessionActionsState.actionIds
                    } else {
                        null
                    },
                    sessionActionsState = sessionActionsState,
                    onSessionActionInvoke = runtime.sessionActions::invoke,
                    onSessionActionRefreshInventory = {
                        scope.launch { runtime.sessionActions.refreshInventory() }
                    },

                    onInsertIntoComposer = { suggestion ->
                        // Explicit draft insertion only; the suggestion is
                        // never sent by the app itself.
                        draft = if (draft.isBlank()) suggestion else "$draft\n$suggestion"
                    },

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
                    onSend = { submitComposer(queueInsteadOfSteer = false) },
                    onQueueSend = { submitComposer(queueInsteadOfSteer = true) },
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
                onRefresh = { runtime.refreshSelectedThread() },
                historyNotice = state.historyNotice,
                onAcknowledgeNotice = { scope.launch { runtime.chat.acknowledgeHistoryGap() } },
                onRetryNoticeCheck = {
                    scope.launch {
                        val lease = runtime.chat.selection.value
                        if (lease != null) runtime.chat.readHistoryGapIfSupported(lease)
                    }
                },
            )
            RichChatThreadConfirmDialogs(
                runtime = runtime,
                scope = scope,
                pendingTruncateItemId = pendingTruncateItemId,
                pendingRevertItemId = pendingRevertItemId,
                showCloseDialog = showCloseDialog,
                mutating = mutating,
                transcriptItems = state.transcript?.itemsInOrder.orEmpty(),
                selectionThreadId = state.selection?.threadId,
                onBack = onBack,
                onDismissTruncate = { pendingTruncateItemId = null },
                onDismissRevert = { pendingRevertItemId = null },
                onDismissClose = { showCloseDialog = false },
            )
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
                                    state.olderTurnsCursor,
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
                                    state.olderTurnsCursor,
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
