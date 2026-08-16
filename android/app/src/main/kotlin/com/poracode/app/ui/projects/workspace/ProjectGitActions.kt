package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.GitRequests
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.git.GitProcedure
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProjectGitActions(
    location: ProjectLocation,
    status: GitStatusResult,
    enabled: Boolean,
    busy: Boolean,
    outcome: GitMutationOutcome?,
    onRequest: (GitOperationRequest) -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled && !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.git_actions)) }
        when (outcome) {
            is GitMutationOutcome.Applied -> GitOutcomeText(R.string.git_change_applied)
            is GitMutationOutcome.Reconciled -> GitOutcomeText(
                if (outcome.authoritativeStatus != null) {
                    R.string.git_change_reconciled
                } else {
                    R.string.git_change_unknown
                },
            )
            null -> Unit
        }
    }
    if (expanded) {
        ModalBottomSheet(onDismissRequest = { expanded = false }) {
            GitActionsSheet(
                location = location,
                status = status,
                enabled = enabled && !busy,
                onRequest = onRequest,
                onClose = { expanded = false },
            )
        }
    }
}

@Composable
internal fun GitConfirmationDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.git_confirmation_title)) },
        text = { Text(stringResource(R.string.git_confirmation_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.git_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.git_cancel)) }
        },
    )
}

