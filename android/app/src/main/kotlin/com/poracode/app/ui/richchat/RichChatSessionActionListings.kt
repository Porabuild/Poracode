@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import kotlinx.serialization.json.JsonObject

/** Read-only listing chrome: one progress/failed/empty/content surface per panel. */
@Composable
internal fun RichChatSessionListingSheet(
    title: String,
    emptyText: String,
    state: RichChatListingState,
    onDismiss: () -> Unit,
) {
    RichChatSessionListingContainer(title = title, onDismiss = onDismiss) {
        when (state) {
            RichChatListingState.Idle, RichChatListingState.Loading -> ListingPending()
            RichChatListingState.Failed -> ListingFailedText()
            is RichChatListingState.Entries ->
                if (state.lines.isEmpty()) {
                    Text(
                        emptyText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        state.lines.forEach { line ->
                            RichChatRuleEntryRow(line)
                        }
                    }
                }
        }
    }
}

@Composable
private fun RichChatRuleEntryRow(entry: RichChatRuleEntryView) {
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Text(entry.name, style = MaterialTheme.typography.bodyMedium)
        Text(
            entry.path,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        entry.details.forEach { detail ->
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RichChatSessionListingContainer(
    title: String,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()

        }
    }
}

@Composable
private fun ListingPending() {
    CircularProgressIndicator(Modifier.size(20.dp))
}

@Composable
private fun ListingFailedText() {
    Text(
        stringResource(R.string.rich_chat_session_listing_failed),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
    )
}

internal sealed interface RichChatListingState {
    data object Idle : RichChatListingState
    data object Loading : RichChatListingState
    data object Failed : RichChatListingState
    data class Entries(val lines: List<RichChatRuleEntryView>) : RichChatListingState
}

internal fun decodeRichChatListingLines(
    contributor: RichChatSessionActionPanelContributor,
    panel: RichChatSessionActionPanelKind,
    result: JsonObject,
): List<RichChatRuleEntryView> = when (panel) {
    RichChatSessionActionPanelKind.ListRules ->
        contributor.ruleEntries(result)
    else -> throw RichChatSessionActionResultException()
}

