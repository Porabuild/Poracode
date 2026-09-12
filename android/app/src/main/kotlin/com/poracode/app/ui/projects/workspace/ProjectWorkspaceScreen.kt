package com.poracode.app.ui.projects.workspace

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.GitFileChange
import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.hostPath
import com.poracode.app.session.projects.GitExecutionResult
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.GitOperationsController
import com.poracode.app.session.projects.ProjectOperationResult
import com.poracode.app.session.projects.invalidates
import com.poracode.app.session.projects.ProjectWorkspaceController
import com.poracode.app.session.projects.ProjectWorkspaceEntry
import com.poracode.app.session.projects.ProjectWorkspaceGateway
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

internal enum class EditorExitAction { Back, Reload, Open, Discard }

/**
 * Native project files/Git surface. The caller owns composition of the workspace controller and
 * generated gateway; this screen never creates a transport or retains credentials.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectWorkspaceScreen(
    controller: ProjectWorkspaceController,
    gateway: ProjectWorkspaceGateway,
    gitController: GitOperationsController,
    githubController: GithubOperationsController,
    lease: ProjectHostLease?,
    target: ProjectWorkspaceTarget,
    projectName: String,
    onBack: () -> Unit,
    initialSection: ProjectWorkspaceSection = ProjectWorkspaceSection.Files,
    initialGithubSection: ProjectGithubSection = ProjectGithubSection.PullRequests,
    modifier: Modifier = Modifier,
) {
    val workspace by controller.state.collectAsStateWithLifecycle()
    val gitOperations by gitController.state.collectAsStateWithLifecycle()
    val access = ProjectWorkspaceAccess.from(lease, target.identity)
    val scope = rememberCoroutineScope()
    var initialized by remember(lease?.key, target.identity, access) { mutableStateOf(false) }
    var sectionName by rememberSaveable(target.identity, initialSection) {
        mutableStateOf(initialSection.name)
    }
    val section = ProjectWorkspaceSection.valueOf(sectionName)
    var searchText by rememberSaveable(target.identity) { mutableStateOf("") }
    var showingSearch by rememberSaveable(target.identity) { mutableStateOf(false) }
    var selectedDiffPath by rememberSaveable(target.identity) {
        mutableStateOf<String?>(null)
    }
    var selectedDiffStaged by rememberSaveable(target.identity) { mutableStateOf(false) }
    var diffRequest by rememberSaveable(target.identity) { mutableIntStateOf(0) }
    var editorEpoch by rememberSaveable(target.identity) { mutableIntStateOf(0) }
    var saveFailed by rememberSaveable(target.identity) { mutableStateOf(false) }
    var showingBranches by rememberSaveable(target.identity) { mutableStateOf(false) }
    var showingWorktrees by rememberSaveable(target.identity) { mutableStateOf(false) }

    LaunchedEffect(lease?.key, target, access) {
        controller.close(target.identity)
        initialized = true
        if (access.canRead) {
            coroutineScope {
                launch { controller.loadTree(target) }
                launch { controller.refreshGit(target) }
                launch { gitController.refresh(target) }
                launch { githubController.refresh(target) }
            }
        }
    }
    DisposableEffect(controller, target.identity) {
        onDispose {
            controller.close(target.identity)
            gitController.close(target.identity)
            githubController.close(target.identity)
        }
    }

    val entry = if (initialized) {
        workspace.entries[target.identity] ?: ProjectWorkspaceEntry()
    } else {
        ProjectWorkspaceEntry()
    }
    val gitEntry = gitOperations.entries[target.identity]
    val branchList = remember(gitEntry?.branches) { decodeGitBranchList(gitEntry?.branches) }
    val worktreeList = remember(gitEntry?.worktrees) { decodeGitWorktreeList(gitEntry?.worktrees) }
    val file = entry.openFile
    var draft by remember(
        target.identity,
        file?.path,
        file?.modifiedAtMs,
        editorEpoch,
    ) { mutableStateOf(file?.content.orEmpty()) }
    val dirty = isProjectFileDirty(file, draft)
    val diffState by produceState<ProjectGitDiffUiState>(
        initialValue = ProjectGitDiffUiState.Idle,
        selectedDiffPath,
        selectedDiffStaged,
        diffRequest,
        lease?.key,
        target,
        access.canRead,
    ) {
        val path = selectedDiffPath
        val capturedLease = lease
        if (path == null || capturedLease == null || !access.canRead) {
            value = ProjectGitDiffUiState.Idle
        } else {
            value = ProjectGitDiffUiState.Loading
            value = try {
                ProjectGitDiffUiState.Loaded(
                    gateway.gitDiff(capturedLease, target, path, selectedDiffStaged).diff,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                ProjectGitDiffUiState.Failed
            }
        }
    }
    val actions = projectWorkspaceActions(
        access,
        entry,
        dirty,
        diffState == ProjectGitDiffUiState.Loading,
    )
    var pendingAction by remember { mutableStateOf<EditorExitAction?>(null) }
    var pendingPath by remember { mutableStateOf<String?>(null) }
    var pendingMutation by remember(target.identity) {
        mutableStateOf<PendingProjectEntryMutation?>(null)
    }

    val executeAction: (EditorExitAction, String?) -> Unit = { action, path ->
        when (action) {
            EditorExitAction.Back -> onBack()
            EditorExitAction.Reload -> file?.path?.let { openPath ->
                scope.launch {
                    if (controller.openFile(target, openPath) is ProjectOperationResult.Success) {
                        editorEpoch += 1
                        saveFailed = false
                    }
                }
            }
            EditorExitAction.Open -> path?.let { openPath ->
                scope.launch {
                    if (controller.openFile(target, openPath) is ProjectOperationResult.Success) {
                        editorEpoch += 1
                        saveFailed = false
                    }
                }
            }
            EditorExitAction.Discard -> {
                // Reverts the in-editor buffer in place; unlike Back/Reload/Open this never
                // navigates or re-fetches the file.
                draft = file?.content.orEmpty()
                saveFailed = false
            }
        }
    }
    val requestAction: (EditorExitAction, String?) -> Unit = { action, path ->
        if (dirty) {
            pendingAction = action
            pendingPath = path
        } else {
            executeAction(action, path)
        }
    }
    val executeMutation: (PendingProjectEntryMutation) -> Unit = { pending ->
        scope.launch { controller.mutateEntry(pending.target, pending.mutation) }
    }
    val submitGit: (GitOperationRequest) -> Unit = { request ->
        scope.launch {
            when (val result = gitController.execute(target, request)) {
                is GitExecutionResult.Completed -> if (result.outcome is GitMutationOutcome.Applied) {
                    selectedDiffPath = null
                    controller.refreshGit(target)
                    gitController.refresh(target)
                }
                GitExecutionResult.ConfirmationRequired,
                is GitExecutionResult.Failed,
                GitExecutionResult.Stale,
                -> Unit
            }
        }
    }
    BackHandler { requestAction(EditorExitAction.Back, null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            ProjectWorkspaceTopBar(
                projectName = projectName,
                section = section,
                access = access,
                actions = actions,
                onBack = { requestAction(EditorExitAction.Back, null) },
                onShowBranches = { showingBranches = true },
                onShowWorktrees = { showingWorktrees = true },
                onRefresh = {
                    if (section == ProjectWorkspaceSection.Files) {
                        scope.launch {
                            if (showingSearch && searchText.isNotBlank()) {
                                controller.searchFiles(target, searchText.trim())
                            } else {
                                controller.loadTree(
                                    target,
                                    entry.tree?.directoryPath.orEmpty(),
                                )
                            }
                        }
                    } else if (section == ProjectWorkspaceSection.Git) {
                        selectedDiffPath = null
                        scope.launch { controller.refreshGit(target) }
                    } else {
                        scope.launch { githubController.refresh(target) }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (
                entry.loadingTree || entry.searching || entry.loadingFile ||
                entry.savingFile || entry.mutatingEntry || entry.loadingGit ||
                diffState == ProjectGitDiffUiState.Loading
            ) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            ProjectWorkspaceAccessBanner(lease, access)
            if (entry.failure != null && !saveFailed) {
                ProjectWorkspaceFailureCard(
                    entry.failure,
                    mutationUncertain = entry.mutationUncertain,
                    modifier = Modifier,
                )
            }
            PrimaryTabRow(selectedTabIndex = section.ordinal) {
                ProjectWorkspaceSection.entries.forEach { candidate ->
                    Tab(
                        selected = section == candidate,
                        onClick = { sectionName = candidate.name },
                        text = {
                            Text(
                                stringResource(
                                    when (candidate) {
                                        ProjectWorkspaceSection.Files -> R.string.workspace_files
                                        ProjectWorkspaceSection.Git -> R.string.workspace_git
                                        ProjectWorkspaceSection.Github -> R.string.workspace_github
                                    },
                                ),
                            )
                        },
                    )
                }
            }
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val expanded = maxWidth >= 900.dp
                if (section == ProjectWorkspaceSection.Files) {
                    FilesWorkspaceContent(
                        entry = entry,
                        rootPath = target.location.hostPath(),
                        draft = draft,
                        dirty = dirty,
                        saveFailed = saveFailed,
                        searchText = searchText,
                        showingSearch = showingSearch,
                        actions = actions,
                        access = access,
                        expanded = expanded,
                        onSearchTextChange = { searchText = it },
                        onSearch = {
                            val query = searchText.trim()
                            if (query.isNotEmpty()) {
                                showingSearch = true
                                scope.launch { controller.searchFiles(target, query) }
                            }
                        },
                        onClearSearch = { searchText = ""; showingSearch = false },
                        onDirectory = { path ->
                            showingSearch = false
                            scope.launch { controller.loadTree(target, path) }
                        },
                        onFile = { path -> requestAction(EditorExitAction.Open, path) },
                        onMutation = { mutation ->
                            val pending = PendingProjectEntryMutation(
                                target,
                                mutation,
                                file?.path.orEmpty(),
                            )
                            if (dirty && file != null && mutation.invalidates(file.path)) {
                                pendingMutation = pending
                            } else {
                                executeMutation(pending)
                            }
                        },
                        onDraftChange = { draft = it; saveFailed = false },
                        onSave = {
                            scope.launch {
                                saveFailed = controller.saveFile(target, draft) is
                                    ProjectOperationResult.Failed
                            }
                        },
                        onReload = { requestAction(EditorExitAction.Reload, null) },
                        onDiscard = { requestAction(EditorExitAction.Discard, null) },
                    )
                } else if (section == ProjectWorkspaceSection.Git) {
                    ProjectGitPane(
                        status = entry.gitSnapshot?.status,
                        snapshotLoaded = entry.gitSnapshot != null,
                        loading = entry.loadingGit,
                        failure = gitEntry?.failure ?: entry.failure,
                        selectedPath = selectedDiffPath,
                        selectedStaged = selectedDiffStaged,
                        diffState = diffState,
                        canLoadDiff = actions.canLoadDiff,
                        canOperate = access.canWrite && gitEntry?.activeMutation == null,
                        expanded = expanded,
                        onSelectChange = { change: GitFileChange ->
                            selectedDiffPath = change.path
                            selectedDiffStaged = change.staged
                            diffRequest += 1
                        },
                        onStage = { change -> submitGit(gitStageRequest(target.location, change.path)) },
                        onUnstage = { change ->
                            submitGit(gitUnstageRequest(target.location, change.path))
                        },
                        onRevert = { change ->
                            submitGit(gitRevertRequest(target.location, change.path))
                        },
                        actions = {
                            ProjectGitActions(
                                location = target.location,
                                status = requireNotNull(entry.gitSnapshot?.status),
                                activeWorktreePaths = activeWorktreePaths(worktreeList),
                                enabled = access.canWrite,
                                busy = gitEntry?.activeMutation != null,
                                outcome = gitEntry?.lastOutcome,
                                onRequest = submitGit,
                            )
                        },
                        onRetry = if (actions.canRefreshGit) {
                            { scope.launch { controller.refreshGit(target) } }
                        } else {
                            null
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    ProjectGithubPane(
                        controller = githubController,
                        target = target,
                        canRead = access.canRead,
                        canOperate = access.canWrite,
                        expanded = expanded,
                        initialSection = initialGithubSection,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    ProjectWorkspaceDiscardDialog(
        pendingAction = pendingAction,
        filePath = file?.path,
        onConfirm = {
            val pending = pendingAction
            pendingAction = null
            val path = pendingPath
            pendingPath = null
            if (pending != null) executeAction(pending, path)
        },
        onDismiss = { pendingAction = null; pendingPath = null },
    )

    ProjectWorkspaceGitConfirmationOverlay(
        visible = gitEntry?.pendingConfirmation != null,
        onConfirm = {
            scope.launch {
                when (val result = gitController.confirm(target)) {
                    is GitExecutionResult.Completed ->
                        if (result.outcome is GitMutationOutcome.Applied) {
                            selectedDiffPath = null
                            controller.refreshGit(target)
                            gitController.refresh(target)
                        }
                    else -> Unit
                }
            }
        },
        onDismiss = { gitController.dismissConfirmation(target.identity) },
    )
    ProjectMutationDiscardDialog(
        pending = pendingMutation,
        onConfirm = {
            pendingMutation = null
            executeMutation(it)
        },
        onDismiss = { pendingMutation = null },
    )

    ProjectWorkspaceBranchWorktreeOverlays(
        location = target.location,
        branches = branchList,
        worktrees = worktreeList,
        enabled = access.canWrite && gitEntry?.activeMutation == null,
        showingBranches = showingBranches,
        showingWorktrees = showingWorktrees,
        onSubmitGit = submitGit,
        onDismissBranches = { showingBranches = false },
        onDismissWorktrees = { showingWorktrees = false },
    )
}
