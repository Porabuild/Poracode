package com.poracode.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.storage.DeviceAppearanceMode
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.theme.PoracodeThemePreset
import com.poracode.app.ui.theme.PoracodeThemePresets
import com.poracode.app.ui.theme.normalizeThemeId

@Composable
internal fun DeviceAppearancePane(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    var showThemePicker by rememberSaveable { mutableStateOf(false) }
    val selectedPreset = PoracodeThemePresets.firstOrNull {
        it.id == normalizeThemeId(state.themeId)
    } ?: PoracodeThemePresets.first()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SettingsCard {
                Text(
                    stringResource(R.string.settings_appearance_mode),
                    style = PoracodeTextStyles.sheetTitle,
                    color = PoracodeTheme.colors.foreground,
                )
                Text(
                    stringResource(R.string.settings_appearance_mode_description),
                    style = PoracodeTextStyles.rowDescription,
                    color = PoracodeTheme.colors.muted,
                )
                PoracodeSegmentedControl(
                    options = DeviceAppearanceMode.entries.map { mode ->
                        stringResource(
                            when (mode) {
                                DeviceAppearanceMode.System -> R.string.settings_appearance_system
                                DeviceAppearanceMode.Light -> R.string.settings_appearance_light
                                DeviceAppearanceMode.Dark -> R.string.settings_appearance_dark
                            },
                        )
                    },
                    selectedIndex = DeviceAppearanceMode.entries.indexOf(state.appearanceMode),
                    onSelect = { preferences.setAppearanceMode(DeviceAppearanceMode.entries[it]) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item {
            // One row for the current theme; the full gallery opens in a
            // sheet so it does not fill the Appearance page.
            SettingsSection(title = stringResource(R.string.settings_theme)) {
                ThemePresetRow(
                    preset = selectedPreset,
                    selected = false,
                    onSelect = { showThemePicker = true },
                    trailingChevron = true,
                )
            }
        }
        item {
            SettingsCard {
                AppearanceTextSizeRow(
                    value = state.chatTextSizeSp,
                    onChange = preferences::setChatTextSizeSp,
                )
            }
        }
    }
    if (showThemePicker) {
        PoracodeSheet(
            onDismissRequest = { showThemePicker = false },
            title = stringResource(R.string.settings_theme),
        ) {
            PoracodeThemePresets.forEach { preset ->
                ThemePresetRow(
                    preset = preset,
                    selected = normalizeThemeId(state.themeId) == preset.id,
                    onSelect = {
                        preferences.setThemeId(preset.id)
                        showThemePicker = false
                    },
                )
            }
        }
    }
}

@Composable
private fun AppearanceTextSizeRow(value: Int, onChange: (Int) -> Unit) {
    val label = stringResource(R.string.settings_chat_text_size)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            Modifier.weight(1f),
            style = PoracodeTextStyles.sheetTitle,
            color = PoracodeTheme.colors.foreground,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AppearanceStepperButton(
                icon = PoracodeIcons.Remove,
                description = "$label, −",
                enabled = value > DeviceSettingsState.MIN_TERMINAL_TEXT_SIZE_SP,
                onClick = { onChange(value - 1) },
            )
            Text(
                stringResource(R.string.settings_text_size_sp, value),
                style = PoracodeTextStyles.monoSummary,
                color = PoracodeTheme.colors.foreground,
            )
            AppearanceStepperButton(
                icon = PoracodeIcons.Add,
                description = "$label, +",
                enabled = value < DeviceSettingsState.MAX_TERMINAL_TEXT_SIZE_SP,
                onClick = { onChange(value + 1) },
            )
        }
    }
}

@Composable
private fun AppearanceStepperButton(
    icon: ImageVector,
    description: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    Box(
        Modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(colors.default)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = if (enabled) colors.foreground else colors.muted.copy(alpha = 0.5f),
        )
    }
}

/** Theme picker row: background+accent swatch, preset name, neutral check when selected. */
@Composable
private fun ThemePresetRow(
    preset: PoracodeThemePreset,
    selected: Boolean,
    onSelect: () -> Unit,
    trailingChevron: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    PoracodeListRow(
        onClick = onSelect,
        onClickLabel = preset.label,
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
    ) {
        ThemeSwatch(preset)
        Text(
            preset.label,
            Modifier.weight(1f),
            style = PoracodeTextStyles.rowTitle,
            color = colors.foreground,
            maxLines = 1,
        )
        if (selected) {
            Icon(
                PoracodeIcons.Check,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = colors.foreground,
            )
        } else if (trailingChevron) {
            Icon(
                PoracodeIcons.KeyboardArrowRight,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = colors.muted,
            )
        }
    }
}

/** Small preview chip showing the preset's page background with its accent dot. */
@Composable
private fun ThemeSwatch(preset: PoracodeThemePreset) {
    val variant = if (PoracodeTheme.colors.isDark) preset.dark else preset.light
    Box(
        Modifier
            .size(30.dp, 22.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(variant.background)
            .border(1.dp, variant.border, RoundedCornerShape(6.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(variant.accent),
        )
    }
}

