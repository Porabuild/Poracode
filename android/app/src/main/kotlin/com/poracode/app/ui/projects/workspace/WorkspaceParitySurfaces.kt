package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.launch

// MARK: - Merge Conflict Parser & Resolution

internal data class MergeConflictHunk(
    val id: Int,
    val startIndex: Int,
    val endExclusive: Int,
    val currentLabel: String,
    val currentText: String,
    val incomingLabel: String,
    val incomingText: String,
)

internal enum class MergeConflictChoice { Current, Incoming, Both }

internal object MergeConflictResolver {
    fun findHunks(source: String): List<MergeConflictHunk> {
        val hunks = mutableListOf<MergeConflictHunk>()
        var cursor = 0
        var id = 0
        while (cursor < source.length) {
            val start = source.indexOf("<<<<<<<", cursor).takeIf { it >= 0 } ?: break
            val mid = source.indexOf("\n=======\n", start).takeIf { it >= 0 } ?: break
            val endMarker = source.indexOf("\n>>>>>>>", mid + 9).takeIf { it >= 0 } ?: break
            val lineEnd = source.indexOf('\n', endMarker + 8).let { if (it < 0) source.length else it }
            val firstNewline = source.indexOf('\n', start).takeIf { it in start..mid } ?: mid
            val currentLabel = source.substring(start + 7, firstNewline).trim()
            val currentBodyStart = if (firstNewline < mid) firstNewline + 1 else mid
            val currentText = source.substring(currentBodyStart, mid)
            val incomingText = source.substring(mid + 9, endMarker)
            val incomingLabel = source.substring(endMarker + 8, lineEnd).trim()
            val fullEnd = if (lineEnd < source.length) lineEnd + 1 else lineEnd
            hunks += MergeConflictHunk(
                id = id++,
                startIndex = start,
                endExclusive = fullEnd,
                currentLabel = currentLabel,
                currentText = currentText,
                incomingLabel = incomingLabel,
                incomingText = incomingText,
            )
            cursor = fullEnd
        }
        return hunks
    }

    fun resolve(source: String, hunk: MergeConflictHunk, choice: MergeConflictChoice): String {
        val replacement = when (choice) {
            MergeConflictChoice.Current -> hunk.currentText + "\n"
            MergeConflictChoice.Incoming -> hunk.incomingText + "\n"
            MergeConflictChoice.Both -> hunk.currentText + "\n" + hunk.incomingText + "\n"
        }
        return source.substring(0, hunk.startIndex) + replacement + source.substring(hunk.endExclusive)
    }
}

// MARK: - Rich File Editor Multi-Tab Strip & Find/Replace Bar

@Composable
internal fun EditorMultiTabStrip(
    openPaths: List<String>,
    activePath: String?,
    dirtyPaths: Set<String>,
    onSelect: (String) -> Unit,
    onClose: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        openPaths.forEach { path ->
            val active = path == activePath
            val name = path.substringAfterLast('/')
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (active) colors.accent.copy(alpha = 0.16f) else colors.surface)
                    .clickable { onSelect(path) }
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    if (path in dirtyPaths) "• $name" else name,
                    style = PoracodeTextStyles.rowMeta,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Icon(
                    PoracodeIcons.Close,
                    contentDescription = "Close tab",
                    tint = colors.muted,
                    modifier = Modifier.size(14.dp).clickable { onClose(path) },
                )
            }
        }
    }
}

@Composable
internal fun EditorFindReplaceBar(
    query: String,
    replacement: String,
    matchCount: Int,
    onQueryChange: (String) -> Unit,
    onReplacementChange: (String) -> Unit,
    onReplaceAll: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(PoracodeTheme.colors.surface)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PoracodeTextField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = { Text("Find…") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Text("$matchCount", style = PoracodeTextStyles.rowMeta, color = PoracodeTheme.colors.muted)
            PoracodeIconButton(icon = PoracodeIcons.Close, contentDescription = "Close find", onClick = onClose)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PoracodeTextField(
                value = replacement,
                onValueChange = onReplacementChange,
                placeholder = { Text("Replace…") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = onReplaceAll, enabled = query.isNotEmpty() && matchCount > 0) {
                Text("Replace all")
            }
        }
    }
}

