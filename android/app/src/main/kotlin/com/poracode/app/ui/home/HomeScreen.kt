package com.poracode.app.ui.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteThread
import com.poracode.app.push.PushUiState
import com.poracode.app.push.RemoteUserNotificationBanner
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.storage.HomeWorkspaceHostInput
import com.poracode.app.storage.HomeWorkspacePreferences
import com.poracode.app.storage.PinnedSettingsShortcut
import com.poracode.app.ui.GitSummaryResolver
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.richchat.RichChatComposerDraftStore
import com.poracode.app.ui.richchat.RichChatThreadScreen
import com.poracode.app.ui.settings.SettingsUiComposition
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun HomeScreen(
    state: AppSession.UiState,
    userHiddenModels: kotlinx.serialization.json.JsonObject?,
    onRefreshModelVisibility: () -> Unit,
    threads: List<HostPresentation.UnifiedThreadItem>,
    onRefresh: () -> Unit,
    onReconnect: (ClientConnectionId) -> Unit,
    onUnpair: () -> Unit,
    onOpenThread: (String) -> Unit,
    onCloseThread: () -> Unit,
    richChat: RichChatSessionRuntime,
    threadRuntime: ThreadSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    settingsComposition: SettingsUiComposition,
    browserMirror: BrowserMirrorComposition,
    ports: PortForwardRuntime,
    deviceSettings: DeviceSettingsPreferences,
    workspaces: HomeWorkspacePreferences,
    draftStore: RichChatComposerDraftStore,
    openExternalUrl: (String) -> Unit,
    onManageHosts: () -> Unit,
    onManageProjects: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onOpenSchedules: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenUsage: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPinnedSettings: (PinnedSettingsShortcut) -> Unit,
    onOpenAgentSettings: () -> Unit,
    onOpenProjectUtility: (ClientConnectionId, String, HomeProjectUtility) -> Unit,
    onManageWorkspaces: () -> Unit,
    excludedProjectIds: Map<String, Set<String>>,
    selectedPresentedThreadId: String?,
    pushState: PushUiState,
    onPushAction: () -> Unit,
    visibleShortcuts: List<HomeShortcut>,
    pinnedSettingsShortcuts: List<PinnedSettingsShortcut>,
    terminalTextSizeSp: Int,
    notificationBanner: RemoteUserNotificationBanner?,
    onOpenNotification: (Long) -> Unit,
    onDismissNotification: (Long) -> Unit,
    providerUsageControl: @Composable (RemoteThread?, com.poracode.app.model.AgentStatusEntry?) -> Unit = { _, _ -> },
) {
    val deviceState by deviceSettings.state.collectAsStateWithLifecycle()
    val workspaceState by workspaces.state.collectAsStateWithLifecycle()
    val draftsMap by draftStore.drafts.collectAsStateWithLifecycle()
    val draftKeys = remember(draftsMap) { draftsMap.keys }
    val density = LocalDensity.current
    val adaptiveInfo = currentWindowAdaptiveInfoV2()

    // Import host workspaces into device-local workspace preferences when snapshots update.
    val workspaceInputs = remember(
        state.hostCatalog.hosts,
        state.hostCatalog.selectedConnectionId,
        state.snapshot,
        state.hostSnapshots,
    ) {
        state.hostCatalog.hosts.mapNotNull { host ->
            val snapshot = if (host.connectionId == state.hostCatalog.selectedConnectionId) {
                state.snapshot ?: state.hostSnapshots[host.connectionId]
            } else {
                state.hostSnapshots[host.connectionId]
            }
            snapshot?.let {
                HomeWorkspaceHostInput(
                    connectionId = host.connectionId,
                    workspaces = it.workspaces,
                    projects = it.projects,
                    homeThreadIds = it.threads.filter { t -> t.projectId == HOME_PROJECT_ID }.map { t -> t.id },
                )
            }
        }
    }
    LaunchedEffect(workspaceInputs) {
        if (workspaceInputs.isNotEmpty()) workspaces.importHosts(workspaceInputs)
    }

    var isDockedSidebarVisible by rememberSaveable { mutableStateOf(true) }
    var isOverlaySidebarVisible by rememberSaveable { mutableStateOf(false) }
    var isInspectorOpen by rememberSaveable { mutableStateOf(false) }
    var findToggleSeq by rememberSaveable { mutableStateOf(0) }
    var splitComposeOpen by rememberSaveable { mutableStateOf(false) }
    var splitComposeProjectId by rememberSaveable { mutableStateOf<String?>(null) }

    val homeScope = rememberCoroutineScope()
    var moveInFlight by remember { mutableStateOf(false) }
    var moveFailed by remember { mutableStateOf(false) }
    val moveOpenThreadToWorktree: (Boolean) -> Unit = { bringChanges ->
        val item = findOpenHomeThread(state, threads, selectedPresentedThreadId)
        val target = openProjectTarget(state)
        if (item != null && target != null && !moveInFlight) {
            moveInFlight = true
            homeScope.launch {
                val moved = moveHomeThreadToWorktree(
                    thread = item.thread,
                    project = item.project,
                    target = target,
                    bringChanges = bringChanges,
                    richChat = richChat,
                    threadRuntime = threadRuntime,
                    projectRuntime = projectRuntime,
                    onOpenThread = onOpenThread,
                )
                moveInFlight = false
                if (!moved) moveFailed = true
            }
        }
    }
    val handoffAgents = openProjectLocation(state)?.let { location ->
        val mode = if (openThread(state)?.presentationMode == "terminal") {
            com.poracode.app.model.threads.ThreadPresentationMode.Terminal
        } else {
            com.poracode.app.model.threads.ThreadPresentationMode.Gui
        }
        homeQuickComposeAgents(location, state.hostReplay, mode)
    }.orEmpty()

    LaunchedEffect(notificationBanner?.id) {
        val id = notificationBanner?.id ?: return@LaunchedEffect
        delay(6_000)
        onDismissNotification(id)
    }
    if (moveFailed) {
        AlertDialog(
            onDismissRequest = { moveFailed = false },
            title = { Text(stringResource(R.string.thread_lifecycle_failed)) },
            text = { Text(stringResource(R.string.thread_lifecycle_failure_generic)) },
            confirmButton = {
                TextButton(onClick = { moveFailed = false }) {
                    Text(stringResource(R.string.thread_lifecycle_close))
                }
            },
        )
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .then(
                homeKeyboardShortcutsModifier(
                    hasOpenThread = state.openThreadId != null,
                    canOperate = state.canSessionOperate,
                    onToggleSidebar = {
                        isDockedSidebarVisible = !isDockedSidebarVisible
                        isOverlaySidebarVisible = !isOverlaySidebarVisible
                    },
                    onToggleInspector = { isInspectorOpen = !isInspectorOpen },
                    onNewThread = { splitComposeProjectId = null; splitComposeOpen = true },
                    onToggleFind = { findToggleSeq += 1 },
                    onOpenSettings = onOpenSettings,
                    onEscape = {
                        when {
                            splitComposeOpen -> { splitComposeOpen = false; true }
                            isOverlaySidebarVisible -> { isOverlaySidebarVisible = false; true }
                            isInspectorOpen -> { isInspectorOpen = false; true }
                            else -> false
                        }
                    },
                ),
            ),
    ) {
        val imeVisible = WindowInsets.isImeVisible
        val widthBucket = maxWidth.value.toInt() / 4
        var rememberedUnobstructedHeightDp by remember(widthBucket) { mutableStateOf(maxHeight.value) }
        if (!imeVisible && maxHeight.value > rememberedUnobstructedHeightDp) {
            rememberedUnobstructedHeightDp = maxHeight.value
        }
        var lastMode by remember { mutableStateOf<HomeLayoutMode?>(null) }
        val foldingHinge = remember(adaptiveInfo.windowPosture, density) {
            adaptiveInfo.windowPosture.hingeList.firstOrNull { it.isSeparating }?.let { hinge ->
                FoldingHinge(
                    leftDp = with(density) { hinge.bounds.left.toDp().value },
                    widthDp = with(density) { hinge.bounds.width.toDp().value },
                    topDp = with(density) { hinge.bounds.top.toDp().value },
                    heightDp = with(density) { hinge.bounds.height.toDp().value },
                    isVertical = hinge.isVertical,
                    isSeparating = hinge.isSeparating,
                )
            }
        }
        val layout = remember(
            maxWidth,
            maxHeight,
            imeVisible,
            rememberedUnobstructedHeightDp,
            deviceState.sidebarWidthDp,
            density.fontScale,
            foldingHinge,
        ) {
            HomeAdaptiveLayoutPolicy.resolve(
                widthDp = maxWidth.value,
                heightDp = maxHeight.value,
                preferredSidebarWidthDp = deviceState.sidebarWidthDp.takeIf { it > 0 }?.toFloat(),
                fontScale = density.fontScale,
                hinge = foldingHinge,
                unobstructedHeightDp = if (imeVisible) rememberedUnobstructedHeightDp else maxHeight.value,
                retainingMode = if (imeVisible) lastMode else null,
            )
        }
        lastMode = layout.mode
        LaunchedEffect(layout.sidebarPresentation) {
            isOverlaySidebarVisible = false
        }

        val backModifier = rememberPredictiveBackModifier(
            enabled = !layout.isSplit && state.openThreadId != null,
            onBack = onCloseThread,
        )
        val openItem = findOpenHomeThread(state, threads, selectedPresentedThreadId)
        val (openHostOnline, openHostOffline) = homeThreadConnectionStatus(state, openItem?.connectionId)

        val threadDetail: @Composable (
            showBack: Boolean,
            inSplitShell: Boolean,
            leadingControls: (@Composable RowScope.() -> Unit)?,
            Modifier,
        ) -> Unit = { showBack, inSplitShell, leadingControls, detailModifier ->
            RichChatThreadScreen(
                providerUsageControl = providerUsageControl,
                userHiddenModels = userHiddenModels,
                runtime = richChat,
                forksSupported = 1 in state.liveThreadForkVersions,
                onOpenThread = onOpenThread,
                onMoveToWorktree = moveOpenThreadToWorktree,
                handoffAgents = handoffAgents,
                onOpenWorkspaceGit = {
                    openProjectTarget(state)?.let { target ->
                        onOpenProjectUtility(
                            target.identity.connectionId,
                            target.identity.projectId,
                            HomeProjectUtility.Workspace,
                        )
                    }
                },
                onOpenProjectUtility = { utility ->
                    openProjectTarget(state)?.let { target ->
                        onOpenProjectUtility(
                            target.identity.connectionId,
                            target.identity.projectId,
                            utility,
                        )
                    }
                },
                threadLifecycleController = threadRuntime.controller,
                thread = openThread(state),
                catalogThread = state.openCatalogThread(),
                agentStatus = openAgentStatus(state),
                projectLocation = openProjectLocation(state),
                mentionThreads = state.snapshot?.threads.orEmpty(),
                workspaceController = projectRuntime.workspace,
                workspaceTarget = openProjectTarget(state),
                canOperate = state.canSessionOperate,
                onBack = onCloseThread,
                onOpenAgentSettings = onOpenAgentSettings,
                showBack = showBack,
                gitSummary = openThread(state)?.let {
                    GitSummaryResolver.forThread(
                        it,
                        state.hostReplay.gitSummariesByThread,
                        state.hostReplay.gitSummaryByTarget,
                    )
                },
                terminalTextSizeSp = terminalTextSizeSp,
                projectName = openItem?.project?.name,
                hostName = openItem?.hostName,
                hostOnline = openHostOnline,
                hostOffline = openHostOffline,
                onReconnect = { openItem?.connectionId?.let(onReconnect) },
                project = openItem?.project,
                projectRuntime = projectRuntime,
                browserMirror = browserMirror,
                ports = ports,
                openExternalUrl = openExternalUrl,
                onOpenBrowserMirror = onOpenBrowserMirror,
                onManagePorts = onManagePorts,
                draftStore = draftStore,
                draftKey = selectedPresentedThreadId ?: state.openThreadId,
                leadingToolbarControls = leadingControls,
                inSplitShell = inSplitShell,
                tabletopTopHeightDp = layout.tabletopTopHeightDp,
                tabletopHingeHeightDp = layout.tabletopHingeHeightDp,
                findToggleSeq = findToggleSeq,
                inspectorOpen = isInspectorOpen,
                onToggleInspector = { isInspectorOpen = !isInspectorOpen },
                onCloseInspector = { isInspectorOpen = false },
                preferredInspectorWidthDp = deviceState.inspectorWidthDp,
                onCommitInspectorWidthDp = deviceSettings::setInspectorWidthDp,
                onResetInspectorWidth = { deviceSettings.setInspectorWidthDp(0) },
                modifier = detailModifier,
            )
        }

        if (layout.isSplit) {
            val sidebarVisible = if (layout.usesOverlaySidebar) {
                isOverlaySidebarVisible
            } else {
                isDockedSidebarVisible
            }
            HomeSplitShell(
                layout = layout,
                state = state,
                userHiddenModels = userHiddenModels,
                onRefreshModelVisibility = onRefreshModelVisibility,
                workspaceState = workspaceState,
                onSelectWorkspace = workspaces::selectWorkspace,
                onManageWorkspaces = onManageWorkspaces,
                threads = threads,
                selectedPresentedThreadId = selectedPresentedThreadId,
                draftKeys = draftKeys,
                isSidebarVisible = sidebarVisible,
                onSetSidebarVisible = { visible ->
                    if (layout.usesOverlaySidebar) {
                        isOverlaySidebarVisible = visible
                    } else {
                        isDockedSidebarVisible = visible
                    }
                },
                onCommitSidebarWidthDp = deviceSettings::setSidebarWidthDp,
                onResetSidebarWidth = { deviceSettings.setSidebarWidthDp(0) },
                onRefresh = onRefresh,
                onUnpair = onUnpair,
                onOpenThread = onOpenThread,
                richChat = richChat,
                threadRuntime = threadRuntime,
                projectRuntime = projectRuntime,
                settingsComposition = settingsComposition,
                onManageHosts = onManageHosts,
                onManageProjects = onManageProjects,
                onManagePorts = onManagePorts,
                onOpenBrowserMirror = onOpenBrowserMirror,
                onOpenSchedules = onOpenSchedules,
                onOpenProfile = onOpenProfile,
                onOpenUsage = onOpenUsage,
                onOpenSettings = onOpenSettings,
                onOpenPinnedSettings = onOpenPinnedSettings,
                onOpenProjectUtility = onOpenProjectUtility,
                excludedProjectIds = excludedProjectIds,
                pushState = pushState,
                onPushAction = onPushAction,
                visibleShortcuts = visibleShortcuts,
                pinnedSettingsShortcuts = pinnedSettingsShortcuts,
                showQuickCompose = splitComposeOpen,
                quickComposeProjectId = splitComposeProjectId,
                onOpenQuickCompose = { projectId ->
                    splitComposeProjectId = projectId
                    splitComposeOpen = true
                },
                onDismissQuickCompose = {
                    splitComposeOpen = false
                    splitComposeProjectId = null
                },
            ) { leadingControls ->
                threadDetail(false, true, leadingControls, Modifier.fillMaxSize())
            }
        } else {
            val compactThreads = remember(threads, workspaceState) {
                threads.filter { workspaceState.includes(it) }
            }
            if (state.openThreadId != null) {
                threadDetail(true, false, null, Modifier.fillMaxSize().then(backModifier))
            } else {
                ThreadListPane(
                    userHiddenModels = userHiddenModels,
                    onRefreshModelVisibility = onRefreshModelVisibility,
                    state = state,
                    threads = compactThreads,
                    selectedThreadId = null,
                    onRefresh = onRefresh,
                    onUnpair = onUnpair,
                    onOpenThread = onOpenThread,
                    onManageHosts = onManageHosts,
                    onManageProjects = onManageProjects,
                    onManagePorts = onManagePorts,
                    onOpenBrowserMirror = onOpenBrowserMirror,
                    onOpenSchedules = onOpenSchedules,
                    onOpenProfile = onOpenProfile,
                    onOpenUsage = onOpenUsage,
                    onOpenSettings = onOpenSettings,
                    onOpenProjectUtility = onOpenProjectUtility,
                    excludedProjectIds = excludedProjectIds,
                    threadRuntime = threadRuntime,
                    richChatRuntime = richChat,
                    projectRuntime = projectRuntime,
                    pushState = pushState,
                    onPushAction = onPushAction,
                    visibleShortcuts = visibleShortcuts,
                    pinnedSettingsShortcuts = pinnedSettingsShortcuts,
                    onOpenPinnedSettings = onOpenPinnedSettings,
                    workspaces = workspaceState.workspaces,
                    activeWorkspaceId = workspaceState.resolvedActiveId(),
                    onSelectWorkspace = workspaces::selectWorkspace,
                    onManageWorkspaces = onManageWorkspaces,
                    draftKeys = draftKeys,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        AnimatedContent(
            targetState = notificationBanner,
            modifier = Modifier.align(Alignment.TopCenter).padding(12.dp),
            transitionSpec = {
                (fadeIn() + slideInVertically { -it / 2 }) togetherWith
                    (fadeOut() + slideOutVertically { -it / 2 })
            },
            label = "remote-user-notification",
        ) { banner ->
            if (banner != null) {
                RemoteUserNotificationBannerView(
                    banner = banner,
                    onOpen = { onOpenNotification(banner.id) },
                    onDismiss = { onDismissNotification(banner.id) },
                    modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
                )
            }
        }
    }
}
