package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteProject
import com.poracode.app.ui.components.PoracodeChip
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.components.ProviderInitialTile
import com.poracode.app.ui.richchat.ComposerModelControl
import com.poracode.app.ui.richchat.RichChatMentionOption
import com.poracode.app.ui.richchat.RichChatSlashCommandOption
import com.poracode.app.ui.richchat.RichChatSlashSuggestions
import com.poracode.app.ui.richchat.RichChatSuggestionList
import com.poracode.app.ui.richchat.UploadedAttachment
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * First row: project/provider chips plus the close button. Presentation
 * (Chat/Terminal) lives in Launch settings with the other launch options, as
 * on desktop, instead of a dedicated top chip.
 */
@Composable
internal fun HomeQuickComposeChipRow(
    project: RemoteProject,
    projects: List<RemoteProject>,
    agents: List<AgentStatusEntry>,
    selectedAgent: AgentStatusEntry?,
    defaultAgentKind: String,
    onProjectSelected: (String) -> Unit,
    onAgentSelected: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val agentLabel = selectedAgent?.let { it.label.ifBlank { it.kind } }
        ?: defaultAgentKind
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlowRow(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            HomeQuickComposeChipMenu(
                label = stringResource(R.string.home_project),
                value = project.name,
                options = projects.map { HomeQuickComposeOption(it.id, it.name) },
                selection = project.id,
                onSelect = onProjectSelected,
                leading = {
                    Icon(
                        PoracodeIcons.FolderOpen,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = PoracodeTheme.colors.muted,
                    )
                },
            )
            if (agents.isNotEmpty() || defaultAgentKind.isNotBlank()) {
                HomeQuickComposeChipMenu(
                    label = stringResource(R.string.home_quick_compose_agent),
                    value = agentLabel,
                    options = agents.map {
                        HomeQuickComposeOption(it.kind, it.label.ifBlank { it.kind })
                    },
                    selection = selectedAgent?.kind.orEmpty(),
                    onSelect = onAgentSelected,
                    enabled = agents.isNotEmpty(),
                    leading = { ProviderInitialTile(agentLabel) },
                )
            }
        }
        PoracodeIconButton(
            icon = PoracodeIcons.Close,
            contentDescription = stringResource(R.string.cancel_pair_button),
            onClick = onDismiss,
            tint = PoracodeTheme.colors.muted,
            iconSize = 16.dp,
        )
    }
}

