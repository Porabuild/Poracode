package com.poracode.app.ui.sidechat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

data class SideChatNote(
    val id: String,
    val prompt: String,
)

/**
 * Ephemeral Side Chat panel anchored inside the right inspector (`RichChatRightPanelTab.SideChat`),
 * letting users draft quick side questions scoped to the active thread and transfer them cleanly
 * into the main thread composer without polluting main conversation history.
 */
@Composable
internal fun SideChatPanel(
    threadId: String,
    threadTitle: String?,
    onTransferToComposer: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    var draft by rememberSaveable(threadId) { mutableStateOf("") }
    val notes = remember(threadId) { mutableStateListOf<SideChatNote>() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = PoracodeMetrics.paneInline, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (notes.isEmpty()) {
            PoracodeCard(
                title = stringResource(R.string.side_chat_title),
                icon = PoracodeIcons.MarkChatUnread,
            ) {
                Text(
                    stringResource(R.string.side_chat_empty_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
                threadTitle?.takeIf(String::isNotBlank)?.let { title ->
                    Text(
                        stringResource(R.string.side_chat_context_label, title),
                        style = PoracodeTextStyles.rowMeta,
                        color = colors.muted,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(notes, key = { it.id }) { entry ->
                    PoracodeCard {
                        Text(
                            entry.prompt,
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.foreground,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            PoracodeActionButton(
                                label = stringResource(R.string.side_chat_move_to_composer),
                                icon = PoracodeIcons.Send,
                                variant = PoracodeButtonVariant.Tonal,
                                onClick = {
                                    onTransferToComposer(entry.prompt)
                                    notes.remove(entry)
                                },
                            )
                            PoracodeActionButton(
                                label = stringResource(R.string.side_chat_clear),
                                variant = PoracodeButtonVariant.Outlined,
                                onClick = { notes.remove(entry) },
                            )
                        }
                    }
                }
            }
        }
        if (notes.isEmpty()) {
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
        }
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PoracodeTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text(stringResource(R.string.side_chat_placeholder)) },
                maxLines = 4,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                PoracodeActionButton(
                    label = stringResource(R.string.side_chat_stage),
                    icon = PoracodeIcons.Add,
                    variant = PoracodeButtonVariant.Tonal,
                    enabled = draft.isNotBlank(),
                    onClick = {
                        val text = draft.trim()
                        if (text.isNotEmpty()) {
                            notes.add(SideChatNote(java.util.UUID.randomUUID().toString(), text))
                            draft = ""
                        }
                    },
                )
                PoracodeActionButton(
                    label = stringResource(R.string.side_chat_move_to_composer),
                    icon = PoracodeIcons.Send,
                    variant = PoracodeButtonVariant.PrimaryNeutral,
                    enabled = draft.isNotBlank(),
                    onClick = {
                        val text = draft.trim()
                        if (text.isNotEmpty()) {
                            onTransferToComposer(text)
                            draft = ""
                        }
                    },
                )
            }
        }
    }
}
