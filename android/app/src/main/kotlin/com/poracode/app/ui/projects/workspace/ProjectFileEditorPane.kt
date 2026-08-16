package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.LoadingStateView

@Composable
internal fun ProjectFileEditorPane(
    file: ProjectFileReadResult?,
    draft: String,
    dirty: Boolean,
    loading: Boolean,
    saving: Boolean,
    canWrite: Boolean,
    canSave: Boolean,
    canReload: Boolean,
    failure: ProjectOperationFailure?,
    saveFailed: Boolean,
    onDraftChange: (String) -> Unit,
    onSave: () -> Unit,
    onReload: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (loading) {
        LoadingStateView(stringResource(R.string.workspace_loading_file), modifier)
        return
    }
    when (file.presentation()) {
        ProjectFilePresentation.Empty -> EmptyStateView(
            stringResource(R.string.workspace_select_file_title),
            stringResource(R.string.workspace_select_file_message),
            modifier,
        )
        ProjectFilePresentation.Binary -> FileUnavailableState(
            R.string.workspace_binary_title,
            R.string.workspace_binary_message,
            modifier,
        )
        ProjectFilePresentation.TooLarge -> FileUnavailableState(
            R.string.workspace_too_large_title,
            R.string.workspace_too_large_message,
            modifier,
        )
        ProjectFilePresentation.Unsupported -> FileUnavailableState(
            R.string.workspace_unsupported_title,
            R.string.workspace_unsupported_message,
            modifier,
        )
        ProjectFilePresentation.Text -> TextFileEditor(
            requireNotNull(file),
            draft,
            dirty,
            saving,
            canWrite,
            canSave,
            canReload,
            failure,
            saveFailed,
            onDraftChange,
            onSave,
            onReload,
            modifier,
        )
    }
}

@Composable
private fun TextFileEditor(
    file: ProjectFileReadResult,
    draft: String,
    dirty: Boolean,
    saving: Boolean,
    canWrite: Boolean,
    canSave: Boolean,
    canReload: Boolean,
    failure: ProjectOperationFailure?,
    saveFailed: Boolean,
    onDraftChange: (String) -> Unit,
    onSave: () -> Unit,
    onReload: () -> Unit,
    modifier: Modifier,
) {
    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                file.path,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                when {
                    saving -> stringResource(R.string.workspace_saving)
                    dirty -> stringResource(R.string.workspace_unsaved)
                    else -> stringResource(R.string.workspace_saved)
                },
                style = MaterialTheme.typography.labelSmall,
                color = if (dirty) {
                    MaterialTheme.colorScheme.tertiary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            IconButton(onClick = onReload, enabled = canReload && !saving) {
                Icon(
                    Icons.Outlined.Refresh,
                    contentDescription = stringResource(R.string.workspace_reload),
                )
            }
            Button(onClick = onSave, enabled = canSave) {
                Icon(Icons.Outlined.Save, contentDescription = null)
                Text(
                    stringResource(R.string.workspace_save),
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
        HorizontalDivider()
        if (!canWrite) {
            Text(
                stringResource(R.string.workspace_write_denied),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        ProjectWorkspaceFailureCard(
            failure = failure,
            saving = saveFailed,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        )
        OutlinedTextField(
            value = draft,
            onValueChange = onDraftChange,
            modifier = Modifier.fillMaxSize().padding(12.dp),
            enabled = canWrite && !saving,
            label = { Text(stringResource(R.string.workspace_editor_label)) },
            textStyle = TextStyle(
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurface,
            ),
        )
    }
}

@Composable
private fun FileUnavailableState(
    title: Int,
    message: Int,
    modifier: Modifier,
) {
    EmptyStateView(stringResource(title), stringResource(message), modifier)
}