@Composable
private fun HomeQuickComposeChipMenu(
    label: String,
    value: String,
    options: List<HomeQuickComposeOption>,
    selection: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
) {
    if (options.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        PoracodeChip(
            label = value,
            onClick = { expanded = true },
            enabled = enabled,
            leading = leading,
            contentDescription = "$label: $value",
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
                        { Icon(PoracodeIcons.Check, contentDescription = null) }
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

/**
 * The composer card: flat prompt field, suggestion lists, queued chips, and
 * the bottom toolbar (model control, add menu, send).
 */
@Composable
internal fun HomeQuickComposeInputCard(
    inputValue: TextFieldValue,
    onPromptEdit: (TextFieldValue) -> Unit,
    focusRequester: FocusRequester,
    skillSuggestions: List<RichChatSlashCommandOption>,
    onSkillSelect: (RichChatSlashCommandOption) -> Unit,
    mentionSuggestions: List<RichChatMentionOption>,
    onMentionSelect: (RichChatMentionOption) -> Unit,
    queuedMentionSegments: List<RichPromptSegment>,
    onRemoveMentionSegment: (RichPromptSegment) -> Unit,
    attachments: List<UploadedAttachment>,
    onRemoveAttachment: (UploadedAttachment) -> Unit,
    selectedSkill: RichPromptSegment.Skill?,
    modelSummary: String,
    providerLabel: String,
    controlsEnabled: Boolean,
    onOpenControls: () -> Unit,
    canOperate: Boolean,
    busy: Boolean,
    uploading: Boolean,
    canStart: Boolean,
    onOpenAddMenu: () -> Unit,
    onStart: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val cardShape = RoundedCornerShape(16.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(colors.composerSurface)
            .border(1.dp, colors.hairlineStrong, cardShape)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        RichChatSlashSuggestions(skillSuggestions, onSelect = onSkillSelect)
        if (mentionSuggestions.isNotEmpty()) {
            RichChatSuggestionList(
                options = mentionSuggestions,
                onSelect = onMentionSelect,
            )
        }
        BasicTextField(
            value = inputValue,
            onValueChange = onPromptEdit,
            maxLines = 7,
            minLines = 2,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.foreground),
            cursorBrush = SolidColor(colors.foreground),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester)
                .testTag("home_new_thread_prompt"),
            decorationBox = { inner ->
                Box(
                    Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
                    contentAlignment = Alignment.TopStart,
                ) {
                    if (inputValue.text.isEmpty()) {
                        Text(
                            stringResource(R.string.home_quick_compose_prompt),
                            style = MaterialTheme.typography.bodyLarge,
                            color = colors.fieldPlaceholder,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
        if (queuedMentionSegments.isNotEmpty()) {
            HomeQuickComposeMentionChips(queuedMentionSegments, onRemoveMentionSegment)
        }
        if (attachments.isNotEmpty()) {
            HomeQuickComposeAttachmentChips(attachments, onRemoveAttachment)
        }
        selectedSkill?.let { skill ->
            Text(
                skill.invocation,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ComposerModelControl(
                summary = modelSummary,
                providerLabel = providerLabel,
                enabled = controlsEnabled,
                onClick = onOpenControls,
            )
            Spacer(Modifier.weight(1f))
            IconButton(
                onClick = onOpenAddMenu,
                enabled = canOperate && !busy && !uploading,
                modifier = Modifier.size(36.dp),
                colors = IconButtonDefaults.iconButtonColors(
                    containerColor = colors.default,
                    contentColor = colors.foreground,
                    disabledContainerColor = colors.default.copy(alpha = 0.5f),
                    disabledContentColor = colors.muted.copy(alpha = 0.5f),
                ),
            ) {
                if (uploading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 1.5.dp,
                        color = colors.muted,
                    )
                } else {
                    Icon(
                        PoracodeIcons.Add,
                        contentDescription = stringResource(R.string.rich_chat_add_attachment),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            val canSend = canStart && !busy && !uploading
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (canSend) colors.accentSoft else colors.default.copy(alpha = 0.6f))
                    .clickable(enabled = canSend, role = Role.Button, onClick = onStart)
                    .testTag("home_new_thread_start"),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = colors.muted,
                    )
                } else {
                    Icon(
                        PoracodeIcons.ArrowUpward,
                        contentDescription = stringResource(R.string.home_start),
                        tint = if (canSend) colors.foreground else colors.muted.copy(alpha = 0.6f),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

/** Under-card row: the project-branch chip plus the slash-commands chip. */
@Composable
internal fun HomeQuickComposeBranchRow(
    worktreeBranch: String?,
    showCommands: Boolean,
    onPickWorktree: () -> Unit,
    onOpenCommands: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PoracodeChip(
            label = worktreeBranch?.let { stringResource(R.string.workspace_branch, it) }
                ?: stringResource(R.string.home_quick_compose_current_branch),
            onClick = onPickWorktree,
            modifier = Modifier.weight(1f, fill = false),
            leading = {
                Icon(
                    PoracodeIcons.AccountTree,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = PoracodeTheme.colors.muted,
                )
            },
        )
        if (showCommands) {
            PoracodeChip(
                label = stringResource(R.string.home_quick_compose_commands),
                onClick = onOpenCommands,
            )
        }
    }
}

/** "Add to composer" sheet with the existing attach and camera actions. */
@Composable
internal fun HomeQuickComposeAddSheet(
    showing: Boolean,
    canOperate: Boolean,
    uploading: Boolean,
    onDismiss: () -> Unit,
    onAttach: () -> Unit,
    onCamera: () -> Unit,
) {
    if (!showing) return
    val enabled = canOperate && !uploading
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.rich_chat_add_to_composer),
    ) {
        PoracodeSheetAction(
            label = stringResource(R.string.rich_chat_file),
            icon = PoracodeIcons.AttachFile,
            enabled = enabled,
            onClick = onAttach,
            trailing = {
                Text(
                    stringResource(R.string.rich_chat_attach),
                    style = MaterialTheme.typography.labelMedium,
                    color = PoracodeTheme.colors.muted,
                )
            },
        )
        PoracodeSheetAction(
            label = stringResource(R.string.home_quick_compose_camera_capture),
            icon = PoracodeIcons.PhotoCamera,
            enabled = enabled,
            onClick = onCamera,
        )
    }
}
