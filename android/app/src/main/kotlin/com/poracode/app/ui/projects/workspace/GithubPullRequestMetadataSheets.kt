package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.forge.ForgeReviewOperation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

private const val REVIEWER_SEARCH_DEBOUNCE_MS = 300L

/** Multi-select over the host's label candidates; saving sends only the add/remove deltas. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LabelEditorSheet(
    current: List<PullRequestLabelRow>,
    metadata: ReviewMetadataActions,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val currentNames = remember(current) { current.map { it.name } }
    var selected by remember { mutableStateOf(currentNames.toSet()) }
    var candidates by remember { mutableStateOf<List<PullRequestLabelRow>?>(null) }
    var truncated by remember { mutableStateOf(false) }
    var loadFailed by remember { mutableStateOf(false) }
    var saveFailed by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val result = metadata.candidates(ForgeReviewOperation.ListPrLabelCandidates, emptyMap())
        loadFailed = result == null
        truncated = result.truncated()
        candidates = (result as? JsonObject)?.labelRows().orEmpty()
    }
    // Current labels stay listed (and removable) even when the bounded candidate read omits them.
    val options = remember(candidates, current) {
        val loaded = candidates.orEmpty()
        current.filter { label -> loaded.none { it.name == label.name } } + loaded
    }
    val (add, remove) = labelDelta(currentNames, selected)
    MetadataSheetFrame(R.string.forge_review_edit_labels, onDismiss) {
        if (candidates == null) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (loadFailed) ErrorLine(R.string.forge_review_candidates_failed)
        if (truncated) Text(
            stringResource(R.string.forge_review_labels_truncated),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LazyColumn(Modifier.heightIn(max = SHEET_LIST_MAX_HEIGHT)) {
            items(options, key = { it.name }) { label ->
                val checked = label.name in selected
                Row(
                    Modifier
                        .fillMaxWidth()
                        .toggleable(checked, enabled = !saving, role = Role.Checkbox) {
                            selected = if (it) selected + label.name else selected - label.name
                        }
                        .padding(vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked, null, enabled = !saving)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        PullRequestLabelChip(label)
                        label.description?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        if (saveFailed) ErrorLine(R.string.forge_review_metadata_failed)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TextButton(onDismiss, Modifier.weight(1f)) { Text(stringResource(R.string.git_cancel)) }
            Button(
                onClick = {
                    saving = true
                    saveFailed = false
                    scope.launch {
                        val accepted = metadata.write(ForgeReviewOperation.SetPrLabels, labelWriteFields(add, remove))
                        saving = false
                        if (accepted) onDismiss() else saveFailed = true
                    }
                },
                enabled = metadata.enabled && !saving && (add.isNotEmpty() || remove.isNotEmpty()),
                modifier = Modifier.weight(1f),
            ) { Text(stringResource(R.string.remote_integrations_save)) }
        }
    }
}

/** Search the host's reviewer candidates, add one, or remove an already requested reviewer. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewerEditorSheet(
    requested: List<PullRequestReviewerRow>,
    metadata: ReviewMetadataActions,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var candidates by remember { mutableStateOf<List<PullRequestReviewerRow>?>(null) }
    var truncated by remember { mutableStateOf(false) }
    var loadFailed by remember { mutableStateOf(false) }
    var writeFailed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(query) {
        if (query.isNotEmpty()) delay(REVIEWER_SEARCH_DEBOUNCE_MS)
        val result = metadata.candidates(ForgeReviewOperation.ListPrReviewerCandidates, reviewerQueryFields(query))
        loadFailed = result == null
        truncated = result.truncated()
        candidates = (result as? JsonObject)?.reviewerRows("reviewers").orEmpty()
    }
    fun write(add: List<PullRequestReviewerRow>, remove: List<PullRequestReviewerRow>) {
        busy = true
        writeFailed = false
        scope.launch {
            writeFailed = !metadata.write(ForgeReviewOperation.RequestPrReviewers, reviewerWriteFields(add, remove))
            busy = false
        }
    }
    val requestedIds = requested.map { it.id }.toSet()
    val available = candidates.orEmpty().filter { it.id !in requestedIds }
    MetadataSheetFrame(R.string.forge_review_request_review, onDismiss) {
        if (requested.isNotEmpty()) {
            SectionHeader(stringResource(R.string.forge_review_requested_reviewers))
            requested.forEach { reviewer ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ReviewerLine(reviewer, Modifier.weight(1f))
                    TextButton({ write(emptyList(), listOf(reviewer)) }, enabled = metadata.enabled && !busy) {
                        Text(stringResource(R.string.forge_review_reviewer_remove))
                    }
                }
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.take(MAX_REVIEWER_QUERY) },
            label = { Text(stringResource(R.string.forge_review_reviewer_search)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (candidates == null || busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (loadFailed) ErrorLine(R.string.forge_review_candidates_failed)
        if (writeFailed) ErrorLine(R.string.forge_review_metadata_failed)
        if (candidates != null && !loadFailed && available.isEmpty()) Text(
            stringResource(R.string.forge_review_reviewers_none),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LazyColumn(Modifier.heightIn(max = SHEET_LIST_MAX_HEIGHT)) {
            items(available, key = { it.id }) { reviewer ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    ReviewerLine(reviewer, Modifier.weight(1f))
                    OutlinedButton({ write(listOf(reviewer), emptyList()) }, enabled = metadata.enabled && !busy) {
                        Text(stringResource(R.string.forge_review_reviewer_add))
                    }
                }
            }
        }
        if (truncated) Text(
            stringResource(R.string.forge_review_reviewers_truncated),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onDismiss, Modifier.fillMaxWidth()) { Text(stringResource(R.string.forge_review_done)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MetadataSheetFrame(title: Int, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(title), style = MaterialTheme.typography.titleLarge)
            content()
        }
    }
}

@Composable
private fun ErrorLine(message: Int) {
    Text(stringResource(message), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
}

private val SHEET_LIST_MAX_HEIGHT = 320.dp
