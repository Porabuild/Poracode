package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.ThreadPresentationPolicy
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.projects.ProjectWorkspaceController
import com.poracode.app.session.richchat.RichChatLoadPhase
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.acknowledgeHistoryGap
import com.poracode.app.session.richchat.readHistoryGapIfSupported
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.home.canMoveThreadToWorktree
import com.poracode.app.ui.terminal.RichTerminalPane
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RichChatThreadScreen(
    runtime: RichChatSessionRuntime,
    userHiddenModels: kotlinx.serialization.json.JsonObject? = null,
    threadLifecycleController: ThreadLifecycleController,
    thread: RemoteThread?,
    /** The live catalog row; a resume relaunch is admitted against it, never the history read. */
    catalogThread: RemoteThread? = null,
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
    forksSupported: Boolean = false,
    onOpenThread: (String) -> Unit = {},
    onOpenWorkspaceGit: () -> Unit = {},
    onMoveToWorktree: ((Boolean) -> Unit)? = null,
    handoffAgents: List<AgentStatusEntry> = emptyList(),
    onOpenProjectUtility: (HomeProjectUtility) -> Unit = {},
    projectName: String? = null, hostName: String? = null, hostOnline: Boolean = false,
    project: RemoteProject? = null,
    projectRuntime: ProjectSessionRuntime? = null,
    browserMirror: BrowserMirrorComposition? = null,
    ports: PortForwardRuntime? = null,
    openExternalUrl: (String) -> Unit = {},
    onOpenBrowserMirror: () -> Unit = {},
    onManagePorts: () -> Unit = {},
    draftStore: RichChatComposerDraftStore? = null,
    draftKey: String? = null,
    leadingToolbarControls: (@Composable RowScope.() -> Unit)? = null,
    inSplitShell: Boolean = false,
    tabletopTopHeightDp: Float = 0f,
    tabletopHingeHeightDp: Float = 0f,
    findToggleSeq: Int = 0,
    inspectorOpen: Boolean = false,
    onToggleInspector: () -> Unit = {},
    onCloseInspector: () -> Unit = {},
    preferredInspectorWidthDp: Int = 0,
    onCommitInspectorWidthDp: (Int) -> Unit = {},
    onResetInspectorWidth: () -> Unit = {},
    modifier: Modifier = Modifier,
    providerUsageControl: @Composable (RemoteThread?, AgentStatusEntry?) -> Unit = { _, _ -> },
) {
    val backModifier = rememberPredictiveBackModifier(enabled = showBack, onBack = onBack)
    val state by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpointState by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val sessionActionsState by runtime.sessionActions.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val threadId = state.selection?.threadId ?: thread?.id.orEmpty()
    val resolvedDraftKey = draftKey ?: threadId
    val initialConfiguration = thread?.config ?: ThreadConfig()
    var draft by rememberSaveable(resolvedDraftKey) {
        mutableStateOf(draftStore?.get(resolvedDraftKey).orEmpty())
    }
    val findState = rememberRichChatFindState(threadId, state.transcript?.itemsInOrder.orEmpty())
    LaunchedEffect(findToggleSeq) {
        if (findToggleSeq > 0) findState.toggle()
    }
    var composerConfiguration by rememberSaveable(threadId, stateSaver = threadConfigSaver) {
        mutableStateOf(initialConfiguration)
    }
    var baseConfiguration by rememberSaveable(threadId, stateSaver = threadConfigSaver) {
        mutableStateOf(initialConfiguration)
    }
    var attachments by rememberSaveable(threadId, stateSaver = attachmentSaver) { mutableStateOf(emptyList()) }
    var queuedSegments by rememberSaveable(threadId, stateSaver = promptSegmentsSaver) { mutableStateOf(emptyList()) }
    var uploading by rememberSaveable(threadId) { mutableStateOf(false) }
    var attachmentError by rememberSaveable(threadId) { mutableStateOf<AttachmentUiError?>(null) }
    var workspaceFiles by remember(threadId) { mutableStateOf(emptyList<ProjectFileEntry>()) }
    val currentThreadForComposer = RichChatResumePlanner.threadForComposer(
        catalogThread,
        thread ?: mentionThreads.firstOrNull { it.id == state.selection?.threadId },
    )
    val resume = rememberRichChatThreadResume(
        runtime, threadId, catalogThread, threadLifecycleController, projectLocation,
    )
    val isTurnActive = resume.isTurnActive(state, currentThreadForComposer)
    val sending = "send" in state.activeOperations
    val refreshing = "history" in state.activeOperations
    val mutating = state.activeOperations.any { it != "history" && it != "older" }
    val title = thread?.title?.ifBlank { null } ?: stringResource(R.string.rich_chat_conversation)
    var pendingTruncateItemId by rememberSaveable(threadId) { mutableStateOf<String?>(null) }
    var pendingRevertItemId by rememberSaveable(threadId) { mutableStateOf<String?>(null) }
    val fileDownloadSnackbarHost = remember { SnackbarHostState() }
    var showCloseDialog by rememberSaveable(threadId) { mutableStateOf(false) }
    var pendingMoveBringChanges by rememberSaveable(threadId) { mutableStateOf<Boolean?>(null) }
    var showHandoff by rememberSaveable(threadId) { mutableStateOf(false) }
    val openBackgroundTask = rememberRichChatBackgroundTaskDetails(runtime, state, sessionActionsState.actionIds, canOperate, scope)
    val canMutate = canOperate && state.selection != null && !mutating && !refreshing
    var forkIntent by rememberSaveable(threadId, state.selection?.host?.connectionId, state.selection?.host?.bindingGeneration, stateSaver = RichChatForkIntent.Saver) { mutableStateOf<RichChatForkIntent?>(null) }
    val canFork = canMutate && forksSupported && thread?.status in listOf("idle", "inactive", "error")
    val forkBoundaryItemId = thread?.forkedFrom?.get("throughItemId")?.jsonPrimitive?.contentOrNull
    val requestFork: ((String) -> Unit)? = if (canFork) { anchor ->
        forkIntent = RichChatForkIntent(threadId, anchor, title)
    } else null
    val closeThreadLabel = stringResource(R.string.rich_chat_close_thread)
    val canConfigure = canOperate && agentStatus != null &&
        (thread?.canResumeWithConfig == true || thread?.status == "launching")
    val resumePlan = resume.plan(currentThreadForComposer, state, canOperate && !uploading,
        composerEmpty = draft.isBlank() && queuedSegments.isEmpty() && attachments.isEmpty())

    RichChatThreadEffects(
        runtime = runtime,
        state = state,
        checkpointState = checkpointState,
        sessionActionsState = sessionActionsState,
        thread = thread,
        draft = draft,
        projectLocation = projectLocation,
        workspaceController = workspaceController,
        workspaceTarget = workspaceTarget,
        composerConfiguration = composerConfiguration,
        baseConfiguration = baseConfiguration,
        onWorkspaceFilesChange = { workspaceFiles = it },
        onConfigurationSynchronized = { nextComposer, nextBase ->
            composerConfiguration = nextComposer
            baseConfiguration = nextBase
        },
    )

    /** Sends, or while a turn is active steers by default / queues on the
     * long-press affordance — desktop parity through followUpSubmitAction. */
    fun submitComposer(queueInsteadOfSteer: Boolean) {
        val rowAtSubmit = currentThreadForComposer
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
                ).also { resume.settle(it, rowAtSubmit) }
            ) {
                is RichChatOperationResult.Success -> {
                    draft = ""
                    draftStore?.clear(resolvedDraftKey)
                    attachments = emptyList()
                    queuedSegments = emptyList()
                }
                else -> Unit
            }
        }
    }

    RichChatForkDialogHost(
        runtime = runtime,
        intent = forkIntent,
        canFork = canFork,
        onDismiss = { forkIntent = null },
        onOpenThread = onOpenThread,
    )
    RichChatMoveAndHandoffOverlays(
        pendingMoveBringChanges = pendingMoveBringChanges,
        onDismissMove = { pendingMoveBringChanges = null },
        onConfirmMove = { bringChanges -> onMoveToWorktree?.invoke(bringChanges) },
        showHandoff = showHandoff,
        thread = thread,
        transcriptItems = state.transcript?.itemsInOrder.orEmpty(),
        agentStatus = agentStatus,
        handoffAgents = handoffAgents,
        controller = threadLifecycleController,
        onDismissHandoff = { showHandoff = false },
        onOpenThread = onOpenThread,
    )
    RichChatThreadSurface(
        modifier = modifier.then(backModifier),
        hasComposer = !ThreadPresentationPolicy.isTerminal(thread?.presentationMode),
        gitSummary = gitSummary, contextUsage = state.transcript?.contextUsage,
        onOpenWorkspaceGit = onOpenWorkspaceGit,
        providerUsageControl = { providerUsageControl(thread, agentStatus) },
        auxiliaryControls = {
            RichChatCompactRuntimeDock(runtime, agentStatus, projectLocation, canOperate, onOpenAgentSettings)
        },
        containerColor = if (inSplitShell) {
            com.poracode.app.ui.theme.PoracodeTheme.colors.paneSurface
        } else {
            com.poracode.app.ui.theme.PoracodeTheme.colors.background
        },
        snackbarHost = { SnackbarHost(fileDownloadSnackbarHost) },
        inSplitShell = inSplitShell,
        tabletopTopHeightDp = tabletopTopHeightDp,
        tabletopHingeHeightDp = tabletopHingeHeightDp,
        inspectorOpen = inspectorOpen,
        onCloseInspector = onCloseInspector,
        preferredInspectorWidthDp = preferredInspectorWidthDp,
        onCommitInspectorWidthDp = onCommitInspectorWidthDp,
        onResetInspectorWidth = onResetInspectorWidth,
        inspectorContent = { panelWidthDp ->
            RichChatRightPanel(
                panelWidthDp = panelWidthDp,
                threadId = threadId,
                thread = thread,
                project = project,
                projectName = projectName,
                projectLocation = projectLocation,
                workspaceTarget = workspaceTarget,
                gitSummary = gitSummary,
                agentStatus = agentStatus,
                canOperate = canOperate,
                terminalTextSizeSp = terminalTextSizeSp,
                runtime = runtime,
                projectRuntime = projectRuntime,
                browserMirror = browserMirror,
                ports = ports,
                openExternalUrl = openExternalUrl,
                onOpenProjectUtility = onOpenProjectUtility,
                onOpenBrowserMirror = onOpenBrowserMirror,
                onManagePorts = onManagePorts,
                onOpenAgentSettings = onOpenAgentSettings,
                onOpenBackgroundTask = openBackgroundTask,
                onTransferSideChat = { text ->
                    draft = if (draft.isBlank()) text else "$draft\n$text"
                    draftStore?.set(resolvedDraftKey, draft)
                },
                onClose = onCloseInspector,
            )
        },
        topBar = { capability ->
            RichChatThreadTopBar(
                title = title,
                agentLabel = agentStatus?.label,
                thread = thread,
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
                onOpenProjectUtility = onOpenProjectUtility,
                onOpenWorkspaceGit = onOpenWorkspaceGit,
                onForkThread = state.transcript?.completedTurns?.lastOrNull()?.anchorItemId?.let { anchor ->
                    requestFork?.let { fork -> { fork(anchor) } }
                },
                onMoveToWorktree = if (
                    onMoveToWorktree != null && canMutate && canMoveThreadToWorktree(thread)
                ) {
                    { pendingMoveBringChanges = it }
                } else {
                    null
                },
                onContinueInProvider = if (
                    canMutate && thread != null &&
                    handoffAgents.any { it.installed && it.kind != thread.agentKind }
                ) {
                    { showHandoff = true }
                } else {
                    null
                },
                projectName = projectName, hostName = hostName, hostOnline = hostOnline,
                leadingAccessory = leadingToolbarControls,
                applyStatusBarsPadding = !inSplitShell,
                showInspectorToggle = capability.supportsInspector,
                inspectorOpen = inspectorOpen,
                onToggleInspector = onToggleInspector,
                onToggleFind = findState.toggle,
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
                    errorText = attachmentError?.let { stringResource(it.messageRes()) },
                    configuration = composerConfiguration,
                    agentStatus = agentStatus,
                    canConfigure = canConfigure,
                    currentThread = currentThreadForComposer,
                    followUpQueue = state.transcript?.followUpQueue,
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
                        val next = if (draft.isBlank()) suggestion else "$draft\n$suggestion"
                        draft = next
                        draftStore?.set(resolvedDraftKey, next)
                    },
                    onDraftChange = { next ->
                        draft = next
                        draftStore?.set(resolvedDraftKey, next)
                    },
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
                    resumePlan = resumePlan,
                    onResume = { resume.resume(resumePlan, composerConfiguration, state, currentThreadForComposer) },
                )
            }
        },
    ) { padding, layout ->
        if (ThreadPresentationPolicy.isTerminal(thread?.presentationMode)) {
            RichTerminalPane(
                runtime = runtime,
                canOperate = canOperate,
                projectLocation = projectLocation,
                textSizeSp = terminalTextSizeSp,
                modifier = Modifier.padding(padding),
            )
            return@RichChatThreadSurface
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding).then(layout.backdrop),
        ) {
            if (findState.open) {
                RichChatFindBar(
                    query = findState.query,
                    matchCount = findState.matchCount,
                    currentMatchIndex = findState.currentMatchIndex,
                    onQueryChange = findState.onQueryChange,
                    onPrevious = findState.onPrevious,
                    onNext = findState.onNext,
                    onClose = findState.onClose,
                )
            }
            RichChatForkOrigin(thread, onOpenThread)
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
                RichChatLoadPhase.Loaded -> RichChatLoadedTranscript(
                    layout = layout,
                    runtime = runtime,
                    threadId = threadId,
                    agentStatus = agentStatus,
                    projectLocation = projectLocation,
                    canOperate = canOperate,
                    onOpenAgentSettings = onOpenAgentSettings,
                    onTruncateItem = { pendingTruncateItemId = it },
                    onRevertItem = { pendingRevertItemId = it },
                    requestFork = requestFork,
                    forkBoundaryItemId = forkBoundaryItemId,
                    fileDownloadSnackbarHost = fileDownloadSnackbarHost,
                )
            }
        }
    }
}
