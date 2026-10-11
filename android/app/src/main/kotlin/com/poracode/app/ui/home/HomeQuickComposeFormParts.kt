package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.ui.richchat.UploadedAttachment
import com.poracode.app.ui.richchat.AttachmentUiError

@Composable
internal fun HomeQuickComposeHeader(onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.home_new_thread),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        IconButton(onClick = onDismiss) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.cancel_pair_button),
            )
        }
    }
}

@Composable
internal fun HomeQuickComposeTargetSelectors(
    project: RemoteProject,
    projects: List<RemoteProject>,
    agents: List<AgentStatusEntry>,
    selectedAgent: AgentStatusEntry?,
    defaultAgentKind: String,
    availableModes: List<ThreadPresentationMode>,
    selectedMode: ThreadPresentationMode,
    onProjectSelected: (String) -> Unit,
    onAgentSelected: (String) -> Unit,
    onModeSelected: (String) -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        HomeQuickComposeCompactMenu(
            label = stringResource(R.string.home_project),
            value = project.name,
            options = projects.map { HomeQuickComposeOption(it.id, it.name) },
            leadingIcon = Icons.Outlined.FolderOpen,
            selection = project.id,
            onSelect = onProjectSelected,
        )
        if (agents.isNotEmpty()) {
            HomeQuickComposeCompactMenu(
                label = stringResource(R.string.home_quick_compose_agent),
                value = selectedAgent?.let { it.label.ifBlank { it.kind } } ?: defaultAgentKind,
                options = agents.map {
                    HomeQuickComposeOption(it.kind, it.label.ifBlank { it.kind })
                },
                selection = selectedAgent?.kind.orEmpty(),
                onSelect = onAgentSelected,
            )
        } else {
            Text(
                stringResource(R.string.home_agent_value, defaultAgentKind),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            )
        }
        if (availableModes.size > 1) {
            HomeQuickComposeCompactMenu(
                label = stringResource(R.string.home_quick_compose_presentation),
                value = when (selectedMode) {
                    ThreadPresentationMode.Terminal ->
                        stringResource(R.string.home_quick_compose_terminal)
                    ThreadPresentationMode.Gui -> stringResource(R.string.home_quick_compose_chat)
                },
                options = homeQuickComposePresentationOptions(availableModes),
                selection = selectedMode.wireValue,
                onSelect = onModeSelected,
            )
        }
    }
}

@Composable
private fun HomeQuickComposeCompactMenu(
    label: String,
    value: String,
    options: List<HomeQuickComposeOption>,
    selection: String,
    onSelect: (String) -> Unit,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    if (options.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { expanded = true },
            label = {
                Text(value, maxLines = 1, overflow = TextOverflow.Ellipsis)
            },
            leadingIcon = leadingIcon?.let { icon ->
                { Icon(icon, contentDescription = null) }
            },
            trailingIcon = {
                Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
            },
            modifier = Modifier.semantics {
                contentDescription = "$label: $value"
            },
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    modifier = Modifier.semantics { selected = option.id == selection },
                    leadingIcon = if (option.id == selection) {
                        { Icon(Icons.Outlined.Check, contentDescription = null) }
                    } else {
                        null
                    },
                    onClick = {
                        onSelect(option.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
internal fun HomeQuickComposeAttachmentChips(
    attachments: List<UploadedAttachment>,
    onRemove: (UploadedAttachment) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        attachments.forEach { attachment ->
            InputChip(
                selected = true,
                onClick = { onRemove(attachment) },
                label = {
                    Text(attachment.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                trailingIcon = {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = stringResource(
                            R.string.rich_chat_remove_attachment,
                            attachment.name,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
internal fun HomeQuickComposeErrors(failed: Boolean, attachmentError: AttachmentUiError?) {
    if (failed) {
        Text(
            stringResource(R.string.home_new_thread_failed),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
    }
    attachmentError?.let { error ->
        Text(
            stringResource(
                if (error == AttachmentUiError.Invalid) {
                    R.string.rich_chat_attachment_invalid
                } else {
                    R.string.rich_chat_attachment_upload_failed
                },
            ),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
internal fun HomeQuickComposeUnavailable(onDismiss: () -> Unit) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            stringResource(R.string.home_quick_compose_unavailable),
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        IconButton(onClick = onDismiss) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.cancel_pair_button),
            )
        }
    }
}