@Composable
private fun GitOutcomeText(resource: Int) {
    Text(
        stringResource(resource),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun GitActionsSheet(
    location: ProjectLocation,
    status: GitStatusResult,
    enabled: Boolean,
    onRequest: (GitOperationRequest) -> Unit,
    onClose: () -> Unit,
) {
    var commitMessage by rememberSaveable { mutableStateOf("") }
    var branch by rememberSaveable { mutableStateOf("") }
    var remoteName by rememberSaveable { mutableStateOf("origin") }
    var remoteUrl by rememberSaveable { mutableStateOf("") }
    var worktreePath by rememberSaveable { mutableStateOf("") }
    var sourceBranch by rememberSaveable { mutableStateOf("") }
    val submit: (GitProcedure, Map<String, JsonElement>) -> Unit = { procedure, fields ->
        onRequest(GitRequests.create(procedure, location, fields))
    }
    LazyColumn(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.git_actions), style = MaterialTheme.typography.headlineSmall)
        }
        item {
            ActionSection(stringResource(R.string.git_quick_actions)) {
                GitActionButton(R.string.git_fetch, enabled) { submit(GitProcedure.Fetch, emptyMap()) }
                GitActionButton(R.string.git_pull, enabled) { submit(GitProcedure.Pull, emptyMap()) }
                GitActionButton(R.string.git_pull_rebase, enabled) {
                    submit(GitProcedure.PullRebase, emptyMap())
                }
                GitActionButton(R.string.git_push, enabled) { submit(GitProcedure.Push, emptyMap()) }
                GitActionButton(R.string.git_sync, enabled) { submit(GitProcedure.Sync, emptyMap()) }
                GitActionButton(R.string.git_sync_rebase, enabled) {
                    submit(GitProcedure.SyncRebase, emptyMap())
                }
            }
        }
        item {
            ActionSection(stringResource(R.string.git_staging)) {
                GitActionButton(R.string.git_stage_all, enabled) {
                    submit(GitProcedure.StageAll, emptyMap())
                }
                GitActionButton(R.string.git_unstage_all, enabled) {
                    submit(GitProcedure.UnstageAll, emptyMap())
                }
                GitActionButton(R.string.git_revert_all, enabled) {
                    submit(GitProcedure.RevertAll, emptyMap())
                }
            }
        }
        item {
            GitFormSection(stringResource(R.string.git_commit_section)) {
                OutlinedTextField(
                    commitMessage,
                    { commitMessage = it },
                    label = { Text(stringResource(R.string.git_commit_message)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        submit(
                            GitProcedure.Commit,
                            mapOf("message" to JsonPrimitive(commitMessage.trim())),
                        )
                    },
                    enabled = enabled && commitMessage.isNotBlank(),
                ) { Text(stringResource(R.string.git_commit)) }
            }
        }
        item {
            GitFormSection(stringResource(R.string.git_branch_section)) {
                OutlinedTextField(
                    branch,
                    { branch = it },
                    label = { Text(stringResource(R.string.git_branch_name)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            submit(
                                GitProcedure.SwitchBranch,
                                mapOf("branch" to JsonPrimitive(branch.trim())),
                            )
                        },
                        enabled = enabled && branch.isNotBlank(),
                    ) { Text(stringResource(R.string.git_switch_branch)) }
                    OutlinedButton(
                        onClick = {
                            submit(
                                GitProcedure.SwitchBranch,
                                mapOf(
                                    "branch" to JsonPrimitive(branch.trim()),
                                    "createNew" to JsonPrimitive(true),
                                ),
                            )
                        },
                        enabled = enabled && branch.isNotBlank(),
                    ) { Text(stringResource(R.string.git_create_branch)) }
                    OutlinedButton(
                        onClick = {
                            submit(
                                GitProcedure.DeleteBranch,
                                mapOf("branch" to JsonPrimitive(branch.trim())),
                            )
                        },
                        enabled = enabled && branch.isNotBlank(),
                    ) { Text(stringResource(R.string.git_delete_branch)) }
                }
            }
        }
        item {
            GitFormSection(stringResource(R.string.git_remote_section)) {
                OutlinedTextField(
                    remoteName,
                    { remoteName = it },
                    label = { Text(stringResource(R.string.git_remote_name)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    remoteUrl,
                    { remoteUrl = it },
                    label = { Text(stringResource(R.string.git_remote_url)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        submit(
                            GitProcedure.AddRemote,
                            mapOf(
                                "remote" to JsonPrimitive(remoteName.trim()),
                                "url" to JsonPrimitive(remoteUrl.trim()),
                            ),
                        )
                    },
                    enabled = enabled && remoteName.isNotBlank() && remoteUrl.isNotBlank(),
                ) { Text(stringResource(R.string.git_add_remote)) }
            }
        }
        item {
            GitFormSection(stringResource(R.string.git_worktree_section)) {
                OutlinedTextField(
                    worktreePath,
                    { worktreePath = it },
                    label = { Text(stringResource(R.string.git_worktree_path)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    sourceBranch,
                    { sourceBranch = it },
                    label = { Text(stringResource(R.string.git_source_branch)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GitActionButton(R.string.git_add_worktree, enabled && worktreePath.isNotBlank()) {
                        submit(
                            GitProcedure.AddWorktree,
                            buildMap {
                                put("path", JsonPrimitive(worktreePath.trim()))
                                if (branch.isNotBlank()) put("branch", JsonPrimitive(branch.trim()))
                            },
                        )
                    }
                    GitActionButton(
                        R.string.git_remove_worktree,
                        enabled && worktreePath.isNotBlank(),
                    ) {
                        submit(
                            GitProcedure.RemoveWorktree,
                            mapOf("path" to JsonPrimitive(worktreePath.trim())),
                        )
                    }
                    GitActionButton(R.string.git_prune_worktrees, enabled) {
                        submit(
                            GitProcedure.PruneWorktrees,
                            mapOf("activeWorktreePaths" to kotlinx.serialization.json.JsonArray(emptyList())),
                        )
                    }
                }
                if (sourceBranch.isNotBlank()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            submit(
                                GitProcedure.PullFromSource,
                                mapOf("sourceBranch" to JsonPrimitive(sourceBranch.trim())),
                            )
                        }, enabled = enabled) { Text(stringResource(R.string.git_pull_from_source)) }
                        OutlinedButton(
                            onClick = {
                                submit(
                                    GitProcedure.MergeToSource,
                                    mapOf(
                                        "worktreeLocation" to RemoteJson.encodeToJsonElement(
                                            ProjectLocation.serializer(),
                                            location,
                                        ),
                                        "worktreeBranch" to JsonPrimitive(branch.trim()),
                                        "sourceBranch" to JsonPrimitive(sourceBranch.trim()),
                                    ),
                                )
                            },
                            enabled = enabled && branch.isNotBlank(),
                        ) { Text(stringResource(R.string.git_merge_to_source)) }
                    }
                }
                if (status.mergeInProgress == true) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GitActionButton(R.string.git_abort_merge, enabled) {
                            submit(GitProcedure.AbortMerge, emptyMap())
                        }
                        GitActionButton(R.string.git_finish_merge, enabled) {
                            submit(GitProcedure.FinishMerge, emptyMap())
                        }
                    }
                }
            }
        }
        if (!status.isRepo) {
            item {
                Button(
                    onClick = { submit(GitProcedure.Init, emptyMap()) },
                    enabled = enabled,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.git_init)) }
            }
        }
        item {
            TextButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.git_actions_close))
            }
        }
    }
}

@Composable
private fun GitFormSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        content()
        HorizontalDivider()
    }
}

@Composable
private fun ActionSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { content() }
        HorizontalDivider()
    }
}

@Composable
private fun GitActionButton(label: Int, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled) { Text(stringResource(label)) }
}
