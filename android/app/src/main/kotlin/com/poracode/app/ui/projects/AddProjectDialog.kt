package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.poracode.app.R
import com.poracode.app.model.AddExistingProject
import com.poracode.app.model.CloneProject
import com.poracode.app.model.CloneUrlProblem
import com.poracode.app.model.CloneUrlSource
import com.poracode.app.model.CreateProject
import com.poracode.app.model.ProjectCommand
import com.poracode.app.model.ProjectNameProblem
import com.poracode.app.model.cloneUrlProblem
import com.poracode.app.model.projectNameProblem
import com.poracode.app.model.trimJsWhitespace
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

private enum class ProjectAddMode { EXISTING, CREATE, CLONE }

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun AddProjectDialog(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    enabled: Boolean,
    onDismiss: () -> Unit,
) {
    var mode by remember { mutableStateOf(ProjectAddMode.EXISTING) }
    var path by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var cloneUrl by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<ProjectOperationFailure?>(null) }
    var validationMessage by remember { mutableStateOf<Int?>(null) }
    var showFolders by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun validateAndBuild(): ProjectCommand? {
        validationMessage = when {
            path.isBlank() -> R.string.projects_path_required
            mode != ProjectAddMode.EXISTING && projectNameProblem(name) != null ->
                projectNameMessage(projectNameProblem(name)!!)
            mode == ProjectAddMode.EXISTING && name.isNotBlank() &&
                projectNameProblem(name) != null -> projectNameMessage(projectNameProblem(name)!!)
            mode == ProjectAddMode.CLONE && cloneUrlProblem(cloneUrl) != null ->
                cloneUrlMessage(cloneUrlProblem(cloneUrl)!!)
            else -> null
        }
        if (validationMessage != null) return null
        val cleanName = name.trimJsWhitespace()
        return when (mode) {
            ProjectAddMode.EXISTING -> AddExistingProject(
                path = path,
                name = cleanName.ifEmpty { null },
            )
            ProjectAddMode.CREATE -> CreateProject(parentPath = path, name = cleanName)
            ProjectAddMode.CLONE -> CloneProject(
                parentPath = path,
                name = cleanName,
                source = CloneUrlSource(cloneUrl),
            )
        }
    }

    Dialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth(0.94f).widthIn(max = 640.dp).heightIn(max = 720.dp),
        ) {
            Column(
                Modifier.padding(20.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    stringResource(R.string.projects_add_title),
                    style = MaterialTheme.typography.headlineSmall,
                )
                FlowRow(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AddModeChip(
                        selected = mode == ProjectAddMode.EXISTING,
                        label = stringResource(R.string.projects_add_existing),
                        onClick = { mode = ProjectAddMode.EXISTING },
                    )
                    AddModeChip(
                        selected = mode == ProjectAddMode.CREATE,
                        label = stringResource(R.string.projects_create_new),
                        onClick = { mode = ProjectAddMode.CREATE },
                    )
                    AddModeChip(
                        selected = mode == ProjectAddMode.CLONE,
                        label = stringResource(R.string.projects_clone_repository),
                        onClick = { mode = ProjectAddMode.CLONE },
                    )
                }
                OutlinedTextField(
                    value = path,
                    onValueChange = { path = it; validationMessage = null },
                    label = {
                        Text(
                            stringResource(
                                if (mode == ProjectAddMode.EXISTING) {
                                    R.string.projects_project_folder
                                } else {
                                    R.string.projects_parent_folder
                                },
                            ),
                        )
                    },
                    supportingText = { Text(stringResource(R.string.projects_host_path_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = { showFolders = true },
                    enabled = enabled && !submitting,
                ) {
                    Icon(Icons.Outlined.FolderOpen, contentDescription = null)
                    Text(stringResource(R.string.projects_browse), Modifier.padding(start = 8.dp))
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; validationMessage = null },
                    label = {
                        Text(
                            stringResource(
                                if (mode == ProjectAddMode.EXISTING) {
                                    R.string.projects_name_optional
                                } else {
                                    R.string.projects_name
                                },
                            ),
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (mode == ProjectAddMode.CLONE) {
                    OutlinedTextField(
                        value = cloneUrl,
                        onValueChange = { cloneUrl = it; validationMessage = null },
                        label = { Text(stringResource(R.string.projects_repository_url)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                validationMessage?.let {
                    Text(stringResource(it), color = MaterialTheme.colorScheme.error)
                }
                ProjectFailureText(failure)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, enabled = !submitting) {
                        Text(stringResource(R.string.projects_cancel))
                    }
                    Button(
                        onClick = {
                            val command = validateAndBuild() ?: return@Button
                            submitting = true
                            failure = null
                            scope.launch {
                                when (val outcome = runtime.catalog.execute(command)) {
                                    is ProjectCommandOutcome.Applied -> onDismiss()
                                    is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                                    ProjectCommandOutcome.Stale -> onDismiss()
                                }
                                submitting = false
                            }
                        },
                        enabled = enabled && !submitting,
                    ) {
                        Text(
                            stringResource(
                                if (submitting) R.string.projects_working else R.string.projects_add,
                            ),
                        )
                    }
                }
            }
        }
    }

    if (showFolders) {
        HostDirectoryPicker(
            runtime = runtime,
            lease = lease,
            title = stringResource(R.string.projects_choose_folder),
            initialPath = path,
            onDismiss = { showFolders = false },
            onSelect = { path = it; showFolders = false },
        )
    }
}

@Composable
private fun AddModeChip(selected: Boolean, label: String, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) })
}

private fun projectNameMessage(problem: ProjectNameProblem): Int = when (problem) {
    ProjectNameProblem.EMPTY -> R.string.projects_name_required
    ProjectNameProblem.RESERVED -> R.string.projects_name_reserved
    ProjectNameProblem.ILLEGAL_CHARACTER -> R.string.projects_name_illegal
    ProjectNameProblem.TOO_LONG -> R.string.projects_name_too_long
}

private fun cloneUrlMessage(problem: CloneUrlProblem): Int = when (problem) {
    CloneUrlProblem.EMPTY -> R.string.projects_url_required
    CloneUrlProblem.LEADING_DASH,
    CloneUrlProblem.REMOTE_HELPER,
    CloneUrlProblem.DISALLOWED_SCHEME,
    CloneUrlProblem.INVALID_SYNTAX,
    -> R.string.projects_url_invalid
}
