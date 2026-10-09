@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.poracode.app.R

/** Localized menu labels for the shared panel capabilities. */
@Composable
internal fun richChatSessionPanelLabel(panel: RichChatSessionActionPanelKind): String =
    stringResource(
        when (panel) {
            RichChatSessionActionPanelKind.ReviseCommand -> R.string.rich_chat_session_action_revise
            RichChatSessionActionPanelKind.ListRules -> R.string.rich_chat_session_action_rules
        },
    )

@Composable
internal fun RichChatSessionReviseSheet(
    suggestion: String?,
    missingSuggestion: Boolean,
    isPending: Boolean,
    enabled: Boolean,
    failureText: String?,
    onDismiss: () -> Unit,
    onSubmit: (command: String, note: String) -> Unit,
    onInsert: (String) -> Unit,
    onDiscard: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = { if (!isPending) onDismiss() }) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (suggestion != null) {
                ReviseSuggestionReview(
                    suggestion = suggestion,
                    enabled = enabled,
                    onInsert = onInsert,
                    onDiscard = onDiscard,
                )
            } else {
                if (missingSuggestion) {
                    Text(
                        stringResource(R.string.rich_chat_session_revise_empty),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                ReviseCommandForm(
                    isPending = isPending,
                    enabled = enabled,
                    failureText = failureText,
                    onSubmit = onSubmit,
                )
            }
        }
    }
}

@Composable
private fun ReviseSuggestionReview(
    suggestion: String,
    enabled: Boolean,
    onInsert: (String) -> Unit,
    onDiscard: () -> Unit,
) {
    Text(
        stringResource(R.string.rich_chat_session_revise_result_title),
        style = MaterialTheme.typography.titleMedium,
    )
    Surface(
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            suggestion,
            style = MaterialTheme.typography.bodySmall
                .copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier
                .padding(12.dp)
                .heightIn(max = 220.dp)
                .verticalScroll(rememberScrollState()),
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { onInsert(suggestion) }, enabled = enabled) {
            Text(stringResource(R.string.rich_chat_session_revise_insert))
        }
        OutlinedButton(onClick = onDiscard) {
            Text(stringResource(R.string.rich_chat_session_revise_discard))
        }
    }
    Text(
        stringResource(R.string.rich_chat_session_revise_insert_hint),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ReviseCommandForm(
    isPending: Boolean,
    enabled: Boolean,
    failureText: String?,
    onSubmit: (command: String, note: String) -> Unit,
) {
    var command by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    val normalizedCommand = command.trim()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(R.string.rich_chat_session_action_revise),
            style = MaterialTheme.typography.titleMedium,
        )
        OutlinedTextField(
            value = command,
            onValueChange = { command = it },
            label = { Text(stringResource(R.string.rich_chat_session_revise_command_field)) },
            enabled = enabled && !isPending,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text(stringResource(R.string.rich_chat_session_revise_note_field)) },
            enabled = enabled && !isPending,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSubmit(normalizedCommand, note.trim()) },
            enabled = enabled && !isPending && normalizedCommand.isNotEmpty(),
        ) {
            Text(stringResource(R.string.rich_chat_session_revise_submit))
        }
        Text(
            stringResource(R.string.rich_chat_session_revise_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        failureText?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

