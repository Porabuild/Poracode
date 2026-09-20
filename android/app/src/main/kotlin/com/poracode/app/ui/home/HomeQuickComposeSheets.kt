package com.poracode.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.projects.ProjectSessionRuntime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeWorktreeSheet(
    worktrees: List<HomeQuickComposeWorktree>,
    currentBranch: String?,
    selected: HomeQuickComposeWorktree?,
    canCreate: Boolean,
    onDismiss: () -> Unit,
    onSelect: (HomeQuickComposeWorktree) -> Unit,
    onCreate: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(R.string.home_quick_compose_worktree_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            OutlinedButton(
                onClick = onCreate,
                enabled = canCreate,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            ) { Text(stringResource(R.string.git_add_worktree)) }
            HomeQuickComposeWorktreeRow(
                option = HomeQuickComposeWorktree(path = null, branch = currentBranch),
                title = stringResource(R.string.home_quick_compose_current_branch),
                detail = currentBranch ?: stringResource(R.string.home_quick_compose_project_default),
                selected = selected?.path == null,
                icon = Icons.Outlined.Code,
                onClick = onSelect,
            )
            if (worktrees.isEmpty()) {
                Text(
                    stringResource(R.string.home_quick_compose_no_worktrees),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                )
            } else {
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                worktrees.forEach { worktree ->
                    HomeQuickComposeWorktreeRow(
                        option = worktree,
                        title = worktree.branch
                            ?: stringResource(R.string.home_quick_compose_existing_worktree),
                        detail = worktree.path,
                        selected = selected?.path == worktree.path,
                        icon = Icons.Outlined.AccountTree,
                        onClick = onSelect,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeNewWorktreeSheet(
    branch: String,
    busy: Boolean,
    onBranchChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onCreate: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.git_add_worktree),
                style = MaterialTheme.typography.headlineSmall,
            )
            OutlinedTextField(
                value = branch,
                onValueChange = onBranchChange,
                enabled = !busy,
                singleLine = true,
                label = { Text(stringResource(R.string.git_branch_name)) },
                modifier = Modifier.fillMaxWidth(),
            )
            androidx.compose.foundation.layout.Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(
                    onClick = onDismiss,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.git_cancel)) }
                Button(
                    onClick = onCreate,
                    enabled = branch.isNotBlank() && !busy,
                    modifier = Modifier.weight(1f),
                ) {
                    if (busy) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.git_create_branch))
                    }
                }
            }
        }
    }
}

@Composable
internal fun HomeQuickComposeWorktreePicker(
    open: Boolean,
    worktrees: List<HomeQuickComposeWorktree>,
    currentBranch: String?,
    selected: HomeQuickComposeWorktree?,
    project: RemoteProject?,
    connectionId: ClientConnectionId?,
    projectRuntime: ProjectSessionRuntime,
    canCreate: Boolean,
    onDismiss: () -> Unit,
    onSelect: (HomeQuickComposeWorktree) -> Unit,
    onFailure: () -> Unit,
    onCreated: (HomeQuickComposeWorktree) -> Unit,
) {
    var creating by remember(project?.id) { mutableStateOf(false) }
    var createOpen by remember(project?.id) { mutableStateOf(false) }
    var branch by remember(project?.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    if (open) {
        HomeQuickComposeWorktreeSheet(
            worktrees = worktrees,
            currentBranch = currentBranch,
            selected = selected,
            canCreate = canCreate,
            onDismiss = onDismiss,
            onSelect = onSelect,
            onCreate = {
                onDismiss()
                createOpen = true
            },
        )
    }
    if (createOpen) {
        HomeQuickComposeNewWorktreeSheet(
            branch = branch,
            busy = creating,
            onBranchChange = { branch = it },
            onDismiss = { if (!creating) createOpen = false },
            onCreate = {
                val selectedProject = project
                val selectedConnection = connectionId
                if (selectedProject != null && selectedConnection != null && !creating) {
                    creating = true
                    createHomeQuickComposeWorktree(
                        scope = scope,
                        projectRuntime = projectRuntime,
                        connectionId = selectedConnection,
                        project = selectedProject,
                        branch = branch,
                        onFailure = {
                            creating = false
                            onFailure()
                        },
                        onCreated = {
                            creating = false
                            createOpen = false
                            branch = ""
                            onCreated(it)
                        },
                    )
                }
            },
        )
    }
}

@Composable
private fun HomeQuickComposeWorktreeRow(
    option: HomeQuickComposeWorktree,
    title: String,
    detail: String?,
    selected: Boolean,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: (HomeQuickComposeWorktree) -> Unit,
) {
    ListItem(
        leadingContent = { Icon(icon, contentDescription = null) },
        headlineContent = { Text(title) },
        supportingContent = { detail?.let { Text(it, maxLines = 1) } },
        trailingContent = { RadioButton(selected = selected, onClick = null) },
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(option) },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeQuickComposeSlashCommandSheet(
    commands: List<HomeQuickComposeSlashCommand>,
    onDismiss: () -> Unit,
    onSelect: (HomeQuickComposeSlashCommand) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding(),
        ) {
            Text(
                stringResource(R.string.home_quick_compose_commands),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            if (commands.isEmpty()) {
                Text(
                    stringResource(R.string.home_quick_compose_no_commands),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                )
            } else {
                commands.forEach { command ->
                    ListItem(
                        leadingContent = {
                            Icon(Icons.Outlined.Terminal, contentDescription = null)
                        },
                        headlineContent = {
                            Text(command.invocation)
                        },
                        supportingContent = {
                            Text(
                                listOfNotNull(command.label, command.description, command.argumentHint)
                                    .joinToString(" · "),
                                maxLines = 2,
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(command) },
                    )
                }
            }
        }
    }
}
