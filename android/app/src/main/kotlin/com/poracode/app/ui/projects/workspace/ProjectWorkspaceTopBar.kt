package com.poracode.app.ui.projects.workspace

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.theme.PoracodeIcons

/**
 * Top app bar for [ProjectWorkspaceScreen]: back navigation, branch/worktree entry points (Git
 * section only), and the section-aware refresh action.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProjectWorkspaceTopBar(
    projectName: String,
    section: ProjectWorkspaceSection,
    access: ProjectWorkspaceAccess,
    actions: ProjectWorkspaceActions,
    onBack: () -> Unit,
    onShowBranches: () -> Unit,
    onShowWorktrees: () -> Unit,
    onRefresh: () -> Unit,
) {
    PoracodeTopAppBar(
        title = { Text(projectName) },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    PoracodeIcons.ArrowBack,
                    contentDescription = stringResource(R.string.back),
                )
            }
        },
        actions = {
            if (section == ProjectWorkspaceSection.Git) {
                IconButton(
                    onClick = onShowBranches,
                    enabled = access.canRead,
                ) {
                    Icon(
                        PoracodeIcons.CallSplit,
                        contentDescription = stringResource(R.string.git_view_branches),
                    )
                }
                IconButton(
                    onClick = onShowWorktrees,
                    enabled = access.canRead,
                ) {
                    Icon(
                        PoracodeIcons.AccountTree,
                        contentDescription = stringResource(R.string.git_view_worktrees),
                    )
                }
            }
            IconButton(
                onClick = onRefresh,
                enabled = when (section) {
                    ProjectWorkspaceSection.Files -> actions.canBrowse
                    ProjectWorkspaceSection.Git -> actions.canRefreshGit
                    ProjectWorkspaceSection.Github -> access.canRead
                },
            ) {
                Icon(
                    PoracodeIcons.Refresh,
                    contentDescription = stringResource(R.string.workspace_refresh),
                )
            }
        },
    )
}
