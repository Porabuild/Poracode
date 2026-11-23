package com.poracode.app.ui.richchat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.net.URLEncoder
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// MARK: - Interactive Async Question-Answer Reply Form (sourceItemId)

data class AsyncQuestionPrompt(
    val header: String,
    val question: String,
    val options: List<String>,
    val multiSelect: Boolean = false,
)

data class AsyncQuestionReplySubmission(
    val sourceItemId: String,
    val answers: Map<String, List<String>>,
    val customText: String,
) {
    fun formattedReplyText(): String = buildList {
        answers.entries.sortedBy { it.key }.forEach { (q, choices) ->
            if (choices.isNotEmpty()) add("- $q: ${choices.joinToString(", ")}")
        }
        customText.trim().takeIf(String::isNotEmpty)?.let(::add)
    }.joinToString("\n")
}

@Composable
internal fun RichAsyncQuestionReplyForm(
    sourceItemId: String,
    questions: List<AsyncQuestionPrompt>,
    onSubmit: (AsyncQuestionReplySubmission) -> Unit,
    modifier: Modifier = Modifier,
) {
    val selections = remember(sourceItemId) { mutableStateMapOf<String, Set<String>>() }
    var customText by remember(sourceItemId) { mutableStateOf("") }
    val canSubmit = selections.values.any { it.isNotEmpty() } || customText.isNotBlank()

    PoracodeCard(modifier = modifier.fillMaxWidth()) {
        questions.forEach { q ->
            if (q.header.isNotBlank()) {
                Text(q.header.uppercase(), style = MaterialTheme.typography.labelSmall, color = PoracodeTheme.colors.muted)
            }
            Text(q.question, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.Medium)
            q.options.forEach { opt ->
                val current = selections[q.question].orEmpty()
                val checked = opt in current
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            selections[q.question] = if (q.multiSelect) {
                                if (checked) current - opt else current + opt
                            } else {
                                if (checked) emptySet() else setOf(opt)
                            }
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (q.multiSelect) {
                        Checkbox(checked = checked, onCheckedChange = {
                            selections[q.question] = if (it) current + opt else current - opt
                        })
                    } else {
                        RadioButton(selected = checked, onClick = {
                            selections[q.question] = if (checked) emptySet() else setOf(opt)
                        })
                    }
                    Text(opt, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        PoracodeTextField(
            value = customText,
            onValueChange = { customText = it },
            placeholder = { Text("Additional reply…") },
            modifier = Modifier.fillMaxWidth(),
        )
        FilledTonalButton(
            onClick = {
                onSubmit(
                    AsyncQuestionReplySubmission(
                        sourceItemId = sourceItemId,
                        answers = selections.mapValues { it.value.sorted() },
                        customText = customText,
                    ),
                )
            },
            enabled = canSubmit,
        ) {
            Text("Send reply")
        }
    }
}

// MARK: - Prompt Rail & Sticky Prompt Header (thread-history-prompts)

internal data class RichPromptIndexEntry(
    val id: String,
    val text: String,
    val index: Int,
)

@Composable
internal fun RichStickyPromptBar(
    activePrompt: RichPromptIndexEntry,
    totalPrompts: Int,
    onOpenRail: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.surface)
            .clickable(onClick = onOpenRail)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(PoracodeIcons.Search, contentDescription = null, tint = colors.muted)
        Text(
            activePrompt.text,
            style = PoracodeTextStyles.rowDescription,
            color = colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            "${activePrompt.index + 1}/${totalPrompts.coerceAtLeast(1)}",
            style = PoracodeTextStyles.rowMeta,
            color = colors.muted,
        )
    }
}

@Composable
internal fun RichTimelinePromptRailChrome(
    transcript: com.poracode.app.chat.RichThreadState,
    entries: List<com.poracode.app.chat.RichTimelineEntry>,
    headerCount: Int,
    listState: androidx.compose.foundation.lazy.LazyListState,
    scope: kotlinx.coroutines.CoroutineScope,
    modifier: Modifier,
    content: @Composable (Modifier) -> Unit,
) {
    val promptEntries = remember(transcript.itemsInOrder) {
        transcript.itemsInOrder
            .filter { it.type == com.poracode.app.chat.RichItemTypes.USER_MESSAGE }
            .mapNotNull { item ->
                RichChatUiLogic.itemText(item).trim().takeIf(String::isNotEmpty)?.let { item.id to it }
            }
            .mapIndexed { idx, (id, text) -> RichPromptIndexEntry(id = id, text = text, index = idx) }
    }
    var showPromptRail by androidx.compose.runtime.saveable.rememberSaveable(transcript.key.threadId) {
        mutableStateOf(false)
    }
    if (showPromptRail && promptEntries.isNotEmpty()) {
        RichPromptRailSheet(
            prompts = promptEntries,
            onSelect = { selected ->
                val targetIndex = entries.indexOfFirst { e -> selected.id in timelineEntryItemIds(e) }
                if (targetIndex >= 0) {
                    scope.launch { listState.animateScrollToItem(headerCount + targetIndex) }
                }
            },
            onDismiss = { showPromptRail = false },
        )
    }
    Column(modifier = modifier) {
        if (promptEntries.size > 1) {
            RichStickyPromptBar(
                activePrompt = promptEntries.last(),
                totalPrompts = promptEntries.size,
                onOpenRail = { showPromptRail = true },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
        content(Modifier.weight(1f).fillMaxWidth())
    }
}

@Composable
internal fun RichPromptRailSheet(
    prompts: List<RichPromptIndexEntry>,
    onSelect: (RichPromptIndexEntry) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    PoracodeSheet(onDismissRequest = onDismiss, title = "Prompts") {
        LazyColumn(
            Modifier.fillMaxWidth().heightIn(max = 460.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(prompts, key = { it.id }) { entry ->
                PoracodeCard(modifier = Modifier.clickable { onDismiss(); onSelect(entry) }) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("#${entry.index + 1}", style = PoracodeTextStyles.rowMeta, color = colors.muted)
                        Text(
                            entry.text,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Tool Presentation Parity Cards (Diff / Command)

@Composable
internal fun RichToolDiffPreviewCard(
    path: String,
    diff: String,
    modifier: Modifier = Modifier,
) {
    var expanded by remember(path) { mutableStateOf(false) }
    val colors = PoracodeTheme.colors
    PoracodeCard(modifier = modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                path,
                style = MaterialTheme.typography.labelMedium,
                fontFamily = FontFamily.Monospace,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                if (expanded) PoracodeIcons.KeyboardArrowUp else PoracodeIcons.KeyboardArrowDown,
                contentDescription = null,
                tint = colors.muted,
            )
        }
        if (expanded) {
            Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                diff.lines().take(120).forEach { line ->
                    val tint = when {
                        line.startsWith("+") && !line.startsWith("+++") -> Color(0xFF16A34A)
                        line.startsWith("-") && !line.startsWith("---") -> Color(0xFFDC2626)
                        line.startsWith("@@") -> colors.accent
                        else -> colors.foreground
                    }
                    Text(line, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = tint)
                }
            }
        }
    }
}

// MARK: - Agent Vision Live Viewer (thread-agent-vision & agent-vision-*)

data class AgentVisionSnapshot(
    val active: Boolean,
    val sourceTitle: String?,
    val sourceKind: String?,
    val imageBytes: ByteArray?,
    val updatedAt: String?,
)

object AgentVisionWire {
    private val json = Json { ignoreUnknownKeys = true }

    fun watchMessage(threadId: String): String = buildJsonObject {
        put("type", "agent-vision-watch")
        put("threadId", threadId)
    }.toString()

    fun unwatchMessage(threadId: String): String = buildJsonObject {
        put("type", "agent-vision-unwatch")
        put("threadId", threadId)
    }.toString()

    fun isVisionFrame(type: String): Boolean = type == "agent-vision-frame"

    fun decode(rawJson: String): AgentVisionSnapshot? {
        val root = runCatching { json.parseToJsonElement(rawJson) as? JsonObject }.getOrNull() ?: return null
        val obj = (root["vision"] as? JsonObject) ?: root
        val dataUrl = (obj["imageDataUrl"] as? JsonPrimitive)?.contentOrNull
            ?: (obj["frameDataUrl"] as? JsonPrimitive)?.contentOrNull
            ?: (obj["dataUrl"] as? JsonPrimitive)?.contentOrNull
        val base64 = dataUrl?.substringAfter(',', "")?.takeIf(String::isNotEmpty)
            ?: (obj["frameBase64"] as? JsonPrimitive)?.contentOrNull
        val bytes = base64?.let { runCatching { Base64.decode(it, Base64.DEFAULT) }.getOrNull() }
        return AgentVisionSnapshot(
            active = (obj["active"] as? JsonPrimitive)?.booleanOrNull ?: (bytes != null),
            sourceTitle = (obj["title"] as? JsonPrimitive)?.contentOrNull
                ?: (obj["url"] as? JsonPrimitive)?.contentOrNull,
            sourceKind = (obj["kind"] as? JsonPrimitive)?.contentOrNull,
            imageBytes = bytes,
            updatedAt = (obj["updatedAt"] as? JsonPrimitive)?.contentOrNull,
        )
    }

    suspend fun fetch(threadId: String, api: RemoteApiClient): AgentVisionSnapshot? {
        val encoded = URLEncoder.encode(threadId, "UTF-8")
        val raw = runCatching {
            api.requestText(
                path = "/api/threads/$encoded/agent-vision?preview=1",
                method = "GET",
                timeoutMs = 15_000L,
                retryableRead = true,
            )
        }.getOrNull() ?: return null
        return decode(raw)
    }
}

@Composable
internal fun RichAgentVisionSheet(
    threadId: String,
    api: RemoteApiClient?,
    onDismiss: () -> Unit,
) {
    var snapshot by remember(threadId) { mutableStateOf<AgentVisionSnapshot?>(null) }
    var paused by remember(threadId) { mutableStateOf(false) }

    LaunchedEffect(threadId, api, paused) {
        if (api == null || paused) return@LaunchedEffect
        while (true) {
            AgentVisionWire.fetch(threadId, api)?.let { snapshot = it }
            delay(1_500L)
        }
    }

    PoracodeSheet(onDismissRequest = onDismiss, title = "Agent Vision") {
        Column(
            Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val bitmap: Bitmap? = remember(snapshot?.imageBytes) {
                snapshot?.imageBytes?.let { bytes -> BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
            }
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = snapshot?.sourceTitle ?: "Agent Vision",
                    modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp).clip(RoundedCornerShape(10.dp)),
                )
            } else {
                Text(
                    "Waiting for live agent screen or browser frames.",
                    style = MaterialTheme.typography.bodySmall,
                    color = PoracodeTheme.colors.muted,
                )
            }
            snapshot?.sourceTitle?.takeIf(String::isNotBlank)?.let {
                Text(it, style = PoracodeTextStyles.rowMeta, color = PoracodeTheme.colors.muted, maxLines = 1)
            }
            OutlinedButton(onClick = { paused = !paused }) {
                Text(if (paused) "Resume" else "Pause")
            }
        }
    }
}
