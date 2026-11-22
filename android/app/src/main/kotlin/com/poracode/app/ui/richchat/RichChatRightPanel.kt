package com.poracode.app.ui.richchat

import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.browsermirror.BrowserMirrorComposition
import com.poracode.app.session.ports.PortForwardRuntime
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.ui.browsermirror.BrowserMirrorScreen
import com.poracode.app.ui.components.PoracodeDockedBar
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.ports.PortForwardScreen
import com.poracode.app.ui.projects.ProjectNotesScreen
import com.poracode.app.ui.projects.ProjectUiAccess
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceScreen
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceSection
import com.poracode.app.ui.terminal.ProjectTerminalScreen
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Switchable right-hand Material 3 supporting pane / side sheet for tablets and
 * unfolded foldables (Thread Info, Files, Git, Terminal, Notes, Browser, Ports),
 * using a clean docked tonal bottom tab bar instead of floating iOS glass capsules.
 */
@Composable
internal fun RichChatRightPanel(
    panelWidthDp: Float,
    threadId: String,
    thread: RemoteThread?,
    project: RemoteProject?,
    projectName: String?,
    projectLocation: ProjectLocation?,
    workspaceTarget: ProjectWorkspaceTarget?,
    gitSummary: RemoteGitSummary?,
    agentStatus: AgentStatusEntry?,
    canOperate: Boolean,
    terminalTextSizeSp: Int,
    runtime: RichChatSessionRuntime,
    projectRuntime: ProjectSessionRuntime?,
    browserMirror: BrowserMirrorComposition?,
    ports: PortForwardRuntime?,
    openExternalUrl: (String) -> Unit,
    onOpenProjectUtility: (HomeProjectUtility) -> Unit,
    onOpenBrowserMirror: () -> Unit,
    onManagePorts: () -> Unit,
    onOpenAgentSettings: () -> Unit,
    onOpenBackgroundTask: (com.poracode.app.protocol.BackgroundTask) -> Unit,
    onTransferSideChat: (String) -> Unit = {},
    onClose: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val chatState by runtime.chat.state.collectAsStateWithLifecycle()
    val checkpointState by runtime.checkpoints.state.collectAsStateWithLifecycle()
    val sessionActionsState by runtime.sessionActions.state.collectAsStateWithLifecycle()
    val projectLeaseState = projectRuntime?.hostLease?.collectAsStateWithLifecycle()
    val projectLease = projectLeaseState?.value

    val hasProjectWorkspace = workspaceTarget != null &&
        project != null &&
        project.id != HOME_PROJECT_ID &&
        projectRuntime != null
    val availableTabs = remember(hasProjectWorkspace, project != null, browserMirror != null, ports != null) {
        buildList {
            add(RichChatRightPanelTab.Info)
            if (hasProjectWorkspace) {
                add(RichChatRightPanelTab.Files)
                add(RichChatRightPanelTab.Git)
                add(RichChatRightPanelTab.Terminal)
            }
            if (project != null && project.id != HOME_PROJECT_ID && projectRuntime != null) {
                add(RichChatRightPanelTab.Notes)
            }
            if (browserMirror != null) add(RichChatRightPanelTab.Browser)
            if (ports != null) add(RichChatRightPanelTab.Ports)
            add(RichChatRightPanelTab.SideChat)
        }
    }

    var activeTab by rememberSaveable(threadId) { mutableStateOf(RichChatRightPanelTab.Info) }
    LaunchedEffect(availableTabs) {
        if (activeTab !in availableTabs) activeTab = RichChatRightPanelTab.Info
    }

    val expandAction: (() -> Unit)? = when (activeTab) {
        RichChatRightPanelTab.Info, RichChatRightPanelTab.SideChat -> null
        RichChatRightPanelTab.Files, RichChatRightPanelTab.Git ->
            if (hasProjectWorkspace) ({ onOpenProjectUtility(HomeProjectUtility.Workspace) }) else null
        RichChatRightPanelTab.Terminal ->
            if (hasProjectWorkspace) ({ onOpenProjectUtility(HomeProjectUtility.Terminal) }) else null
        RichChatRightPanelTab.Notes ->
            if (project != null && project.id != HOME_PROJECT_ID) ({ onOpenProjectUtility(HomeProjectUtility.Notes) }) else null
        RichChatRightPanelTab.Browser -> if (browserMirror != null) onOpenBrowserMirror else null
        RichChatRightPanelTab.Ports -> if (ports != null) onManagePorts else null
    }
    val tabSplit = remember(availableTabs, panelWidthDp, expandAction != null) {
        RichChatPanelTabLayout.split(availableTabs, panelWidthDp, reservesExpand = expandAction != null)
    }
    val transcriptItems = chatState.transcript?.itemsInOrder.orEmpty()
    val galleryImages = remember(transcriptItems) {
        transcriptItems.flatMap { RichChatUiLogic.images(it) }.distinct()
    }
    val refreshing = "history" in chatState.activeOperations
    val mutating = chatState.activeOperations.any { it != "history" && it != "older" }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.paneSurface),
    ) {
        com.poracode.app.ui.components.PoracodePaneHeader(
            title = stringResource(activeTab.labelRes),
            horizontalPadding = 12.dp,
            trailing = {
                if (expandAction != null) {
                    PoracodeIconButton(
                        icon = PoracodeIcons.Maximize2,
                        contentDescription = stringResource(R.string.inspector_expand_panel),
                        onClick = expandAction,
                        tint = colors.muted,
                        iconSize = 16.dp,
                    )
                }
                PoracodeIconButton(
                    icon = PoracodeIcons.Close,
                    contentDescription = stringResource(R.string.inspector_hide),
                    onClick = onClose,
                    tint = colors.muted,
                    iconSize = 16.dp,
                )
            },
        )

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (activeTab) {
                RichChatRightPanelTab.Info -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = PoracodeMetrics.paneInline, vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        RichChatThreadInfoCard(
                            thread = thread,
                            projectName = projectName ?: project?.name,
                            projectLocation = projectLocation,
                            gitSummary = gitSummary,
                        )
                        RichChatContextWindowCard(
                            usage = chatState.transcript?.contextUsage,
                        )
                        RichChatMediaGalleryCard(
                            images = galleryImages,
                            runtime = runtime,
                        )
                        RichChatControlPanel(
                            runtime = runtime,
                            items = transcriptItems,
                            agentStatus = agentStatus,
                            requests = chatState.transcript?.openRequests.orEmpty(),
                            pendingSteer = chatState.transcript?.pendingSteer,
                            backgroundTasks = chatState.backgroundTasks.orEmpty(),
                            sessionActionIds = sessionActionsState.actionIds,
                            onOpenBackgroundTask = onOpenBackgroundTask,
                            checkpointState = checkpointState,
                            projectLocation = projectLocation,
                            selection = chatState.selection,
                            config = chatState.config,
                            canOperate = canOperate,
                            busy = mutating || refreshing,
                            onOpenAgentSettings = onOpenAgentSettings,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                RichChatRightPanelTab.Files, RichChatRightPanelTab.Git -> {
                    if (hasProjectWorkspace) {
                        val runtimeRef = checkNotNull(projectRuntime)
                        val targetRef = checkNotNull(workspaceTarget)
                        val projectRef = checkNotNull(project)
                        ProjectWorkspaceScreen(
                            controller = runtimeRef.workspace,
                            gateway = runtimeRef.workspaceGateway,
                            gitController = runtimeRef.gitOperations,
                            githubController = runtimeRef.githubOperations,
                            lease = projectLease,
                            target = targetRef,
                            projectName = projectRef.name,
                            onBack = { activeTab = RichChatRightPanelTab.Info },
                            initialSection = if (activeTab == RichChatRightPanelTab.Git) {
                                ProjectWorkspaceSection.Git
                            } else {
                                ProjectWorkspaceSection.Files
                            },
                            embeddedInInspector = true,
                        )
                    }
                }
                RichChatRightPanelTab.Terminal -> {
                    ProjectTerminalScreen(
                        runtime = runtime,
                        canOperate = canOperate,
                        projectName = projectName ?: project?.name,
                        projectLocation = projectLocation,
                        activationKey = "inspector:$threadId",
                        terminalTextSizeSp = terminalTextSizeSp,
                        onBack = { activeTab = RichChatRightPanelTab.Info },
                        embeddedInInspector = true,
                    )
                }
                RichChatRightPanelTab.Notes -> {
                    if (project != null && projectRuntime != null && projectLease != null && workspaceTarget != null) {
                        ProjectNotesScreen(
                            runtime = projectRuntime,
                            lease = projectLease,
                            project = project,
                            identity = workspaceTarget.identity,
                            access = ProjectUiAccess.from(projectLease),
                            onBack = { activeTab = RichChatRightPanelTab.Info },
                            embeddedInInspector = true,
                        )
                    }
                }
                RichChatRightPanelTab.Browser -> {
                    if (browserMirror != null) {
                        BrowserMirrorScreen(
                            controller = browserMirror.controller,
                            onBack = { activeTab = RichChatRightPanelTab.Info },
                            embeddedInInspector = true,
                        )
                    }
                }
                RichChatRightPanelTab.Ports -> {
                    if (ports != null) {
                        PortForwardScreen(
                            controller = ports.controller,
                            onBack = { activeTab = RichChatRightPanelTab.Info },
                            openBrowser = openExternalUrl,
                            embeddedInInspector = true,
                        )
                    }
                }
                RichChatRightPanelTab.SideChat -> {
                    com.poracode.app.ui.sidechat.SideChatPanel(
                        threadId = threadId,
                        threadTitle = thread?.title,
                        onTransferToComposer = onTransferSideChat,
                    )
                }
            }
        }

        // Clean docked Material 3 inspector tab bar (no hard top divider)
        PoracodeDockedBar(containerColor = colors.paneSurface) {
            tabSplit.inline.forEach { tab ->
                InspectorTabButton(
                    tab = tab,
                    selected = activeTab == tab,
                    onClick = { activeTab = tab },
                    modifier = Modifier.weight(1f),
                )
            }
            if (tabSplit.overflow.isNotEmpty()) {
                InspectorOverflowButton(
                    tabs = tabSplit.overflow,
                    activeTab = activeTab,
                    onSelect = { activeTab = it },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun InspectorTabButton(
    tab: RichChatRightPanelTab,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val label = stringResource(tab.labelRes)
    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .height(44.dp)
            .clip(RoundedCornerShape(PoracodeRadius.control))
            .background(if (selected) colors.rowActive else Color.Transparent)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics {
                contentDescription = label
                this.selected = selected
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            tab.icon(),
            contentDescription = null,
            modifier = Modifier.size(17.dp),
            tint = if (selected) colors.foreground else colors.muted,
        )
    }
}

@Composable
private fun InspectorOverflowButton(
    tabs: List<RichChatRightPanelTab>,
    activeTab: RichChatRightPanelTab,
    onSelect: (RichChatRightPanelTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    var expanded by remember { mutableStateOf(false) }
    val overflowSelected = activeTab in tabs
    val moreLabel = stringResource(R.string.home_more)
    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .height(44.dp)
            .clip(RoundedCornerShape(PoracodeRadius.control))
            .background(if (overflowSelected) colors.rowActive else Color.Transparent)
            .clickable(role = Role.Button, onClick = { expanded = true })
            .semantics {
                contentDescription = moreLabel
                selected = overflowSelected
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            if (overflowSelected) activeTab.icon() else PoracodeIcons.MoreHoriz,
            contentDescription = null,
            modifier = Modifier.size(17.dp),
            tint = if (overflowSelected) colors.foreground else colors.muted,
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            tabs.forEach { tab ->
                DropdownMenuItem(
                    text = { Text(stringResource(tab.labelRes)) },
                    leadingIcon = {
                        Icon(
                            if (activeTab == tab) PoracodeIcons.Check else tab.icon(),
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    onClick = {
                        expanded = false
                        onSelect(tab)
                    },
                )
            }
        }
    }
}
