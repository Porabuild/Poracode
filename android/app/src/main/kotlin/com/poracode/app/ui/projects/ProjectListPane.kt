package com.poracode.app.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.CatalogProject
import com.poracode.app.ui.components.EmptyStateView

@Composable
internal fun ProjectListPane(
    projects: List<CatalogProject>,
    selectedProjectId: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (projects.isEmpty()) {
        EmptyStateView(
            title = stringResource(R.string.projects_empty_title),
            message = stringResource(R.string.projects_empty_message),
            modifier = modifier,
        )
        return
    }
    LazyColumn(
        modifier = modifier.padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(projects, key = { "${it.identity.connectionId.value}:${it.identity.projectId}" }) {
            item ->
            val project = item.project
            val description = stringResource(
                R.string.projects_project_row_description,
                project.name,
                project.location.path,
            )
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(item.identity.projectId) }
                    .semantics {
                        role = Role.Button
                        contentDescription = description
                    },
                colors = CardDefaults.cardColors(
                    containerColor = if (item.identity.projectId == selectedProjectId) {
                        MaterialTheme.colorScheme.secondaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                    },
                ),
            ) {
                Row(
                    Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (project.disabled == true) Icons.Outlined.Block else Icons.Outlined.Folder,
                        contentDescription = null,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(
                            project.name,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            project.location.path,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (project.disabled == true) {
                            Text(
                                stringResource(R.string.projects_disabled),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    Icon(
                        Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                        contentDescription = null,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ProjectEmptyDetail(modifier: Modifier = Modifier) {
    EmptyStateView(
        title = stringResource(R.string.projects_select_title),
        message = stringResource(R.string.projects_select_message),
        modifier = modifier,
    )
}
