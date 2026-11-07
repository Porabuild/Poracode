package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.protocol.forge.ForgeReviewOperation
import com.poracode.app.session.projects.ForgeReviewEntry
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.serialization.json.*

@Composable
internal fun ForgeReviewGuidePane(
    entry: ForgeReviewEntry,
    writers: List<AgentStatusEntry>,
    canMutate: Boolean,
    mutate: (ForgeReviewOperation, Map<String, JsonElement>) -> Unit,
    refresh: suspend () -> Unit,
    openFile: (String) -> Unit,
    finish: () -> Unit,
) {
    val document = entry.documents[ForgeReviewOperation.GetPrReviewGuide] as? JsonObject
    val guide = document?.get("guide") as? JsonObject
    val stops = guide?.objects("stops").orEmpty()
    val generating = document?.string("status") == "generating"
    val stale = document == null || document.boolean("stale") || !entry.matchesDisplayedDiff(document)
    var stopIndex by rememberSaveable(entry.source, entry.number, guide?.get("fingerprint")) { mutableIntStateOf(0) }
    val index = stopIndex.coerceIn(0, maxOf(0, stops.lastIndex))
    var writer by rememberSaveable(entry.source) { mutableStateOf("") }
    var model by rememberSaveable(entry.source) { mutableStateOf("") }
    var instructions by rememberSaveable(entry.source) { mutableStateOf("") }
    var choosingWriter by remember { mutableStateOf(false) }
    val selectedWriter = writers.firstOrNull { it.kind == writer } ?: writers.firstOrNull()
    LaunchedEffect(generating, entry.isCached) {
        while (generating && !entry.isCached) { delay(5000); refresh() }
    }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item("configuration") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box {
                        OutlinedButton({ choosingWriter = true }, enabled = !generating && !entry.mutating && writers.isNotEmpty()) {
                            Text(selectedWriter?.label ?: stringResource(R.string.forge_review_writer))
                        }
                        DropdownMenu(choosingWriter, { choosingWriter = false }) {
                            writers.distinctBy { it.kind }.forEach { candidate ->
                                DropdownMenuItem(text = { Text(candidate.label) }, onClick = { writer = candidate.kind; choosingWriter = false })
                            }
                        }
                    }
                    OutlinedTextField(model, { model = it }, label = { Text(stringResource(R.string.forge_review_model)) }, enabled = !generating && !entry.mutating, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(instructions, { instructions = it }, label = { Text(stringResource(R.string.forge_review_instructions)) }, enabled = !generating && !entry.mutating, minLines = 2, maxLines = 6, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        val selected = selectedWriter ?: return@Button
                        mutate(ForgeReviewOperation.WritePrReviewGuide, buildMap {
                            put("agentKind", JsonPrimitive(selected.kind))
                            put("instructions", JsonPrimitive(instructions))
                            put("language", JsonPrimitive(Locale.getDefault().displayLanguage))
                            if (model.isNotEmpty()) put("selection", buildJsonObject { put("model", model) })
                        })
                    }, enabled = canMutate && !generating && selectedWriter != null && instructions.length <= 16000) {
                        Text(stringResource(if (guide == null) R.string.forge_review_write else R.string.forge_review_rewrite))
                    }
                    if (selectedWriter == null) Text(stringResource(R.string.forge_review_no_writer), style = MaterialTheme.typography.bodySmall)
                }
            }
            if (generating) item("generating") {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(stringResource(R.string.forge_review_generating))
            }
            if (document?.string("status") == "failed") item("failed") { Text(stringResource(R.string.forge_review_failed), color = MaterialTheme.colorScheme.error) }
            if (guide != null) item("summary") {
                if (stale) Text(stringResource(R.string.forge_review_stale), color = MaterialTheme.colorScheme.onSurfaceVariant)
                SelectionContainer { Text(guide.string("summary")) }
            }
            if (stops.isNotEmpty()) item("stop") {
                val stop = stops[index]
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stop.string("title"), style = MaterialTheme.typography.titleMedium)
                    if (stop.boolean("lookClosely")) Text(stringResource(R.string.forge_review_look_closely), color = MaterialTheme.colorScheme.tertiary)
                    SelectionContainer { Text(stop.string("body")) }
                    (stop["files"] as? JsonArray)?.forEach { file ->
                        val path = (file as? JsonPrimitive)?.content ?: return@forEach
                        TextButton({ openFile(path) }) { Text(path, fontFamily = FontFamily.Monospace) }
                    }
                    if (!stale) stop.objects("excerpts").forEach { excerpt ->
                        OutlinedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${excerpt.string("path")}:${excerpt.long("startLine")}–${excerpt.long("endLine")}", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace)
                                SelectionContainer { Text(excerpt.string("text"), style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace) }
                            }
                        }
                    }
                }
            }
        }
        if (stops.isNotEmpty()) {
            HorizontalDivider()
            Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton({ stopIndex = index - 1 }, enabled = index > 0) { Text(stringResource(R.string.forge_review_back)) }
                if (index < stops.lastIndex) Button({ stopIndex = index + 1 }) { Text(stringResource(R.string.forge_review_next)) }
                else Button(finish, enabled = canMutate) { Text(stringResource(R.string.forge_review_finish)) }
            }
        }
    }
}
