package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectTodo
import com.poracode.app.session.projects.ProjectSessionRuntime
import java.time.Instant
import java.util.UUID

@Composable
internal fun ProjectNotesSection(
    runtime: ProjectSessionRuntime,
    identity: ProjectIdentity,
    access: ProjectUiAccess,
) {
    val state by runtime.notes.state.collectAsStateWithLifecycle()
    val entry = state.entries[identity]
    var noteText by remember(identity) { mutableStateOf("") }
    var todos by remember(identity) { mutableStateOf(emptyList<ProjectTodo>()) }
    var initializedEpoch by remember(identity) { mutableLongStateOf(-1L) }
    var newTodo by remember(identity) { mutableStateOf("") }

    LaunchedEffect(identity, access.canRead) {
        if (access.canRead) runtime.notes.load(identity)
    }
    LaunchedEffect(entry?.changeEpoch, entry?.loading) {
        val current = entry ?: return@LaunchedEffect
        if (!current.loading && current.localRevision > 0 && current.changeEpoch != initializedEpoch) {
            noteText = ProjectNoteDocument.text(current.notes?.doc)
            todos = current.notes?.todos.orEmpty()
            initializedEpoch = current.changeEpoch
        }
    }
    LaunchedEffect(entry?.failure) {
        if (entry?.failure != null) {
            noteText = ProjectNoteDocument.text(entry.notes?.doc)
            todos = entry.notes?.todos.orEmpty()
        }
    }

    fun commit(text: String = noteText, nextTodos: List<ProjectTodo> = todos) {
        noteText = text
        todos = nextTodos
        runtime.notes.edit(identity, ProjectNoteDocument.fromText(text), nextTodos)
    }

    ProjectSection(stringResource(R.string.projects_notes_and_tasks)) {
        if (!access.canRead) {
            Text(
                stringResource(R.string.projects_notes_read_denied),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@ProjectSection
        }
        if (entry == null || entry.loading || initializedEpoch < 0) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.padding(4.dp))
                Text(stringResource(R.string.projects_loading_notes))
            }
            ProjectFailureText(entry?.failure)
            return@ProjectSection
        }
        OutlinedTextField(
            value = noteText,
            onValueChange = { commit(text = it) },
            label = { Text(stringResource(R.string.projects_notes)) },
            supportingText = { Text(stringResource(R.string.projects_notes_save_hint)) },
            minLines = 4,
            enabled = access.canOperate,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(stringResource(R.string.projects_tasks), style = MaterialTheme.typography.titleSmall)
        todos.forEach { todo ->
            key(todo.id) {
                TodoEditorRow(
                    todo = todo,
                    enabled = access.canOperate,
                    onToggle = {
                        commit(nextTodos = todos.map {
                            if (it.id == todo.id) it.copy(done = !it.done) else it
                        })
                    },
                    onText = { text ->
                        commit(nextTodos = todos.map {
                            if (it.id == todo.id) it.copy(text = text) else it
                        })
                    },
                    onDelete = { commit(nextTodos = todos.filterNot { it.id == todo.id }) },
                )
            }
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = newTodo,
                onValueChange = { newTodo = it },
                label = { Text(stringResource(R.string.projects_new_task)) },
                singleLine = true,
                enabled = access.canOperate,
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = {
                    val text = newTodo.trim()
                    if (text.isNotEmpty()) {
                        commit(
                            nextTodos = todos + ProjectTodo(
                                id = UUID.randomUUID().toString(),
                                text = text,
                                done = false,
                                createdAt = Instant.now().toString(),
                            ),
                        )
                        newTodo = ""
                    }
                },
                enabled = access.canOperate && newTodo.isNotBlank(),
            ) {
                Icon(Icons.Outlined.Add, contentDescription = null)
                Text(stringResource(R.string.projects_add_task), Modifier.padding(start = 6.dp))
            }
        }
        if (!access.canOperate) {
            Text(
                stringResource(R.string.projects_notes_write_denied),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        SavingStatus(
            pending = entry.pendingSave,
            saving = entry.saving,
            failed = entry.failure != null,
        )
        ProjectFailureText(entry.failure)
    }
}

@Composable
private fun TodoEditorRow(
    todo: ProjectTodo,
    enabled: Boolean,
    onToggle: () -> Unit,
    onText: (String) -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = todo.done,
            onCheckedChange = { onToggle() },
            enabled = enabled,
            modifier = Modifier.semantics { contentDescription = todo.text },
        )
        OutlinedTextField(
            value = todo.text,
            onValueChange = onText,
            singleLine = true,
            enabled = enabled,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onDelete, enabled = enabled) {
            Icon(Icons.Outlined.Delete, stringResource(R.string.projects_delete_task))
        }
    }
}
