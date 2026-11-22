package com.poracode.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

private data class KeyboardShortcutItem(
    val labelRes: Int,
    val keys: String,
)

/**
 * Hardware keyboard shortcut reference for Android tablets, foldables, and
 * ChromeOS/DeX keyboards — matching iOS `KeyboardShortcuts` settings entry.
 */
@Composable
internal fun DeviceKeyboardShortcutsPane(modifier: Modifier = Modifier) {
    val navigationShortcuts = listOf(
        KeyboardShortcutItem(R.string.shortcut_toggle_sidebar, "Ctrl + \\"),
        KeyboardShortcutItem(R.string.shortcut_toggle_inspector, "Ctrl + I"),
        KeyboardShortcutItem(R.string.shortcut_open_settings, "Ctrl + ,"),
        KeyboardShortcutItem(R.string.shortcut_dismiss_overlay, "Esc"),
    )
    val threadShortcuts = listOf(
        KeyboardShortcutItem(R.string.shortcut_new_thread, "Ctrl + N"),
        KeyboardShortcutItem(R.string.shortcut_find_in_thread, "Ctrl + F"),
    )

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = PoracodeMetrics.pageInline,
            vertical = 12.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SettingsSection(title = stringResource(R.string.shortcut_section_navigation)) {
                navigationShortcuts.forEach { ShortcutRow(stringResource(it.labelRes), it.keys) }
            }
        }
        item {
            SettingsSection(title = stringResource(R.string.shortcut_section_threads)) {
                threadShortcuts.forEach { ShortcutRow(stringResource(it.labelRes), it.keys) }
            }
        }
    }
}

@Composable
private fun ShortcutRow(label: String, keys: String) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.foreground,
            modifier = Modifier.weight(1f),
        )
        Text(
            keys,
            style = PoracodeTextStyles.monoMeta.copy(fontWeight = FontWeight.Medium),
            color = colors.foreground,
            modifier = Modifier
                .clip(RoundedCornerShape(PoracodeRadius.small))
                .background(colors.paneControl)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}
