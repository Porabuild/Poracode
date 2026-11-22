package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeSwitch
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.voice.VoiceDictationBackend

/**
 * Device Audio & Voice Dictation settings pane, mirroring iOS `AudioSettingsView.swift`.
 */
@Composable
internal fun DeviceAudioPane(
    showDictationButton: Boolean,
    backend: VoiceDictationBackend,
    onToggleDictationButton: (Boolean) -> Unit,
    onSelectBackend: (VoiceDictationBackend) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    var selectedBackend by rememberSaveable(backend) { mutableStateOf(backend) }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = PoracodeMetrics.pageInline,
            vertical = 12.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SettingsSection(title = stringResource(R.string.settings_audio_dictation)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        stringResource(R.string.settings_audio_show_button),
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.foreground,
                        modifier = Modifier.weight(1f),
                    )
                    PoracodeSwitch(
                        checked = showDictationButton,
                        onCheckedChange = onToggleDictationButton,
                    )
                }
                Text(
                    stringResource(R.string.settings_audio_backend_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
                val optionLabels = listOf(
                    stringResource(R.string.settings_audio_backend_host),
                    stringResource(R.string.settings_audio_backend_device),
                )
                PoracodeSegmentedControl(
                    options = optionLabels,
                    selectedIndex = VoiceDictationBackend.entries.indexOf(selectedBackend).coerceAtLeast(0),
                    onSelect = { index ->
                        val next = VoiceDictationBackend.entries.getOrElse(index) {
                            VoiceDictationBackend.HostHexVoice
                        }
                        selectedBackend = next
                        onSelectBackend(next)
                    },
                )
            }
        }
    }
}
