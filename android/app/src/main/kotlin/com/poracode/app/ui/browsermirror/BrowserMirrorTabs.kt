package com.poracode.app.ui.browsermirror

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.browsermirror.BrowserTab
import com.poracode.app.session.browsermirror.BrowserMirrorController
import com.poracode.app.session.browsermirror.BrowserMirrorUiState

@Composable
internal fun BrowserTabList(
    state: BrowserMirrorUiState,
    controller: BrowserMirrorController,
    modifier: Modifier,
    vertical: Boolean,
) {
    val layout = if (vertical) {
        modifier.padding(8.dp)
    } else {
        modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp)
    }
    val tabs = state.browser.tabs
    if (vertical) {
        Column(layout, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            tabs.forEachIndexed { index, tab -> BrowserTabChip(tab, index, tabs, state, controller) }
        }
    } else {
        Row(layout, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            tabs.forEachIndexed { index, tab -> BrowserTabChip(tab, index, tabs, state, controller) }
        }
    }
}

@Composable
private fun BrowserTabChip(
    tab: BrowserTab,
    index: Int,
    tabs: List<BrowserTab>,
    state: BrowserMirrorUiState,
    controller: BrowserMirrorController,
) {
    val selected = tab.tabId == state.browser.activeTabId
    val selectedText = stringResource(R.string.browser_mirror_selected_tab)
    var menuExpanded by remember(tab.tabId) { mutableStateOf(false) }
    val previousTab = tabs.getOrNull(index - 1)
    val nextTab = tabs.getOrNull(index + 1)
    Box {
        Card(
            modifier = Modifier
                .combinedClickable(
                    onClick = {
                        controller.launchCommand(BrowserMirrorUiAction.Activate(tab.tabId).toCommand())
                    },
                    onLongClick = { if (previousTab != null || nextTab != null) menuExpanded = true },
                )
                .semantics {
                    contentDescription = if (selected) {
                        tab.title.ifBlank { tab.url } + " ($selectedText)"
                    } else {
                        tab.title.ifBlank { tab.url }
                    }
                },
        ) {
            Row(
                Modifier.padding(start = 12.dp, top = 6.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    tab.title.ifBlank { stringResource(R.string.browser_mirror_untitled_tab) },
                    color = if (selected) MaterialTheme.colorScheme.primary else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    maxLines = 1,
                    modifier = Modifier.weight(1f, fill = false),
                )
                IconButton(
                    onClick = {
                        controller.launchCommand(BrowserMirrorUiAction.Close(tab.tabId).toCommand())
                    },
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = stringResource(R.string.browser_mirror_close_tab),
                    )
                }
            }
        }
        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
            if (previousTab != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.browser_mirror_move_left)) },
                    onClick = {
                        menuExpanded = false
                        controller.launchCommand(
                            BrowserMirrorUiAction.Move(tab.tabId, previousTab.tabId, before = true).toCommand(),
                        )
                    },
                )
            }
            if (nextTab != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.browser_mirror_move_right)) },
                    onClick = {
                        menuExpanded = false
                        controller.launchCommand(
                            BrowserMirrorUiAction.Move(tab.tabId, nextTab.tabId, before = false).toCommand(),
                        )
                    },
                )
            }
        }
    }
}
