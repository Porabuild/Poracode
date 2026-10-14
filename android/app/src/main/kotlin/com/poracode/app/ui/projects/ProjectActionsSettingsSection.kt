package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectAction
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.ProjectScripts
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import java.util.UUID
import kotlinx.coroutines.launch

internal val PROJECT_ACTION_ICON_TOKENS = listOf(
    "play", "terminal", "rocket", "hammer", "wrench", "cog", "zap", "bug",
    "test-tube", "gauge", "package", "upload", "server", "database", "globe",
    "file-code", "file-text", "braces",
)

@Composable
internal fun ProjectActionsSettingsSection(
    runtime: ProjectSessionRuntime,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
) {
    val original = project.scripts?.actions.orEmpty()
    var actions by remember(identity, original) { mutableStateOf(original) }
    var newName by remember(identity) { mutableStateOf("") }
    var newCommand by remember(identity) { mutableStateOf("") }
    var newIcon by remember(identity) { mutableStateOf("play") }
    var localBusy by remember(identity) { mutableStateOf(false) }
    var failure by remember(identity) { mutableStateOf<ProjectOperationFailure?>(null) }
    val scope = rememberCoroutineScope()
    val enabled = access.canManage && !commandBusy && !localBusy
    val normalizedActions = actions.map(ProjectAction::normalized)
    val valid = normalizedActions.all { it.name.isNotEmpty() && it.command.isNotEmpty() }

    ProjectSection(stringResource(R.string.projects_actions)) {
        Text(
            stringResource(R.string.projects_actions_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        actions.forEachIndexed { index, action ->
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        action.name.ifBlank { stringResource(R.string.projects_action_untitled) },
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    IconButton(
                        onClick = { actions = actions.toMutableList().also { it.removeAt(index) } },
                        enabled = enabled,
                    ) {
                        Icon(Icons.Outlined.Delete, stringResource(R.string.projects_delete_action))
                    }
                }
                OutlinedTextField(
                    value = action.name,
                    onValueChange = { value ->
                        actions = actions.updated(index, action.copy(name = value))
                    },
                    label = { Text(stringResource(R.string.projects_action_name)) },
                    singleLine = true,
                    enabled = enabled,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = action.command,
                    onValueChange = { value ->
                        actions = actions.updated(index, action.copy(command = value))
                    },
                    label = { Text(stringResource(R.string.projects_action_command)) },
                    minLines = 2,
                    maxLines = 5,
                    enabled = enabled,
                    modifier = Modifier.fillMaxWidth(),
                )
                ProjectActionIconMenu(
                    value = action.icon ?: "play",
                    enabled = enabled,
                    onChange = { value ->
                        actions = actions.updated(index, action.copy(icon = value))
                    },
                )
            }
        }
        if (actions.isNotEmpty()) {
            Text(
                stringResource(R.string.projects_add_action),
                style = MaterialTheme.typography.titleSmall,
            )
        }
        OutlinedTextField(
            value = newName,
            onValueChange = { newName = it },
            label = { Text(stringResource(R.string.projects_action_name)) },
            singleLine = true,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = newCommand,
            onValueChange = { newCommand = it },
            label = { Text(stringResource(R.string.projects_action_command)) },
            minLines = 2,
            maxLines = 5,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        )
        ProjectActionIconMenu(newIcon, enabled) { newIcon = it }
        OutlinedButton(
            onClick = {
                actions = actions + ProjectAction(
                    id = UUID.randomUUID().toString().lowercase(),
                    name = newName.trim(),
                    command = newCommand.trim(),
                    icon = newIcon,
                )
                newName = ""
                newCommand = ""
                newIcon = "play"
            },
            enabled = enabled && newName.isNotBlank() && newCommand.isNotBlank(),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = null)
            Text(stringResource(R.string.projects_add_action))
        }
        ProjectFailureText(failure)
        Button(
            onClick = {
                localBusy = true
                failure = null
                scope.launch {
                    val scripts = (project.scripts ?: ProjectScripts()).copy(
                        actions = normalizedActions,
                    )
                    when (val outcome = runtime.catalog.execute(
                        identity,
                        UpdateProject(
                            identity.projectId,
                            ProjectPatch(scripts = PatchValue.Set(scripts)),
                        ),
                    )) {
                        is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                        else -> Unit
                    }
                    localBusy = false
                }
            },
            enabled = enabled && valid && normalizedActions != original,
        ) { Text(stringResource(R.string.rich_chat_save)) }
    }
}

@Composable
private fun ProjectActionIconMenu(
    value: String,
    enabled: Boolean,
    onChange: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }, enabled = enabled) {
            Text(stringResource(R.string.projects_action_icon_value, value))
            Icon(Icons.Outlined.ExpandMore, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            PROJECT_ACTION_ICON_TOKENS.forEach { token ->
                DropdownMenuItem(
                    text = { Text(token) },
                    onClick = {
                        expanded = false
                        onChange(token)
                    },
                )
            }
        }
    }
}

internal fun ProjectAction.normalized(): ProjectAction = copy(
    name = name.trim(),
    command = command.trim(),
    icon = icon?.trim()?.ifEmpty { null },
)

private fun List<ProjectAction>.updated(index: Int, value: ProjectAction): List<ProjectAction> =
    toMutableList().also { it[index] = value }