// MARK: - PR Ask-AI Side Chat Sheet

@Composable
internal fun PullRequestAskAiSheet(
    prNumber: Int,
    onAsk: suspend (String) -> String?,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val colors = PoracodeTheme.colors
    var prompt by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf<List<Pair<Boolean, String>>>(emptyList()) }

    PoracodeSheet(onDismissRequest = onDismiss, title = "Ask AI · #$prNumber") {
        Column(Modifier.fillMaxWidth().heightIn(max = 500.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            LazyColumn(
                modifier = Modifier.weight(1f, fill = false).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(messages) { _, (isUser, text) ->
                    PoracodeCard {
                        Text(
                            if (isUser) "You" else "Assistant",
                            style = PoracodeTextStyles.rowMeta,
                            color = if (isUser) colors.accent else colors.muted,
                        )
                        Text(text, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PoracodeTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    placeholder = { Text("Ask about PR #$prNumber…") },
                    modifier = Modifier.weight(1f),
                )
                FilledTonalButton(
                    onClick = {
                        val q = prompt.trim()
                        if (q.isEmpty() || sending) return@FilledTonalButton
                        prompt = ""
                        messages = messages + (true to q)
                        sending = true
                        scope.launch {
                            val reply = runCatching { onAsk(q) }.getOrNull() ?: "Unable to answer right now."
                            messages = messages + (false to reply)
                            sending = false
                        }
                    },
                    enabled = prompt.isNotBlank() && !sending,
                ) {
                    Text("Ask")
                }
            }
        }
    }
}

// MARK: - Git AI Action Bar & Multi-Tab Terminal Strip

@Composable
internal fun GitReviewAiActionBar(
    hasConflicts: Boolean,
    busy: Boolean,
    onGenerateCommitMessage: () -> Unit,
    onCommitAndPush: () -> Unit,
    onCommitPushAndPr: () -> Unit,
    onFixConflictsInAgent: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = onGenerateCommitMessage, enabled = !busy, modifier = Modifier.weight(1f)) {
                Text("AI Msg", maxLines = 1)
            }
            OutlinedButton(onClick = onCommitAndPush, enabled = !busy, modifier = Modifier.weight(1f)) {
                Text("Commit & Push", maxLines = 1)
            }
            FilledTonalButton(onClick = onCommitPushAndPr, enabled = !busy, modifier = Modifier.weight(1f)) {
                Text("Commit + PR", maxLines = 1)
            }
        }
        if (hasConflicts) {
            FilledTonalButton(
                onClick = onFixConflictsInAgent,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Fix conflicts in Agent")
            }
        }
    }
}

internal data class TerminalTabDescriptor(
    val id: String,
    val title: String,
    val isRunning: Boolean,
    val isRunAction: Boolean = false,
)

@Composable
internal fun TerminalMultiTabBar(
    tabs: List<TerminalTabDescriptor>,
    activeTabId: String,
    directKeyMode: Boolean,
    onToggleDirectKeyMode: (Boolean) -> Unit,
    onSelect: (String) -> Unit,
    onClose: (String) -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            tabs.forEach { tab ->
                val active = tab.id == activeTabId
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (active) colors.accent.copy(alpha = 0.16f) else colors.surface)
                        .clickable { onSelect(tab.id) }
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(if (tab.isRunning) Color(0xFF22C55E) else colors.muted.copy(alpha = 0.4f)),
                    )
                    Text(
                        tab.title,
                        style = PoracodeTextStyles.rowMeta,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    )
                    if (tabs.size > 1) {
                        Icon(
                            PoracodeIcons.Close,
                            contentDescription = "Close terminal tab",
                            tint = colors.muted,
                            modifier = Modifier.size(13.dp).clickable { onClose(tab.id) },
                        )
                    }
                }
            }
        }
        PoracodeIconButton(icon = PoracodeIcons.Add, contentDescription = "New terminal tab", onClick = onAdd)
        OutlinedButton(onClick = { onToggleDirectKeyMode(!directKeyMode) }) {
            Text(if (directKeyMode) "Raw" else "Line", style = PoracodeTextStyles.rowMeta)
        }
    }
}
