package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry

@Composable
internal fun HomeQuickComposeLaunchBar(
    agent: AgentStatusEntry?,
    defaultAgentKind: String,
    model: String,
    canOperate: Boolean,
    busy: Boolean,
    uploading: Boolean,
    canStart: Boolean,
    onCaptureFromCamera: () -> Unit,
    onPickAttachment: () -> Unit,
    onStart: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Text(
            stringResource(
                R.string.home_agent_value,
                agent?.label?.ifBlank { agent?.kind.orEmpty() } ?: defaultAgentKind,
            ),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Text("·", color = MaterialTheme.colorScheme.outline)
        Text(
            stringResource(R.string.home_model_value, model),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        FilledTonalIconButton(
            enabled = !busy && !uploading && canOperate,
            onClick = onCaptureFromCamera,
        ) {
            Icon(
                Icons.Outlined.PhotoCamera,
                contentDescription = stringResource(
                    R.string.home_quick_compose_camera_capture,
                ),
            )
        }
        FilledTonalIconButton(
            enabled = !busy && !uploading && canOperate,
            onClick = onPickAttachment,
        ) {
            if (uploading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            } else {
                Icon(
                    Icons.Outlined.AttachFile,
                    contentDescription = stringResource(
                        R.string.rich_chat_add_attachment,
                    ),
                )
            }
        }
        FilledIconButton(
            enabled = canStart,
            modifier = Modifier.testTag("home_new_thread_start"),
            onClick = onStart,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Icon(
                    Icons.Outlined.ArrowUpward,
                    contentDescription = stringResource(R.string.home_start),
                )
            }
        }
    }
}
