package com.poracode.app.ui.home

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostPresentation
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.ui.components.rememberCameraCapture
import com.poracode.app.ui.richchat.AttachmentUiError
import com.poracode.app.ui.richchat.RichChatMentionCatalog
import com.poracode.app.ui.richchat.RichChatSuggestionList
import com.poracode.app.ui.richchat.UploadedAttachment
import com.poracode.app.ui.richchat.attachmentSaver
import com.poracode.app.ui.richchat.promptSegmentsSaver
import com.poracode.app.ui.richchat.uploadAttachmentForThread
import java.util.UUID

@Composable
internal fun HomeQuickComposeOverlay(
    state: AppSession.UiState,
    threads: List<HostPresentation.UnifiedThreadItem>,
    runtime: ThreadSessionRuntime,
    richChat: RichChatSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    excludedProjectIds: Map<String, Set<String>>,
    onDismiss: () -> Unit,
    onStarted: (String) -> Unit,
) {
    val connectionId = state.hostCatalog.selectedConnectionId
    val currentItems = remember(threads, connectionId) {
        threads.filter { it.connectionId == connectionId }
    }
    val projects = remember(
        state.snapshot?.projects,
        connectionId,
        currentItems,
        excludedProjectIds,
        state.hostReplay,
    ) {
        val excluded = excludedProjectIds[connectionId?.value].orEmpty()
        state.snapshot?.projects.orEmpty()
            .filter { it.disabled != true && it.id !in excluded }
            .filter { project ->
                HomeThreadListPresentation.launchDefaults(project, currentItems) != null ||
                    homeQuickComposeStatuses(project.location, state.hostReplay)
                        .any { it.installed }
            }
            .sortedBy { it.name.lowercase() }
    }
    val latestProjectId = currentItems.firstOrNull()?.project?.id
    var projectId by rememberSaveable {
        mutableStateOf(latestProjectId ?: projects.firstOrNull()?.id.orEmpty())
    }
    val threadId = rememberSaveable { UUID.randomUUID().toString().lowercase() }
    var prompt by rememberSaveable { mutableStateOf("") }
    var selectedAgentKind by rememberSaveable { mutableStateOf("") }
    var selectedPresentationWireValue by rememberSaveable {
        mutableStateOf(ThreadPresentationMode.Gui.wireValue)
    }
    var selectedWorktreePath by rememberSaveable { mutableStateOf("") }
    var configuration by remember { mutableStateOf(ThreadConfig()) }
    var configurationSelectionKey by remember { mutableStateOf<String?>(null) }
    var selectedSkill by remember { mutableStateOf<RichPromptSegment.Skill?>(null) }
    var queuedMentionSegments by rememberSaveable(stateSaver = promptSegmentsSaver) {
        mutableStateOf(emptyList<RichPromptSegment>())
    }
    var showingControls by remember { mutableStateOf(false) }
    var showingWorktrees by remember { mutableStateOf(false) }
    var showingCommands by remember { mutableStateOf(false) }
    var createdWorktree by remember { mutableStateOf<HomeQuickComposeWorktree?>(null) }
    var failed by rememberSaveable { mutableStateOf(false) }
    var attachments by rememberSaveable(stateSaver = attachmentSaver) {
        mutableStateOf(emptyList<UploadedAttachment>())
    }
    var uploading by rememberSaveable { mutableStateOf(false) }
    var attachmentError by rememberSaveable { mutableStateOf<AttachmentUiError?>(null) }
    val controllerState by runtime.controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val context = LocalContext.current
    val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
        it?.let { uri ->
            uploadAttachmentForThread(
                uri = uri,
                context = context,
                runtime = richChat,
                threadId = threadId,
                scope = scope,
                onStart = { uploading = true; attachmentError = null },
                onFinish = { uploading = false },
                onFailure = { attachmentError = it },
                onSuccess = { attachment -> attachments += attachment },
            )
        }
    }
    val captureFromCamera = rememberCameraCapture(
        onCaptured = { uri ->
            uploadAttachmentForThread(
                uri = uri,
                context = context,
                runtime = richChat,
                threadId = threadId,
                scope = scope,
                onStart = { uploading = true; attachmentError = null },
                onFinish = { uploading = false },
                onFailure = { attachmentError = it },
                onSuccess = { attachment -> attachments += attachment },
            )
        },
        onUnavailable = { attachmentError = AttachmentUiError.CameraUnavailable },
    )
    val project = projects.firstOrNull { it.id == projectId } ?: projects.firstOrNull()
    val defaults = project?.let { HomeThreadListPresentation.launchDefaults(it, currentItems) }
    val availableModes = project?.let {
        homeQuickComposePresentationModes(it.location, state.hostReplay)
    }.orEmpty()
    val selectedMode = selectedPresentationWireValue.toPresentationMode()
    val normalizedMode = selectedMode.takeIf { it in availableModes }
        ?: availableModes.firstOrNull()
        ?: selectedMode
    val agents = project?.let {
        homeQuickComposeAgents(it.location, state.hostReplay, normalizedMode)
    }.orEmpty()
    val selectedAgent = agents.firstOrNull { it.kind == selectedAgentKind }
        ?: agents.firstOrNull { it.kind == defaults?.agentKind }
        ?: agents.firstOrNull()
    val selectedCatalog = selectedAgent?.let { status ->
        remember(status.identityKey, normalizedMode, configuration.model) {
            HomeQuickComposeCatalog(status, normalizedMode, configuration)
        }
    }
    val worktrees = project?.let { homeQuickComposeWorktrees(it.id, currentItems) }.orEmpty()
    val selectedWorktree = worktrees.firstOrNull { it.path == selectedWorktreePath }
        ?: createdWorktree?.takeIf { it.path == selectedWorktreePath }
    val currentBranch = currentItems
        .asSequence()
        .filter { it.project.id == project?.id }
        .maxByOrNull { it.thread.updatedAt }
        ?.thread
        ?.worktreeBranch
    val slashCommands = selectedCatalog?.slashCommands.orEmpty()
    val busy = controllerState.active != null
    val hasLaunchTarget = project != null && (defaults != null || selectedAgent != null)
    val mentionThreadsForSuggestions = remember(currentItems) { currentItems.map { it.thread } }
    val mentionSuggestions = rememberHomeQuickComposeMentionSuggestions(
        prompt = prompt,
        projectRuntime = projectRuntime,
        connectionId = connectionId,
        project = project,
        mentionThreads = mentionThreadsForSuggestions,
    )

    LaunchedEffect(project?.id, availableModes) {
        if (availableModes.isNotEmpty() && selectedPresentationWireValue !in availableModes.map {
                it.wireValue
            }) {
            selectedPresentationWireValue = availableModes.first().wireValue
        }
    }
    LaunchedEffect(project?.id) {
        selectedAgentKind = defaults?.agentKind.orEmpty()
        selectedWorktreePath = ""
        createdWorktree = null
        selectedSkill = null
    }
    LaunchedEffect(project?.id, selectedAgent?.kind, normalizedMode) {
        val key = listOf(project?.id, selectedAgent?.kind ?: defaults?.agentKind, normalizedMode)
            .joinToString("|")
        if (configurationSelectionKey == key) return@LaunchedEffect
        val modelSeed = configuration.model
        val base = if (selectedAgent?.kind == defaults?.agentKind && defaults != null) {
            defaults.config
        } else {
            ThreadConfig(
                model = selectedCatalog?.models
                    ?.firstOrNull { it.id != modelSeed }
                    ?.id
                    ?: modelSeed.ifBlank { "default" },
            )
        }
        configuration = selectedAgent?.let {
            HomeQuickComposeCatalog(it, normalizedMode, base).normalize(base)
        } ?: base
        configurationSelectionKey = key
    }
    LaunchedEffect(project?.id) {
        if (project != null) {
            focusRequester.requestFocus()
            keyboardController?.show()
        }
    }

    BackHandler(onBack = onDismiss)
    val scrimInteraction = remember { MutableInteractionSource() }
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.32f))
                .clickable(
                    interactionSource = scrimInteraction,
                    indication = null,
                    onClick = onDismiss,
                ),
        )
        androidx.compose.material3.Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .imePadding()
                .navigationBarsPadding()
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            shape = MaterialTheme.shapes.extraLarge,
            border = BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f),
            ),
            color = MaterialTheme.colorScheme.surfaceContainerHighest,
            tonalElevation = 6.dp,
            shadowElevation = 18.dp,
        ) {
            if (hasLaunchTarget) {
                val project = checkNotNull(project)
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    HomeQuickComposeHeader(onDismiss)
                    HomeQuickComposeTargetSelectors(
                        project = project,
                        projects = projects,
                        agents = agents,
                        selectedAgent = selectedAgent,
                        defaultAgentKind = defaults?.agentKind.orEmpty(),
                        availableModes = availableModes,
                        selectedMode = normalizedMode,
                        onProjectSelected = {
                            projectId = it
                            selectedAgentKind = ""
                            configurationSelectionKey = null
                            failed = false
                        },
                        onAgentSelected = {
                            selectedAgentKind = it
                            configurationSelectionKey = null
                            selectedSkill = null
                        },
                        onModeSelected = {
                            selectedPresentationWireValue = it
                            configurationSelectionKey = null
                            selectedSkill = null
                        },
                    )

                    OutlinedTextField(
                        value = prompt,
                        onValueChange = {
                            prompt = it
                            failed = false
                            selectedSkill = selectedSkill?.takeIf { skill ->
                                it.contains(skill.invocation)
                            }
                        },
                        placeholder = { Text(stringResource(R.string.home_quick_compose_prompt)) },
                        minLines = 3,
                        maxLines = 7,
                        shape = MaterialTheme.shapes.large,
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester)
                            .testTag("home_new_thread_prompt"),
                    )

                    if (mentionSuggestions.isNotEmpty()) {
                        RichChatSuggestionList(
                            options = mentionSuggestions,
                            onSelect = { option ->
                                option.mcpConfigKey?.let {
                                    configuration = RichChatMentionCatalog.enableMcp(it, configuration)
                                }
                                if (queuedMentionSegments.none { it == option.segment }) {
                                    queuedMentionSegments = queuedMentionSegments + option.segment
                                }
                                prompt = RichChatMentionCatalog.consumeTrailingMention(prompt)
                            },
                        )
                    }

                    if (queuedMentionSegments.isNotEmpty()) {
                        HomeQuickComposeMentionChips(queuedMentionSegments) {
                            queuedMentionSegments = queuedMentionSegments - it
                        }
                    }

                    if (attachments.isNotEmpty()) {
                        HomeQuickComposeAttachmentChips(attachments) { attachments -= it }
                    }

                    HomeQuickComposeContextChips(
                        worktreeBranch = selectedWorktree?.branch,
                        showControls = selectedCatalog != null,
                        showCommands = slashCommands.isNotEmpty(),
                        onPickWorktree = { showingWorktrees = true },
                        onOpenControls = { showingControls = true },
                        onOpenCommands = { showingCommands = true },
                    )

                    selectedSkill?.let { skill ->
                        Text(
                            skill.invocation,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    HomeQuickComposeErrors(failed, attachmentError)

                    HomeQuickComposeLaunchBar(
                        agent = selectedAgent,
                        defaultAgentKind = defaults?.agentKind.orEmpty(),
                        model = configuration.model,
                        canOperate = state.canSessionOperate,
                        busy = busy,
                        uploading = uploading,
                        canStart = prompt.isNotBlank() && !busy && !uploading &&
                            state.canSessionOperate,
                        onCaptureFromCamera = captureFromCamera,
                        onPickAttachment = { attachmentLauncher.launch(arrayOf("*/*")) },
                        onStart = {
                            launchHomeQuickCompose(
                                scope = scope,
                                runtime = runtime,
                                project = project,
                                threadId = threadId,
                                defaults = defaults,
                                selectedAgent = selectedAgent,
                                catalog = selectedCatalog,
                                configuration = configuration,
                                prompt = prompt,
                                presentationMode = normalizedMode,
                                worktree = selectedWorktree,
                                skill = selectedSkill,
                                mentionSegments = queuedMentionSegments,
                                attachments = attachments,
                                onFailure = { failed = true },
                                onStarted = {
                                    onDismiss()
                                    onStarted(it)
                                },
                            )
                        },
                    )
                }
            } else {
                Box(Modifier.padding(18.dp)) { HomeQuickComposeUnavailable(onDismiss) }
            }
        }
    }

    HomeQuickComposeSheetHost(
        showControls = showingControls,
        showWorktrees = showingWorktrees,
        showCommands = showingCommands,
        catalog = selectedCatalog,
        configuration = configuration,
        worktrees = (worktrees + listOfNotNull(createdWorktree)).distinctBy { it.path },
        currentBranch = currentBranch,
        selectedWorktree = selectedWorktree,
        project = project,
        connectionId = connectionId,
        projectRuntime = projectRuntime,
        slashCommands = slashCommands,
        enabled = state.canSessionOperate && !busy,
        onDismissControls = { showingControls = false },
        onDismissWorktrees = { showingWorktrees = false },
        onDismissCommands = { showingCommands = false },
        onSaveConfiguration = {
            configuration = it
            showingControls = false
        },
        onSelectWorktree = {
            selectedWorktreePath = it.path.orEmpty()
            showingWorktrees = false
        },
        onWorktreeFailure = { failed = true },
        onWorktreeCreated = {
            createdWorktree = it
            selectedWorktreePath = it.path.orEmpty()
        },
        onCommandSelected = { command ->
            prompt = if (prompt.isBlank()) {
                "${command.invocation} "
            } else {
                "${prompt.trimEnd()} ${command.invocation} "
            }
            selectedSkill = command.skill
            showingCommands = false
            failed = false
        },
    )
}

private fun String.toPresentationMode(): ThreadPresentationMode = when (this) {
    ThreadPresentationMode.Terminal.wireValue -> ThreadPresentationMode.Terminal
    else -> ThreadPresentationMode.Gui
}
