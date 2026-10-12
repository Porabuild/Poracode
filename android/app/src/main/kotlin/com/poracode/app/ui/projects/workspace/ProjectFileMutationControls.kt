package com.poracode.app.ui.projects.workspace

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DriveFileMove
import androidx.compose.material.icons.automirrored.outlined.NoteAdd
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.session.projects.ProjectEntryMutation

private sealed interface MutationEditor {
    data class Create(val parent: String, val type: ProjectEntryMutation.Type) : MutationEditor
    data class Rename(val entry: ProjectFileEntry) : MutationEditor
    data class Move(val entry: ProjectFileEntry) : MutationEditor
    data class Delete(val entry: ProjectFileEntry) : MutationEditor
}

@Composable
internal fun ProjectDirectoryActions(
    directoryPath: String,
    enabled: Boolean,
    onMutation: (ProjectEntryMutation) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf<MutationEditor?>(null) }
    IconButton(onClick = { expanded = true }, enabled = enabled) {
        Icon(Icons.AutoMirrored.Outlined.NoteAdd, stringResource(R.string.workspace_create_entry))
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_create_file)) },
            leadingIcon = { Icon(Icons.AutoMirrored.Outlined.NoteAdd, contentDescription = null) },
            onClick = {
                expanded = false
                editor = MutationEditor.Create(directoryPath, ProjectEntryMutation.Type.File)
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_create_folder)) },
            leadingIcon = { Icon(Icons.Outlined.CreateNewFolder, contentDescription = null) },
            onClick = {
                expanded = false
                editor = MutationEditor.Create(directoryPath, ProjectEntryMutation.Type.Directory)
            },
        )
    }
    editor?.let { current ->
        ProjectEntryMutationDialog(current, { editor = null }) {
            editor = null
            onMutation(it)
        }
    }
}

@Composable
internal fun ProjectFileRowActions(
    entry: ProjectFileEntry,
    rootPath: String,
    enabled: Boolean,
    onMutation: (ProjectEntryMutation) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf<MutationEditor?>(null) }
    val context = LocalContext.current
    IconButton(onClick = { expanded = true }, enabled = enabled) {
        Icon(Icons.Outlined.MoreVert, stringResource(R.string.workspace_file_actions, entry.name))
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_rename)) },
            leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null) },
            onClick = { expanded = false; editor = MutationEditor.Rename(entry) },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_move)) },
            leadingIcon = { Icon(Icons.AutoMirrored.Outlined.DriveFileMove, contentDescription = null) },
            onClick = { expanded = false; editor = MutationEditor.Move(entry) },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_delete)) },
            leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
            onClick = { expanded = false; editor = MutationEditor.Delete(entry) },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_copy_relative_path)) },
            leadingIcon = { Icon(Icons.Outlined.ContentCopy, contentDescription = null) },
            onClick = {
                expanded = false
                copyToClipboard(context, entry.name, entry.path)
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.workspace_copy_absolute_path)) },
            leadingIcon = { Icon(Icons.Outlined.ContentCopy, contentDescription = null) },
            onClick = {
                expanded = false
                copyToClipboard(context, entry.name, absoluteFilePath(rootPath, entry.path))
            },
        )
    }
    editor?.let { current ->
        ProjectEntryMutationDialog(current, { editor = null }) {
            editor = null
            onMutation(it)
        }
    }
}

/** Platform clipboard, matching the read-side convention in OnboardingPairingCards.kt. */
private fun copyToClipboard(context: Context, label: String, text: String) {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    manager?.setPrimaryClip(ClipData.newPlainText(label, text))
}

@Composable
private fun ProjectEntryMutationDialog(
    editor: MutationEditor,
    onDismiss: () -> Unit,
    onConfirm: (ProjectEntryMutation) -> Unit,
) {
    var value by remember(editor) {
        mutableStateOf(
            when (editor) {
                is MutationEditor.Rename -> editor.entry.name
                else -> ""
            },
        )
    }
    val title = when (editor) {
        is MutationEditor.Create -> if (editor.type == ProjectEntryMutation.Type.File) {
            R.string.workspace_create_file
        } else {
            R.string.workspace_create_folder
        }
        is MutationEditor.Rename -> R.string.workspace_rename
        is MutationEditor.Move -> R.string.workspace_move
        is MutationEditor.Delete -> R.string.workspace_delete
    }
    val valid = when (editor) {
        is MutationEditor.Create,
        is MutationEditor.Rename,
        -> value.isNotBlank() && '/' !in value && '\\' !in value
        is MutationEditor.Move -> true
        is MutationEditor.Delete -> true
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(title)) },
        text = {
            if (editor is MutationEditor.Delete) {
                Text(
                    stringResource(
                        if (editor.entry.type == com.poracode.app.model.ProjectFileEntryType.Directory) {
                            R.string.workspace_delete_folder_message
                        } else {
                            R.string.workspace_delete_message
                        },
                        editor.entry.path,
                    ),
                )
            } else {
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = {
                        Text(
                            stringResource(
                                if (editor is MutationEditor.Move) {
                                    R.string.workspace_parent_folder
                                } else {
                                    R.string.workspace_entry_name
                                },
                            ),
                        )
                    },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onConfirm(
                        when (editor) {
                            is MutationEditor.Create -> ProjectEntryMutation.Create(
                                projectChildPath(editor.parent, value.trim()), editor.type,
                            )
                            is MutationEditor.Rename ->
                                ProjectEntryMutation.Rename(editor.entry.path, value.trim())
                            is MutationEditor.Move -> ProjectEntryMutation.Move(
                                editor.entry.path, value.trim().ifEmpty { null },
                            )
                            is MutationEditor.Delete ->
                                ProjectEntryMutation.Delete(editor.entry.path)
                        },
                    )
                },
            ) { Text(stringResource(R.string.workspace_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.projects_cancel)) }
        },
    )
}

internal fun projectChildPath(parent: String, name: String): String =
    if (parent.isBlank()) name else "${parent.trimEnd('/', '\\')}/$name"
