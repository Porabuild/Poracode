package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import androidx.compose.material3.CircularProgressIndicator
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
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme

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
    onOpenControls: (RichChatComposerControlsFocus) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var sessionActions by remember { mutableStateOf(false) }
    fun dismiss() {
        expanded = false
        sessionActions = false
    }
    Box {
        val colors = PoracodeTheme.colors
        IconButton(
            onClick = { expanded = true },
            enabled = enabled && !uploading,
            modifier = androidx.compose.ui.Modifier.size(36.dp),
            colors = androidx.compose.material3.IconButtonDefaults.iconButtonColors(
                containerColor = colors.default,
                contentColor = colors.foreground,
                disabledContainerColor = colors.default.copy(alpha = 0.5f),
                disabledContentColor = colors.muted.copy(alpha = 0.5f),
            ),
        ) {
            if (uploading) {
                CircularProgressIndicator(
                    modifier = androidx.compose.ui.Modifier.size(16.dp),
                    strokeWidth = 1.5.dp,
                    color = colors.muted,
                )
            } else {
                Icon(
                    PoracodeIcons.Add,
                    contentDescription = stringResource(R.string.rich_chat_add_attachment),
                    modifier = androidx.compose.ui.Modifier.size(18.dp),
                )
            }
        }
        if (expanded) {
            PoracodeSheet(
                onDismissRequest = ::dismiss,
                title = stringResource(R.string.rich_chat_add_to_composer),
            ) {
                if (sessionActions) {
                    PoracodeSheetAction(
                        label = stringResource(R.string.back),
                        icon = PoracodeIcons.ArrowBack,
                        onClick = { sessionActions = false },
                    )
                    entries.forEach { entry ->
                        PoracodeSheetAction(
                            label = richChatSessionPanelLabel(entry.panel),
                            enabled = enabled && actionsEnabled,
                            onClick = { dismiss(); onOpenAction(entry.panel) },
                        )
                    }
                    if (inventoryFailure != null) {
                        PoracodeSheetAction(
                            label = inventoryFailure,
                            enabled = false,
                            onClick = {},
                        )
                        PoracodeSheetAction(
                            label = stringResource(R.string.rich_chat_retry),
                            enabled = enabled && !inventoryRefreshing,
                            onClick = { onRetry() },
                        )
                    }
                } else {
                    PoracodeSheetAction(
                        label = stringResource(R.string.rich_chat_file),
                        icon = PoracodeIcons.AttachFile,
                        enabled = enabled && !uploading,
                        trailing = {
                            Text(
                                stringResource(R.string.rich_chat_attach),
                                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                                color = colors.muted,
                            )
                        },
                        onClick = { dismiss(); onAttach() },
                    )
                    PoracodeSheetAction(
                        label = stringResource(R.string.home_quick_compose_camera_capture),
                        icon = PoracodeIcons.PhotoCamera,
                        enabled = enabled && !uploading,
                        onClick = { dismiss(); onCamera() },
                    )
                    PoracodeSheetAction(
                        label = stringResource(R.string.rich_chat_plan),
                        icon = PoracodeIcons.Checklist,
                        enabled = enabled,
                        trailing = { AddMenuChevron() },
                        onClick = {
                            dismiss()
                            onOpenControls(RichChatComposerControlsFocus.MODE)
                        },
                    )
                    PoracodeSheetAction(
                        label = stringResource(R.string.rich_chat_plugins),
                        icon = PoracodeIcons.Extension,
                        enabled = enabled,
                        trailing = { AddMenuChevron() },
                        onClick = {
                            dismiss()
                            onOpenControls(RichChatComposerControlsFocus.PLUGINS)
                        },
                    )
                    PoracodeSheetAction(
                        label = stringResource(R.string.rich_chat_mcp_servers),
                        icon = PoracodeIcons.Dns,
                        enabled = enabled,
                        trailing = { AddMenuChevron() },
                        onClick = {
                            dismiss()
                            onOpenControls(RichChatComposerControlsFocus.MCP_SERVERS)
                        },
                    )
                    if (entries.isNotEmpty() || inventoryFailure != null) {
                        PoracodeSheetAction(
                            label = stringResource(R.string.rich_chat_session_actions),
                            enabled = enabled,
                            trailing = { AddMenuChevron() },
                            onClick = { sessionActions = true },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AddMenuChevron() {
    Icon(
        PoracodeIcons.KeyboardArrowRight,
        contentDescription = null,
        modifier = androidx.compose.ui.Modifier.size(14.dp),
        tint = PoracodeTheme.colors.muted,
    )
}
