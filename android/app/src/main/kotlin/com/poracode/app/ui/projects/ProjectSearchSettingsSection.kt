package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.poracode.app.model.ProjectSearchSettings
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

internal enum class ProjectIgnoreFilesChoice(val wireValue: Boolean?) {
    Inherit(null), Enabled(true), Disabled(false);

    companion object {
        fun from(value: Boolean?): ProjectIgnoreFilesChoice = when (value) {
            true -> Enabled
            false -> Disabled
            null -> Inherit
        }
    }
}

internal data class ProjectSearchPatternRow(
    val pattern: String,
    val inherited: Boolean,
    val locked: Boolean,
)

internal object ProjectSearchSettingsPresentation {
    const val LOCKED_PATTERN = "**/.git"
    val defaultExclude = mapOf(
        "**/node_modules" to true,
        "**/dist" to true,
        "**/build" to true,
        "**/.next" to true,
        "**/.turbo" to true,
        "**/.venv" to true,
        "**/__pycache__" to true,
        "**/coverage" to true,
        "**/.DS_Store" to true,
    )

    fun baseline(global: Map<String, Boolean>): Map<String, Boolean> =
        defaultExclude + global

    fun rows(
        baseline: Map<String, Boolean>,
        overrides: Map<String, Boolean>,
    ): List<ProjectSearchPatternRow> {
        val rows = mutableListOf(ProjectSearchPatternRow(LOCKED_PATTERN, true, true))
        val seen = mutableSetOf(LOCKED_PATTERN)
        baseline.keys.sorted().filter { baseline[it] == true }.forEach { pattern ->
            seen += pattern
            if (overrides[pattern] != false) {
                rows += ProjectSearchPatternRow(
                    pattern = pattern,
                    inherited = overrides[pattern] == null,
                    locked = false,
                )
            }
        }
        overrides.keys.sorted().filter { overrides[it] == true && it !in seen }.forEach { pattern ->
            rows += ProjectSearchPatternRow(pattern, inherited = false, locked = false)
        }
        return rows
    }
}

@Composable
internal fun ProjectSearchSettingsSection(
    runtime: ProjectSessionRuntime,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    inheritedSettings: ProjectInheritedSettings,
) {
    val original = project.searchSettings.normalized()
    var choice by remember(identity, original) {
        mutableStateOf(ProjectIgnoreFilesChoice.from(original?.useIgnoreFiles))
    }
    var patterns by remember(identity, original) {
        mutableStateOf(original?.exclude.orEmpty())
    }
    var newPattern by remember(identity) { mutableStateOf("") }
    var localBusy by remember(identity) { mutableStateOf(false) }
    var failure by remember(identity) { mutableStateOf<ProjectOperationFailure?>(null) }
    val scope = rememberCoroutineScope()
    val enabled = access.canManage && !commandBusy && !localBusy
    val next = ProjectSearchSettings(choice.wireValue, patterns.ifEmpty { null }).normalized()
    val rows = ProjectSearchSettingsPresentation.rows(
        baseline = ProjectSearchSettingsPresentation.baseline(
            inheritedSettings.searchExclude,
        ),
        overrides = patterns,
    )

    ProjectSection(stringResource(R.string.projects_search)) {
        Text(
            stringResource(R.string.projects_search_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(stringResource(R.string.projects_use_ignore_files), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ProjectIgnoreFilesChoice.entries.forEach { option ->
                FilterChip(
                    selected = choice == option,
                    onClick = { choice = option },
                    enabled = enabled,
                    label = { Text(stringResource(option.label())) },
                )
            }
        }
        if (choice == ProjectIgnoreFilesChoice.Inherit) {
            Text(
                stringResource(
                    R.string.projects_search_inherited_value,
                    stringResource(
                        if (inheritedSettings.searchUseIgnoreFiles) {
                            R.string.projects_enabled
                        } else {
                            R.string.projects_disabled
                        },
                    ),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            stringResource(R.string.projects_exclude_patterns),
            style = MaterialTheme.typography.titleSmall,
        )
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    row.pattern,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (row.inherited) {
                    Text(
                        stringResource(R.string.projects_inherited),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (row.locked) {
                    Icon(Icons.Outlined.Lock, stringResource(R.string.projects_always_excluded))
                } else {
                    IconButton(
                        onClick = {
                            val baseline = ProjectSearchSettingsPresentation.baseline(
                                inheritedSettings.searchExclude,
                            )
                            patterns = if (baseline[row.pattern] == true &&
                                patterns[row.pattern] == null
                            ) {
                                patterns + (row.pattern to false)
                            } else {
                                patterns - row.pattern
                            }
                        },
                        enabled = enabled,
                    ) {
                        Icon(Icons.Outlined.Delete, stringResource(R.string.projects_remove_pattern))
                    }
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = newPattern,
                onValueChange = { newPattern = it },
                label = { Text(stringResource(R.string.projects_add_pattern)) },
                singleLine = true,
                enabled = enabled,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = {
                    patterns = patterns + (newPattern.trim() to true)
                    newPattern = ""
                },
                enabled = enabled && newPattern.isNotBlank(),
            ) {
                Icon(Icons.Outlined.Add, stringResource(R.string.projects_add_pattern))
            }
        }
        ProjectFailureText(failure)
        Button(
            onClick = {
                localBusy = true
                failure = null
                scope.launch {
                    val patch: PatchValue<ProjectSearchSettings> = if (next == null) {
                        PatchValue.Clear
                    } else {
                        PatchValue.Set(next)
                    }
                    when (val outcome = runtime.catalog.execute(
                        identity,
                        UpdateProject(
                            identity.projectId,
                            ProjectPatch(searchSettings = patch),
                        ),
                    )) {
                        is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                        else -> Unit
                    }
                    localBusy = false
                }
            },
            enabled = enabled && next != original,
        ) { Text(stringResource(R.string.rich_chat_save)) }
    }
}

private fun ProjectIgnoreFilesChoice.label(): Int = when (this) {
    ProjectIgnoreFilesChoice.Inherit -> R.string.projects_inherit
    ProjectIgnoreFilesChoice.Enabled -> R.string.projects_enabled
    ProjectIgnoreFilesChoice.Disabled -> R.string.projects_disabled
}

internal fun ProjectSearchSettings?.normalized(): ProjectSearchSettings? {
    if (this == null) return null
    val normalizedExclude = exclude?.takeIf { it.isNotEmpty() }
    if (useIgnoreFiles == null && normalizedExclude == null) return null
    return copy(exclude = normalizedExclude)
}
