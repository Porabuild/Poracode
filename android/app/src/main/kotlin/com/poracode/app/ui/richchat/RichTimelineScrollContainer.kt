package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeCircleButton
import com.poracode.app.ui.theme.PoracodeIcons
import kotlinx.coroutines.launch

/** Keep the jump control centered above the composer, as on the compact PWA. */
@Composable
internal fun RichTimelineScrollContainer(
    listState: LazyListState,
    initialScrollComplete: Boolean,
    modifier: Modifier = Modifier,
    bottomOverlayClearance: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var followsBottom by remember(listState) { mutableStateOf(true) }
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress to listState.canScrollForward }.collect { (scrolling, canScrollForward) ->
            if (scrolling || !canScrollForward) followsBottom = !canScrollForward
        }
    }
    LaunchedEffect(initialScrollComplete, bottomOverlayClearance) {
        if (initialScrollComplete && followsBottom) {
            val lastIndex = listState.layoutInfo.totalItemsCount - 1
            if (lastIndex >= 0) listState.scrollToItem(lastIndex)
        }
    }
    Box(modifier.fillMaxSize()) {
        content()
        if (initialScrollComplete && listState.canScrollForward) {
            PoracodeCircleButton(
                icon = PoracodeIcons.ArrowDown,
                contentDescription = stringResource(R.string.rich_chat_scroll_to_bottom),
                onClick = {
                    followsBottom = true
                    scope.launch {
                        val lastIndex = listState.layoutInfo.totalItemsCount - 1
                        if (lastIndex >= 0) listState.animateScrollToItem(lastIndex)
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = bottomOverlayClearance + 12.dp),
            )
        }
    }
}
