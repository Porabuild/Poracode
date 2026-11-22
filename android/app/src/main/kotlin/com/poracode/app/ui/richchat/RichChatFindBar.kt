package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

internal object RichChatFindMatcher {
    fun matchingItemIds(items: List<RichRuntimeItem>, query: String): List<String> {
        val needle = query.trim()
        if (needle.isEmpty()) return emptyList()
        return items.mapNotNull { item ->
            val text = RichChatUiLogic.itemText(item)
            if (text.contains(needle, ignoreCase = true)) item.id else null
        }
    }
}

@Stable
internal class RichChatFindState(
    val open: Boolean,
    val query: String,
    val matchCount: Int,
    val currentMatchIndex: Int,
    val toggle: () -> Unit,
    val onQueryChange: (String) -> Unit,
    val onPrevious: () -> Unit,
    val onNext: () -> Unit,
    val onClose: () -> Unit,
)

@Composable
internal fun rememberRichChatFindState(
    threadId: String,
    items: List<RichRuntimeItem>,
): RichChatFindState {
    var open by rememberSaveable(threadId) { mutableStateOf(false) }
    var query by rememberSaveable(threadId) { mutableStateOf("") }
    var matchIndex by rememberSaveable(threadId) { mutableIntStateOf(0) }
    val matches = remember(items, query, open) {
        if (open) RichChatFindMatcher.matchingItemIds(items, query) else emptyList()
    }
    LaunchedEffect(matches.size) {
        if (matchIndex >= matches.size) matchIndex = 0
    }
    return RichChatFindState(
        open = open,
        query = query,
        matchCount = matches.size,
        currentMatchIndex = matchIndex,
        toggle = { open = !open; if (!open) query = "" },
        onQueryChange = { query = it; matchIndex = 0 },
        onPrevious = { if (matches.isNotEmpty()) matchIndex = (matchIndex - 1 + matches.size) % matches.size },
        onNext = { if (matches.isNotEmpty()) matchIndex = (matchIndex + 1) % matches.size },
        onClose = { open = false; query = "" },
    )
}

/**
 * Compact in-thread find bar mirroring iOS `RichChatFind`: live match count,
 * previous/next navigation, and dismiss control.
 */
@Composable
internal fun RichChatFindBar(
    query: String,
    matchCount: Int,
    currentMatchIndex: Int,
    onQueryChange: (String) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val focusRequester = remember { FocusRequester() }
    val shape = RoundedCornerShape(PoracodeRadius.contentSurface)
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .height(44.dp)
            .clip(shape)
            .background(colors.listRow)
            .border(1.dp, colors.hairline, shape)
            .padding(start = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            PoracodeIcons.Search,
            contentDescription = null,
            modifier = Modifier.size(15.dp),
            tint = colors.muted,
        )
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) {
                Text(
                    stringResource(R.string.rich_chat_find_placeholder),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.fieldPlaceholder,
                    maxLines = 1,
                )
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall.copy(color = colors.foreground),
                cursorBrush = SolidColor(colors.foreground),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester),
            )
        }
        if (query.isNotBlank()) {
            Text(
                if (matchCount == 0) "0/0" else "${currentMatchIndex + 1}/$matchCount",
                style = PoracodeTextStyles.monoMeta,
                color = colors.muted,
                maxLines = 1,
            )
        }
        PoracodeIconButton(
            icon = PoracodeIcons.KeyboardArrowUp,
            contentDescription = stringResource(R.string.rich_chat_find_previous),
            onClick = onPrevious,
            enabled = matchCount > 0,
            iconSize = 16.dp,
        )
        PoracodeIconButton(
            icon = PoracodeIcons.KeyboardArrowDown,
            contentDescription = stringResource(R.string.rich_chat_find_next),
            onClick = onNext,
            enabled = matchCount > 0,
            iconSize = 16.dp,
        )
        PoracodeIconButton(
            icon = PoracodeIcons.Close,
            contentDescription = stringResource(R.string.rich_chat_find_close),
            onClick = onClose,
            iconSize = 16.dp,
        )
    }
}
