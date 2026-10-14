package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichContentBlock
import com.poracode.app.chat.RichContentDecoder
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectFileEntryType
import com.poracode.app.model.RemoteThread

internal data class RichChatMentionOption(
    val id: String,
    val title: String,
    val detail: String?,
    val icon: ImageVector,
    val segment: RichPromptSegment,
    val mcpConfigKey: String? = null,
)

internal object RichChatMentionCatalog {
    fun suggestions(
        draft: String,
        items: List<RichRuntimeItem>,
        currentThread: RemoteThread?,
        mcpLabels: Map<String, String>,
        workspaceFiles: List<ProjectFileEntry> = emptyList(),
        mentionThreads: List<RemoteThread> = emptyList(),
    ): List<RichChatMentionOption> {
        val query = trailingMentionQuery(draft) ?: return emptyList()
        val normalized = query.lowercase()
        val options = buildList {
            mcpOptions(mcpLabels).forEach(::add)
            mentionThreads
                .asSequence()
                .filter { it.id != currentThread?.id && !it.isArchived }
                .sortedWith(
                    compareBy<RemoteThread> { it.projectId != currentThread?.projectId }
                        .thenByDescending { it.updatedAt },
                )
                .map(::threadOption)
                .forEach(::add)
            workspaceFiles.map(::fileOption).forEach(::add)
            items.flatMapTo(this) { it.mentionOptions() }
        }
        return options
            .distinctBy { it.id }
            .filter { option ->
                normalized.isEmpty() || listOf(option.title, option.detail.orEmpty(), option.id)
                    .any { it.lowercase().contains(normalized) }
            }
            .take(MAX_SUGGESTIONS)
    }

    fun trailingMentionQuery(draft: String): String? {
        val start = draft.indexOfLast { it.isWhitespace() } + 1
        if (start >= draft.length || draft[start] != '@') return null
        val query = draft.substring(start + 1)
        if (query.any { it.isWhitespace() || it == '@' }) return null
        return query
    }

    fun consumeTrailingMention(draft: String): String {
        val start = draft.indexOfLast { it.isWhitespace() } + 1
        return if (start < draft.length && draft[start] == '@') draft.take(start) else draft
    }

    fun enableMcp(configKey: String, configuration: com.poracode.app.model.ThreadConfig) =
        when (configKey) {
            "browser" -> configuration.copy(browserMcp = true)
            "crossagents" -> configuration.copy(crossagentMcp = true)
            "chrome" -> configuration.copy(chromeMcp = true)
            "computer-use" -> configuration.copy(computerUse = true)
            else -> configuration
        }

    fun segmentLabel(segment: RichPromptSegment): String? = when (segment) {
        is RichPromptSegment.File -> "@${segment.path}"
        is RichPromptSegment.Skill -> segment.invocation
        is RichPromptSegment.Mcp -> "@${segment.name.ifBlank { segment.id }}"
        is RichPromptSegment.Thread -> "@${segment.title.ifBlank { segment.threadId }}"
        is RichPromptSegment.DiffComment -> "${segment.path}:${segment.lineNumber}"
        is RichPromptSegment.Text -> segment.content.takeIf(String::isNotBlank)
        is RichPromptSegment.Attachment -> "${segment.path}"
    }

    private fun mcpOptions(labels: Map<String, String>): List<RichChatMentionOption> = listOf(
        // Custom MCP definitions are intentionally not synthesized here. Their
        // authoritative settings live behind the settings-integrations/project
        // routes, while a rich-chat send currently carries only built-in MCP
        // flags plus opaque mcp mention segments.
        mcpOption("app-controls", labels["app-controls"].orEmpty(), null),
        mcpOption("browser", labels["browser"].orEmpty(), "browser"),
        mcpOption("crossagents", labels["crossagents"].orEmpty(), "crossagents"),
        mcpOption("chrome", labels["chrome"].orEmpty(), "chrome"),
        mcpOption("computer-use", labels["computer-use"].orEmpty(), "computer-use"),
    ).filter { it.title.removePrefix("@").isNotBlank() }

    private fun mcpOption(id: String, title: String, configKey: String?): RichChatMentionOption =
        RichChatMentionOption(
            id = "mcp:$id",
            title = "@$title",
            detail = null,
            icon = if (id == "app-controls") Icons.Outlined.Terminal else Icons.Outlined.Extension,
            segment = RichPromptSegment.Mcp(id, title),
            mcpConfigKey = configKey,
        )

    private fun threadOption(thread: RemoteThread): RichChatMentionOption {
        val title = thread.title.ifBlank { thread.id }
        return RichChatMentionOption(
            id = "thread:${thread.id}",
            title = title,
            detail = thread.projectId,
            icon = Icons.Outlined.AccountTree,
            segment = RichPromptSegment.Thread(thread.id, title),
        )
    }

    private fun fileOption(entry: ProjectFileEntry): RichChatMentionOption = RichChatMentionOption(
        id = "file:${entry.path}",
        title = entry.name.ifBlank { entry.path.substringAfterLast('/') },
        detail = entry.path,
        icon = if (entry.type == ProjectFileEntryType.Directory) {
            Icons.Outlined.Folder
        } else {
            Icons.Outlined.Description
        },
        segment = RichPromptSegment.File(entry.path),
    )

    private fun RichRuntimeItem.mentionOptions(): List<RichChatMentionOption> =
        RichContentDecoder.decodeMessageContent(payload).orEmpty().flatMap { block ->
            when (block) {
                is RichContentBlock.File -> listOf(
                    RichChatMentionOption(
                        id = "file:${block.path}",
                        title = block.name ?: block.path.substringAfterLast('/'),
                        detail = block.path,
                        icon = if (block.name == null) Icons.Outlined.Folder else Icons.Outlined.Description,
                        segment = RichPromptSegment.File(block.path),
                    ),
                )
                is RichContentBlock.Thread -> listOf(
                    RichChatMentionOption(
                        id = "thread:${block.threadId}",
                        title = block.title.ifBlank { block.threadId },
                        detail = block.threadId,
                        icon = Icons.Outlined.AccountTree,
                        segment = RichPromptSegment.Thread(
                            block.threadId,
                            block.title.ifBlank { block.threadId },
                        ),
                    ),
                )
                else -> emptyList()
            }
        }

    private const val MAX_SUGGESTIONS = 8
}

@Composable
internal fun RichChatSuggestionList(
    options: List<RichChatMentionOption>,
    onSelect: (RichChatMentionOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (options.isEmpty()) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        LazyColumn(
            modifier = Modifier.heightIn(max = 240.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            items(options, key = { it.id }) { option ->
                TextButton(
                    onClick = { onSelect(option) },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(option.icon, contentDescription = null)
                        Column(Modifier.weight(1f)) {
                            Text(option.title, style = MaterialTheme.typography.bodyMedium)
                            option.detail?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun RichChatSlashSuggestions(
    options: List<RichChatSlashCommandOption>,
    onSelect: (RichChatSlashCommandOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (options.isEmpty()) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
            items(options, key = { it.displayId }) { option ->
                TextButton(
                    onClick = { onSelect(option) },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            if (option.skill == null) Icons.Outlined.Terminal else Icons.Outlined.Extension,
                            contentDescription = null,
                        )
                        Column(Modifier.weight(1f)) {
                            Text("/${option.displayId}", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                option.description ?: option.label,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                            )
                        }
                        option.argumentHint?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

internal fun RichChatSlashCommandOption.toPromptSegment(): RichPromptSegment.Skill? = skill

private const val MAX_SUGGESTIONS = 8
