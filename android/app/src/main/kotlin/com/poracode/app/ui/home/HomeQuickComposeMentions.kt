package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.projects.ProjectOperationResult
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.ui.richchat.RichChatMentionCatalog
import com.poracode.app.ui.richchat.RichChatMentionOption
import kotlinx.coroutines.delay

/**
 * Native counterpart to iOS `HomeComposerMentions`: live `@mention` autocomplete (MCPs,
 * threads, workspace files) for the Home quick-compose prompt. Reuses the same pure
 * catalog/search logic and suggestion list the full rich-chat composer already relies on
 * ([com.poracode.app.ui.richchat.RichChatMentionCatalog] /
 * [com.poracode.app.ui.richchat.RichChatSuggestionList]) rather than reimplementing it, since
 * there is no thread yet to attach a live chat composer to.
 */
@Composable
internal fun rememberHomeQuickComposeMentionSuggestions(
    prompt: String,
    projectRuntime: ProjectSessionRuntime,
    connectionId: ClientConnectionId?,
    project: RemoteProject?,
    mentionThreads: List<RemoteThread>,
): List<RichChatMentionOption> {
    val mcpLabels = mapOf(
        "app-controls" to stringResource(R.string.rich_chat_app_controls),
        "browser" to stringResource(R.string.rich_chat_browser_mcp),
        "crossagents" to stringResource(R.string.rich_chat_crossagent_mcp),
        "chrome" to stringResource(R.string.rich_chat_chrome_mcp),
        "computer-use" to stringResource(R.string.rich_chat_computer_use),
    )
    var workspaceFiles by remember { mutableStateOf(emptyList<ProjectFileEntry>()) }
    LaunchedEffect(RichChatMentionCatalog.trailingMentionQuery(prompt), project?.id, connectionId) {
        val query = RichChatMentionCatalog.trailingMentionQuery(prompt) ?: return@LaunchedEffect
        val target = project?.let { current ->
            connectionId?.let { id ->
                ProjectWorkspaceTarget(ProjectIdentity(id, current.id), current.location)
            }
        } ?: return@LaunchedEffect
        if (query.isNotEmpty()) delay(150)
        when (val result = projectRuntime.workspace.searchFiles(target, query, limit = 20)) {
            is ProjectOperationResult.Success -> workspaceFiles = result.value.entries
            else -> Unit
        }
    }
    return remember(prompt, workspaceFiles, mentionThreads, mcpLabels) {
        RichChatMentionCatalog.suggestions(
            draft = prompt,
            items = emptyList(),
            currentThread = null,
            mcpLabels = mcpLabels,
            workspaceFiles = workspaceFiles,
            mentionThreads = mentionThreads,
        )
    }
}

@Composable
internal fun HomeQuickComposeMentionChips(
    segments: List<RichPromptSegment>,
    onRemove: (RichPromptSegment) -> Unit,
) {
    if (segments.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        segments.forEach { segment ->
            RichChatMentionCatalog.segmentLabel(segment)?.let { label ->
                InputChip(
                    selected = true,
                    onClick = { onRemove(segment) },
                    label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    trailingIcon = {
                        Icon(
                            Icons.Outlined.Close,
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
