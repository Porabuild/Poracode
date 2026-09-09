package com.poracode.app.ui.richchat

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.ui.components.rememberCameraCapture

data class PickedAttachmentUpload(
    val name: String,
    val mimeType: String,
    val body: AttachmentUploadBody,
)

@Composable
fun RichChatComposer(
    contextKey: String,
    contextUsage: RichContextUsage?,
    draft: String,
    attachments: List<UploadedAttachment>,
    sending: Boolean,
    uploading: Boolean,
    enabled: Boolean,
    errorText: String?,
    configuration: ThreadConfig,
    agentStatus: AgentStatusEntry?,
    canConfigure: Boolean,
    threadSlashCommands: List<com.poracode.app.model.RemoteSlashCommand>? = null,
    currentThread: RemoteThread? = null,
    mentionItems: List<RichRuntimeItem> = emptyList(),
    workspaceFiles: List<ProjectFileEntry> = emptyList(),
    mentionThreads: List<RemoteThread> = emptyList(),
    isTurnActive: Boolean = false,
    queuedSegments: List<RichPromptSegment> = emptyList(),
    onDraftChange: (String) -> Unit,
    onConfigurationChange: (ThreadConfig) -> Unit,
    onQueueSegment: (RichPromptSegment) -> Unit = {},
    onRemoveSegment: (RichPromptSegment) -> Unit = {},
    onAttachmentUri: (Uri) -> Unit,
    onRemoveAttachment: (UploadedAttachment) -> Unit,
    onCameraUnavailable: () -> Unit = {},
    onSend: () -> Unit,
    onInterrupt: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showControls by rememberSaveable(contextKey) { mutableStateOf(false) }
    val controlsEnabled = canConfigure && !sending
    val catalog = remember(agentStatus, configuration, threadSlashCommands) {
        agentStatus?.let {
            RichChatComposerControlCatalog(it, configuration, threadSlashCommands)
        }
    }
    LaunchedEffect(controlsEnabled) {
        if (!controlsEnabled) showControls = false
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
        it?.let(onAttachmentUri)
    }
    // Camera capture feeds the exact same attachment path as a picked file: the resulting
    // content:// URI goes through onAttachmentUri -> uploadAttachment, no second upload path.
    val captureFromCamera = rememberCameraCapture(
        onCaptured = onAttachmentUri,
        onUnavailable = onCameraUnavailable,
    )
    val inputDescription = stringResource(R.string.rich_chat_message)
    val mcpLabels = mapOf(
        "app-controls" to stringResource(R.string.rich_chat_app_controls),
        "browser" to stringResource(R.string.rich_chat_browser_mcp),
        "crossagents" to stringResource(R.string.rich_chat_crossagent_mcp),
        "chrome" to stringResource(R.string.rich_chat_chrome_mcp),
        "computer-use" to stringResource(R.string.rich_chat_computer_use),
    )
    val slashSuggestions = catalog?.slashSuggestions(draft).orEmpty().take(MAX_SUGGESTIONS)
    val mentionSuggestions = remember(
        draft,
        mentionItems,
        currentThread,
        workspaceFiles,
        mentionThreads,
        mcpLabels,
    ) {
        RichChatMentionCatalog.suggestions(
            draft = draft,
            items = mentionItems,
            currentThread = currentThread,
            mcpLabels = mcpLabels,
            workspaceFiles = workspaceFiles,
            mentionThreads = mentionThreads,
        )
    }
    val hasPrompt = draft.isNotBlank() || queuedSegments.isNotEmpty()
    Surface(modifier = modifier.fillMaxWidth(), tonalElevation = 3.dp) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            RuntimeContextUsageDock(contextKey, contextUsage) {
                catalog?.let { controlCatalog ->
                    val summary = buildList {
                        add(controlCatalog.modelLabel(configuration.model))
                        configuration.effort?.let {
                            add(controlCatalog.effortLabel(configuration.model, it))
                        }
                    }.joinToString(" · ")
                    val controlsDescription = stringResource(
                        R.string.rich_chat_composer_controls_summary,
                        summary,
                    )
                    AssistChip(
                        onClick = { showControls = true },
                        enabled = controlsEnabled,
                        label = { Text(summary, maxLines = 1) },
                        leadingIcon = {
                            Icon(Icons.Outlined.Tune, contentDescription = null)
                        },
                        modifier = Modifier
                            .testTag("rich_chat_composer_controls")
                            .semantics { contentDescription = controlsDescription },
                    )
                }
            }
            if (slashSuggestions.isNotEmpty()) {
                RichChatSlashSuggestions(
                    options = slashSuggestions,
                    onSelect = { option ->
                        option.toPromptSegment()?.let(onQueueSegment)
                        onDraftChange(if (option.skill == null) "/${option.displayId} " else "")
                    },
                )
            } else if (mentionSuggestions.isNotEmpty()) {
                RichChatSuggestionList(
                    options = mentionSuggestions,
                    onSelect = { option ->
                        option.mcpConfigKey?.let {
                            onConfigurationChange(RichChatMentionCatalog.enableMcp(it, configuration))
                        }
                        if (queuedSegments.none { it == option.segment }) onQueueSegment(option.segment)
                        onDraftChange(RichChatMentionCatalog.consumeTrailingMention(draft))
                    },
                )
            }
            if (attachments.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    attachments.forEach { attachment ->
                        InputChip(
                            selected = true,
                            onClick = { onRemoveAttachment(attachment) },
                            label = { Text(attachment.name) },
                            trailingIcon = {
                                Icon(
                                    Icons.Filled.Close,
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
            if (queuedSegments.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    queuedSegments.forEach { segment ->
                        RichChatMentionCatalog.segmentLabel(segment)?.let { label ->
                            InputChip(
                                selected = true,
                                onClick = { onRemoveSegment(segment) },
                                label = { Text(label, maxLines = 1) },
                                trailingIcon = {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = stringResource(
                                            R.string.rich_chat_remove_context,
                                            label,
                                        ),
                                    )
                                },
                            )
                        }
                    }
                }
            }
            errorText?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(verticalAlignment = Alignment.Bottom) {
                IconButton(
                    onClick = { launcher.launch(arrayOf("*/*")) },
                    enabled = enabled && !sending && !uploading,
                ) {
                    if (uploading) {
                        CircularProgressIndicator()
                    } else {
                        Icon(
                            Icons.Filled.AttachFile,
                            contentDescription = stringResource(R.string.rich_chat_add_attachment),
                        )
                    }
                }
                IconButton(
                    onClick = captureFromCamera,
                    enabled = enabled && !sending && !uploading,
                ) {
                    Icon(
                        Icons.Filled.PhotoCamera,
                        contentDescription = stringResource(R.string.home_quick_compose_camera_capture),
                    )
                }
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 52.dp)
                        .testTag("rich_chat_message")
                        .semantics { contentDescription = inputDescription },
                    placeholder = { Text(stringResource(R.string.rich_chat_message)) },
                    maxLines = 6,
                    enabled = enabled,
                )
                if (sending || (isTurnActive && !hasPrompt)) {
                    IconButton(
                        onClick = onInterrupt,
                        enabled = enabled,
                        modifier = Modifier.testTag("rich_chat_stop_generation"),
                    ) {
                        Icon(
                            Icons.Filled.Stop,
                            contentDescription = stringResource(R.string.rich_chat_stop_generation),
                        )
                    }
                } else {
                    FilledIconButton(
                        onClick = onSend,
                        enabled = enabled && hasPrompt && !uploading,
                        modifier = Modifier.testTag("rich_chat_send_message"),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(
                                if (isTurnActive) R.string.rich_chat_send_steer
                                else R.string.rich_chat_send_message,
                            ),
                        )
                    }
                }
            }
        }
    }
    if (showControls && catalog != null) {
        RichChatComposerControlsSheet(
            configuration = configuration,
            catalog = catalog,
            enabled = controlsEnabled,
            onDismiss = { showControls = false },
            onSave = {
                onConfigurationChange(it)
                showControls = false
            },
        )
    }
}

private const val MAX_SUGGESTIONS = 6
