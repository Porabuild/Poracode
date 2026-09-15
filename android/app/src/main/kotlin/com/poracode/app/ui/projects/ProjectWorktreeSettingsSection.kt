package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
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
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.ProjectScripts
import com.poracode.app.model.ProjectWorktreeLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.model.WorktreeStorageMode
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

internal enum class ProjectWorktreeChoice { DesktopDefault, Custom, ProjectRelative }

@Composable
internal fun ProjectWorktreeSettingsSection(
    runtime: ProjectSessionRuntime,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    inheritedSettings: ProjectInheritedSettings,
) {
    val initialChoice = project.worktreeLocation.choice()
    var choice by remember(identity, project.worktreeLocation) { mutableStateOf(initialChoice) }
    var basePath by remember(identity, project.worktreeLocation) {
        mutableStateOf(project.worktreeLocation?.basePath.orEmpty())
    }
    var setupScript by remember(identity, project.scripts) {
        mutableStateOf(project.scripts?.setupScript.orEmpty())
    }
    var cleanupScript by remember(identity, project.scripts) {
        mutableStateOf(project.scripts?.cleanupScript.orEmpty())
    }
    var copyPatterns by remember(identity, project.scripts) {
        mutableStateOf(project.scripts?.worktreeCopyPatterns.orEmpty().joinToString("\n"))
    }
    var localBusy by remember(identity) { mutableStateOf(false) }
    var failure by remember(identity) { mutableStateOf<ProjectOperationFailure?>(null) }
    val scope = rememberCoroutineScope()
    val enabled = access.canManage && !commandBusy && !localBusy
    val nextScripts = (project.scripts ?: ProjectScripts()).copy(
        setupScript = normalizedSetting(setupScript),
        cleanupScript = normalizedSetting(cleanupScript),
        worktreeCopyPatterns = copyPatterns.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()
            .ifEmpty { null },
    )
    val nextLocation = when (choice) {
        ProjectWorktreeChoice.DesktopDefault -> null
        ProjectWorktreeChoice.Custom -> if (
            project.worktreeLocation != null &&
            project.worktreeLocation.mode == null &&
            project.worktreeLocation?.basePath == normalizedSetting(basePath)
        ) {
            project.worktreeLocation
        } else {
            ProjectWorktreeLocation(
                mode = WorktreeStorageMode.GLOBAL,
                basePath = normalizedSetting(basePath),
            )
        }
        ProjectWorktreeChoice.ProjectRelative -> ProjectWorktreeLocation(
            mode = WorktreeStorageMode.PROJECT_RELATIVE,
        )
    }
    val hasChanges = nextScripts != (project.scripts ?: ProjectScripts()) ||
        nextLocation != project.worktreeLocation

    ProjectSection(stringResource(R.string.projects_worktrees)) {
        Text(
            stringResource(R.string.projects_worktree_location_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(
                R.string.projects_worktree_inherited_value,
                if (inheritedSettings.worktreeStorageMode == "project-relative") {
                    stringResource(R.string.projects_worktree_project_relative)
                } else {
                    inheritedSettings.basePath(project.location)
                },
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ProjectWorktreeChoice.entries.forEach { option ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RadioButton(
                    selected = choice == option,
                    onClick = { choice = option },
                    enabled = enabled,
                )
                Column {
                    Text(stringResource(option.label()))
                    if (option == ProjectWorktreeChoice.DesktopDefault) {
                        Text(
                            stringResource(R.string.projects_worktree_default_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        if (choice == ProjectWorktreeChoice.Custom) {
            OutlinedTextField(
                value = basePath,
                onValueChange = { basePath = it },
                label = { Text(stringResource(R.string.projects_worktree_base_folder)) },
                enabled = enabled,
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        ScriptField(R.string.projects_setup_script, setupScript, { setupScript = it }, enabled)
        ScriptField(R.string.projects_cleanup_script, cleanupScript, { cleanupScript = it }, enabled)
        ScriptField(R.string.projects_copy_patterns, copyPatterns, { copyPatterns = it }, enabled)
        ProjectFailureText(failure)
        Button(
            onClick = {
                localBusy = true
                failure = null
                scope.launch {
                    val locationPatch = when {
                        nextLocation == project.worktreeLocation -> PatchValue.Unchanged
                        nextLocation == null -> PatchValue.Clear
                        else -> PatchValue.Set(nextLocation)
                    }
                    when (val outcome = runtime.catalog.execute(
                        identity,
                        UpdateProject(
                            identity.projectId,
                            ProjectPatch(
                                scripts = if (nextScripts == (project.scripts ?: ProjectScripts())) {
                                    PatchValue.Unchanged
                                } else {
                                    PatchValue.Set(nextScripts)
                                },
                                worktreeLocation = locationPatch,
                            ),
                        ),
                    )) {
                        is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                        else -> Unit
                    }
                    localBusy = false
                }
            },
            enabled = enabled && hasChanges,
        ) { Text(stringResource(R.string.rich_chat_save)) }
    }
}

@Composable
private fun ScriptField(
    label: Int,
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(stringResource(label)) },
        enabled = enabled,
        minLines = 3,
        maxLines = 7,
        modifier = Modifier.fillMaxWidth(),
    )
}

internal fun ProjectWorktreeLocation?.choice(): ProjectWorktreeChoice = when {
    this == null -> ProjectWorktreeChoice.DesktopDefault
    mode == WorktreeStorageMode.PROJECT_RELATIVE -> ProjectWorktreeChoice.ProjectRelative
    else -> ProjectWorktreeChoice.Custom
}

private fun ProjectWorktreeChoice.label(): Int = when (this) {
    ProjectWorktreeChoice.DesktopDefault -> R.string.projects_worktree_desktop_default
    ProjectWorktreeChoice.Custom -> R.string.projects_worktree_custom
    ProjectWorktreeChoice.ProjectRelative -> R.string.projects_worktree_project_relative
}

internal fun normalizedSetting(value: String): String? = value.trim().ifEmpty { null }
