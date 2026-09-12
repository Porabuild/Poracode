package com.poracode.app.ui.home

import androidx.compose.runtime.Composable
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.projects.ProjectSessionRuntime

@Composable
internal fun HomeQuickComposeSheetHost(
    showControls: Boolean,
    showWorktrees: Boolean,
    showCommands: Boolean,
    catalog: HomeQuickComposeCatalog?,
    configuration: ThreadConfig,
    worktrees: List<HomeQuickComposeWorktree>,
    currentBranch: String?,
    selectedWorktree: HomeQuickComposeWorktree?,
    project: RemoteProject?,
    connectionId: ClientConnectionId?,
    projectRuntime: ProjectSessionRuntime,
    slashCommands: List<HomeQuickComposeSlashCommand>,
    enabled: Boolean,
    onDismissControls: () -> Unit,
    onDismissWorktrees: () -> Unit,
    onDismissCommands: () -> Unit,
    onSaveConfiguration: (ThreadConfig) -> Unit,
    onSelectWorktree: (HomeQuickComposeWorktree) -> Unit,
    onWorktreeFailure: () -> Unit,
    onWorktreeCreated: (HomeQuickComposeWorktree) -> Unit,
    onCommandSelected: (HomeQuickComposeSlashCommand) -> Unit,
) {
    if (showControls && catalog != null) {
        HomeQuickComposeControlsSheet(
            configuration = configuration,
            catalog = catalog,
            enabled = enabled,
            onDismiss = onDismissControls,
            onSave = onSaveConfiguration,
        )
    }
    HomeQuickComposeWorktreePicker(
        open = showWorktrees,
        worktrees = worktrees,
        currentBranch = currentBranch,
        selected = selectedWorktree,
        project = project,
        connectionId = connectionId,
        projectRuntime = projectRuntime,
        canCreate = enabled,
        onDismiss = onDismissWorktrees,
        onSelect = onSelectWorktree,
        onFailure = onWorktreeFailure,
        onCreated = onWorktreeCreated,
    )
    if (showCommands) {
        HomeQuickComposeSlashCommandSheet(
            commands = slashCommands,
            onDismiss = onDismissCommands,
            onSelect = onCommandSelected,
        )
    }
}
