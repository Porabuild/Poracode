package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.poracode.app.R
import com.poracode.app.model.PatchValue
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectPatch
import com.poracode.app.model.RelocateProject
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoveProject
import com.poracode.app.model.UpdateProject
import com.poracode.app.model.hostPath
import com.poracode.app.model.projectNameProblem
import com.poracode.app.model.trimJsWhitespace
import com.poracode.app.session.projects.ProjectCommandOutcome
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

@Composable
internal fun ProjectGeneralSection(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    project: RemoteProject,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
    commandBusy: Boolean,
    onRemoved: () -> Unit,
) {
    var name by remember(identity, project.name) { mutableStateOf(project.name) }
    var localBusy by remember(identity) { mutableStateOf(false) }
    var failure by remember(identity) { mutableStateOf<ProjectOperationFailure?>(null) }
    var showFolders by remember(identity) { mutableStateOf(false) }
    var pendingRelocation by remember(identity) { mutableStateOf<String?>(null) }
    var pendingDisable by remember(identity) { mutableStateOf(false) }
    var confirmRemove by remember(identity) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val enabled = access.canManage && !commandBusy && !localBusy
    val enabledDescription = stringResource(R.string.projects_enabled)

    fun execute(command: com.poracode.app.model.ProjectCommand, applied: () -> Unit = {}) {
        localBusy = true
        failure = null
        scope.launch {
            when (val outcome = runtime.catalog.execute(command)) {
                is ProjectCommandOutcome.Applied -> applied()
                is ProjectCommandOutcome.Rejected -> failure = outcome.failure
                ProjectCommandOutcome.Stale -> Unit
            }
            localBusy = false
        }
    }

    ProjectSection(stringResource(R.string.projects_general)) {
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text(stringResource(R.string.projects_name)) },
            isError = name != project.name && projectNameProblem(name) != null,
            singleLine = true,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                execute(
                    UpdateProject(
                        identity.projectId,
                        ProjectPatch(name = PatchValue.Set(name.trimJsWhitespace())),
                    ),
                )
            },
            enabled = enabled && name != project.name && projectNameProblem(name) == null,
        ) { Text(stringResource(R.string.projects_save_name)) }
        Text(stringResource(R.string.projects_location), style = MaterialTheme.typography.labelLarge)
        Text(
            project.location.hostPath(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = { showFolders = true }, enabled = enabled) {
            Text(stringResource(R.string.projects_relocate))
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.projects_enabled), style = MaterialTheme.typography.titleSmall)
                Text(
                    stringResource(R.string.projects_enabled_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = project.disabled != true,
                onCheckedChange = { checked ->
                    if (checked) {
                        execute(
                            UpdateProject(
                                identity.projectId,
                                ProjectPatch(disabled = PatchValue.Set(false)),
                            ),
                        )
                    } else {
                        pendingDisable = true
                    }
                },
                enabled = enabled,
                modifier = Modifier.semantics {
                    contentDescription = enabledDescription
                },
            )
        }
        ProjectFailureText(failure)
        OutlinedButton(
            onClick = { confirmRemove = true },
            enabled = enabled,
        ) { Text(stringResource(R.string.projects_remove)) }
    }

    if (showFolders) {
        if (lease.connectionId == identity.connectionId) {
            HostDirectoryPicker(
                runtime = runtime,
                lease = lease,
                title = stringResource(R.string.projects_choose_new_location),
                initialPath = project.location.hostPath(),
                onDismiss = { showFolders = false },
                onSelect = {
                    showFolders = false
                    pendingRelocation = it
                },
            )
        }
    }
    pendingRelocation?.let { path ->
        ConfirmationDialog(
            title = stringResource(R.string.projects_relocate_confirm_title),
            message = stringResource(R.string.projects_relocate_confirm_message, path),
            action = stringResource(R.string.projects_relocate),
            onDismiss = { pendingRelocation = null },
            onConfirm = {
                pendingRelocation = null
                execute(RelocateProject(identity.projectId, path))
            },
        )
    }
    if (pendingDisable) {
        ConfirmationDialog(
            title = stringResource(R.string.projects_disable_confirm_title, project.name),
            message = stringResource(R.string.projects_disable_confirm_message),
            action = stringResource(R.string.projects_disable),
            onDismiss = { pendingDisable = false },
            onConfirm = {
                pendingDisable = false
                execute(
                    UpdateProject(
                        identity.projectId,
                        ProjectPatch(disabled = PatchValue.Set(true)),
                    ),
                )
            },
        )
    }
    if (confirmRemove) {
        ConfirmationDialog(
            title = stringResource(R.string.projects_remove_confirm_title, project.name),
            message = stringResource(R.string.projects_remove_confirm_message),
            action = stringResource(R.string.projects_remove),
            onDismiss = { confirmRemove = false },
            onConfirm = {
                confirmRemove = false
                execute(RemoveProject(identity.projectId), onRemoved)
            },
        )
    }
}

@Composable
private fun ConfirmationDialog(
    title: String,
    message: String,
    action: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { Button(onClick = onConfirm) { Text(action) } },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.projects_cancel)) }
        },
    )
}
