package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.poracode.app.R

/** One native add menu with a session-actions drill-in and unchanged media callbacks. */
@Composable
internal fun RichChatComposerAddMenu(
    enabled: Boolean,
    uploading: Boolean,
    entries: List<RichChatSessionActionEntryTarget>,
    actionsEnabled: Boolean,
    inventoryFailure: String?,
    inventoryRefreshing: Boolean,
    onAttach: () -> Unit,
    onCamera: () -> Unit,
    onOpenAction: (RichChatSessionActionPanelKind) -> Unit,
    onRetry: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var sessionActions by remember { mutableStateOf(false) }
    fun dismiss() {
        expanded = false
        sessionActions = false
    }
    Box {
        IconButton(onClick = { expanded = true }, enabled = enabled && !uploading) {
            if (uploading) CircularProgressIndicator() else Icon(
                Icons.Filled.Add,
                contentDescription = stringResource(R.string.rich_chat_add_attachment),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = ::dismiss) {
            if (sessionActions) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.back)) },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) },
                    onClick = { sessionActions = false },
                )
                entries.forEach { entry ->
                    DropdownMenuItem(
                        text = { Text(richChatSessionPanelLabel(entry.panel)) },
                        enabled = enabled && actionsEnabled,
                        onClick = { dismiss(); onOpenAction(entry.panel) },
                    )
                }
                if (inventoryFailure != null) {
                    DropdownMenuItem(text = { Text(inventoryFailure) }, enabled = false, onClick = {})
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.rich_chat_retry)) },
                        enabled = enabled && !inventoryRefreshing,
                        onClick = { onRetry() },
                    )
                }
            } else {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.rich_chat_add_attachment)) },
                    leadingIcon = { Icon(Icons.Filled.AttachFile, contentDescription = null) },
                    enabled = enabled && !uploading,
                    onClick = { dismiss(); onAttach() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.home_quick_compose_camera_capture)) },
                    leadingIcon = { Icon(Icons.Filled.PhotoCamera, contentDescription = null) },
                    enabled = enabled && !uploading,
                    onClick = { dismiss(); onCamera() },
                )
                if (entries.isNotEmpty() || inventoryFailure != null) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.rich_chat_session_actions)) },
                        enabled = enabled,
                        onClick = { sessionActions = true },
                    )
                }
            }
        }
    }
}
