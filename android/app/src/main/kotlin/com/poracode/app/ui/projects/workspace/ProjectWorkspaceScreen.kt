package com.poracode.app.ui.projects.workspace

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
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
import com.poracode.app.model.GitRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.session.projects.GitExecutionResult
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.GitOperationsController
import com.poracode.app.session.projects.ProjectOperationResult
import com.poracode.app.session.projects.ProjectWorkspaceController
import com.poracode.app.session.projects.ProjectWorkspaceEntry
import com.poracode.app.session.projects.ProjectWorkspaceGateway
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

private enum class EditorExitAction { Back, Reload, Open }

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
    modifier: Modifier = Modifier,
) {
    val workspace by controller.state.collectAsStateWithLifecycle()
    val gitOperations by gitController.state.collectAsStateWithLifecycle()
    val access = ProjectWorkspaceAccess.from(lease, target.identity)
    val scope = rememberCoroutineScope()
    var initialized by remember(lease?.key, target.identity, access) { mutableStateOf(false) }
    var sectionName by rememberSaveable { mutableStateOf(ProjectWorkspaceSection.Files.name) }
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
    val file = entry.openFile
    var draft by rememberSaveable(
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
            TopAppBar(
                title = { Text(projectName) },
                navigationIcon = {
                    IconButton(onClick = { requestAction(EditorExitAction.Back, null) }) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
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
                        enabled = when (section) {
                            ProjectWorkspaceSection.Files -> actions.canBrowse
                            ProjectWorkspaceSection.Git -> actions.canRefreshGit
                            ProjectWorkspaceSection.Github -> access.canRead
                        },
                    ) {
                        Icon(
                            Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.workspace_refresh),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (
                entry.loadingTree || entry.searching || entry.loadingFile ||
                entry.savingFile || entry.loadingGit || diffState == ProjectGitDiffUiState.Loading
            ) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            ProjectWorkspaceAccessBanner(lease, access)
            if (entry.failure != null && !saveFailed) {
                ProjectWorkspaceFailureCard(entry.failure, modifier = Modifier)
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
                        onDraftChange = { draft = it; saveFailed = false },
                        onSave = {
                            scope.launch {
                                saveFailed = controller.saveFile(target, draft) is
                                    ProjectOperationResult.Failed
                            }
                        },
                        onReload = { requestAction(EditorExitAction.Reload, null) },
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
                        onStage = { change ->
                            submitGit(
                                GitRequests.create(
                                    GitProcedure.Stage,
                                    target.location,
                                    mapOf("filePath" to JsonPrimitive(change.path)),
                                ),
                            )
                        },
                        onUnstage = { change ->
                            submitGit(
                                GitRequests.create(
                                    GitProcedure.Unstage,
                                    target.location,
                                    mapOf("filePath" to JsonPrimitive(change.path)),
                                ),
                            )
                        },
                        onRevert = { change ->
                            submitGit(
                                GitRequests.create(
                                    GitProcedure.Revert,
                                    target.location,
                                    mapOf("filePath" to JsonPrimitive(change.path)),
                                ),
                            )
                        },
                        actions = {
                            ProjectGitActions(
                                location = target.location,
                                status = requireNotNull(entry.gitSnapshot?.status),
                                enabled = access.canWrite,
                                busy = gitEntry?.activeMutation != null,
                                outcome = gitEntry?.lastOutcome,
                                onRequest = submitGit,
                            )
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
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    val pending = pendingAction
    if (pending != null) {
        AlertDialog(
            onDismissRequest = { pendingAction = null; pendingPath = null },
            title = { Text(stringResource(R.string.workspace_discard_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.workspace_discard_message,
                        file?.path.orEmpty(),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingAction = null
                    val path = pendingPath
                    pendingPath = null
                    executeAction(pending, path)
                }) { Text(stringResource(R.string.workspace_discard)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingAction = null; pendingPath = null }) {
                    Text(stringResource(R.string.workspace_keep_editing))
                }
            },
        )
    }

    if (gitEntry?.pendingConfirmation != null) {
        GitConfirmationDialog(
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
    }
}
