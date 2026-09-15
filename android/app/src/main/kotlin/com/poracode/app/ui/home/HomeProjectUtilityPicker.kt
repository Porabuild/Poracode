package com.poracode.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.CallMerge
import androidx.compose.material.icons.outlined.NoteAlt
import androidx.compose.material.icons.outlined.PlayCircleOutline
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.RemoteProject

internal enum class HomeProjectUtility { Terminal, Notes, PullRequests, GithubActions }

internal val HomeProjectUtility.clearsThreadSelection: Boolean
    get() = this == HomeProjectUtility.Terminal

internal fun HomeProjectUtility.supports(project: RemoteProject): Boolean =
    this == HomeProjectUtility.Terminal || project.id != HOME_PROJECT_ID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HomeProjectUtilityPicker(
    utility: HomeProjectUtility,
    projects: List<HomeProjectFilterOption>,
    onDismiss: () -> Unit,
    onSelect: (HomeProjectFilterOption) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                stringResource(R.string.projects_select_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            Text(
                utilityLabel(utility),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            projects.forEach { option ->
                ListItem(
                    headlineContent = { Text(option.project.name) },
                    supportingContent = { Text(option.hostName) },
                    leadingContent = {
                        Icon(utilityIcon(utility), contentDescription = null)
                    },
                    modifier = Modifier.clickable(role = Role.Button) { onSelect(option) },
                )
            }
            if (projects.isEmpty()) {
                Text(
                    stringResource(R.string.projects_empty_message),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
internal fun utilityLabel(utility: HomeProjectUtility): String = stringResource(
    when (utility) {
        HomeProjectUtility.Terminal -> R.string.terminal_title
        HomeProjectUtility.Notes -> R.string.projects_notes
        HomeProjectUtility.PullRequests -> R.string.github_pull_requests
        HomeProjectUtility.GithubActions -> R.string.github_actions
    },
)

internal fun utilityIcon(utility: HomeProjectUtility): ImageVector = when (utility) {
    HomeProjectUtility.Terminal -> Icons.Outlined.Terminal
    HomeProjectUtility.Notes -> Icons.Outlined.NoteAlt
    HomeProjectUtility.PullRequests -> Icons.AutoMirrored.Outlined.CallMerge
    HomeProjectUtility.GithubActions -> Icons.Outlined.PlayCircleOutline
}
