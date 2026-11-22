package com.poracode.app.ui.settings

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.storage.DeviceAppearanceMode
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.CustomThemeDocument
import com.poracode.app.ui.theme.CustomThemeStore
import com.poracode.app.ui.theme.DEFAULT_PORACODE_THEME_ID
import com.poracode.app.ui.theme.NativeCustomTheme
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.theme.PoracodeThemePreset
import com.poracode.app.ui.theme.PoracodeThemePresets
import com.poracode.app.ui.theme.normalizeThemeId
import com.poracode.app.ui.theme.toThemePreset

@Composable
internal fun DeviceAppearancePane(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
    customThemes: CustomThemeStore? = null,
) {
    val context = LocalContext.current
    val customThemeState = customThemes?.state?.collectAsStateWithLifecycle()?.value
    val customList = customThemeState?.themes.orEmpty()
    var showThemePicker by rememberSaveable { mutableStateOf(false) }
    var editingCustomThemeId by rememberSaveable { mutableStateOf<String?>(null) }
    var creatingCustomTheme by rememberSaveable { mutableStateOf(false) }
    var importError by rememberSaveable { mutableStateOf(false) }
    var pendingExportDoc by remember { mutableStateOf<CustomThemeDocument?>(null) }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null || customThemes == null) return@rememberLauncherForActivityResult
        val raw = runCatching {
            context.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
        }.getOrNull()
        if (raw == null) {
            importError = true
            return@rememberLauncherForActivityResult
        }
        customThemes.importJson(raw).fold(
            onSuccess = { saved ->
                importError = false
                preferences.setThemeId(saved.id)
            },
            onFailure = { importError = true },
        )
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        val doc = pendingExportDoc
        pendingExportDoc = null
        if (uri == null || doc == null) return@rememberLauncherForActivityResult
        runCatching {
            val json = doc.exportJson()
            context.contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use {
                it.write(json)
            }
        }
    }

    if (creatingCustomTheme || editingCustomThemeId != null) {
        val editing = editingCustomThemeId?.let { id -> customList.firstOrNull { it.id == id } }
        CustomThemeEditorScreen(
            existing = editing,
            onSave = { theme ->
                customThemes?.save(theme)?.onSuccess { saved ->
                    preferences.setThemeId(saved.id)
                    creatingCustomTheme = false
                    editingCustomThemeId = null
                }
            },
            onExport = { doc ->
                pendingExportDoc = doc
                exportLauncher.launch("${doc.label.trim().ifEmpty { "theme" }}.poracode-theme.json")
            },
            onDelete = editing?.let { target ->
                {
                    customThemes?.delete(target.id)
                    if (state.themeId == target.id) {
                        preferences.setThemeId(DEFAULT_PORACODE_THEME_ID)
                    }
                    editingCustomThemeId = null
                }
            },
            onCancel = {
                creatingCustomTheme = false
                editingCustomThemeId = null
            },
        )
        return
    }

    val selectedPreset = customList.firstOrNull { it.id == state.themeId }?.toThemePreset()
        ?: PoracodeThemePresets.firstOrNull { it.id == normalizeThemeId(state.themeId) }
        ?: PoracodeThemePresets.first()

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
            SettingsSection(title = stringResource(R.string.settings_theme)) {
                ThemePresetRow(
                    preset = selectedPreset,
                    selected = false,
                    onSelect = { showThemePicker = true },
                    trailingChevron = true,
                )
            }
        }
        if (customThemes != null) {
            item {
                SettingsSection(title = stringResource(R.string.custom_theme_section)) {
                    customList.forEach { custom ->
                        val preset = custom.toThemePreset()
                        PoracodeListRow(
                            onClick = { preferences.setThemeId(custom.id) },
                            containerColor = androidx.compose.ui.graphics.Color.Transparent,
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp),
                        ) {
                            ThemeSwatch(preset)
                            Text(
                                preset.label,
                                Modifier.weight(1f),
                                style = PoracodeTextStyles.rowTitle,
                                color = PoracodeTheme.colors.foreground,
                                maxLines = 1,
                            )
                            if (state.themeId == custom.id) {
                                Icon(
                                    PoracodeIcons.Check,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = PoracodeTheme.colors.foreground,
                                )
                            }
                            if (customThemeState?.canEdit != false) {
                                IconButton(
                                    onClick = { editingCustomThemeId = custom.id },
                                    modifier = Modifier.size(36.dp),
                                ) {
                                    Icon(
                                        PoracodeIcons.Edit,
                                        contentDescription = stringResource(R.string.custom_theme_edit),
                                        modifier = Modifier.size(15.dp),
                                        tint = PoracodeTheme.colors.muted,
                                    )
                                }
                            }
                        }
                    }
                    if (importError) {
                        Text(
                            stringResource(R.string.custom_theme_import_error),
                            style = MaterialTheme.typography.bodySmall,
                            color = PoracodeTheme.colors.danger,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        com.poracode.app.ui.components.PoracodeActionButton(
                            label = stringResource(R.string.custom_theme_create),
                            icon = PoracodeIcons.Add,
                            variant = com.poracode.app.ui.components.PoracodeButtonVariant.Tonal,
                            onClick = { creatingCustomTheme = true },
                            enabled = customThemeState?.canEdit != false &&
                                customList.size < CustomThemeStore.MAX_CUSTOM_THEMES,
                            modifier = Modifier.weight(1f),
                        )
                        com.poracode.app.ui.components.PoracodeActionButton(
                            label = stringResource(R.string.custom_theme_import),
                            icon = PoracodeIcons.Upload,
                            variant = com.poracode.app.ui.components.PoracodeButtonVariant.Outlined,
                            onClick = { importLauncher.launch(arrayOf("application/json", "*/*")) },
                            enabled = customThemeState?.canEdit != false &&
                                customList.size < CustomThemeStore.MAX_CUSTOM_THEMES,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
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
            customList.forEach { custom ->
                ThemePresetRow(
                    preset = custom.toThemePreset(),
                    selected = state.themeId == custom.id,
                    onSelect = {
                        preferences.setThemeId(custom.id)
                        showThemePicker = false
                    },
                )
            }
            PoracodeThemePresets.forEach { preset ->
                ThemePresetRow(
                    preset = preset,
                    selected = state.themeId == preset.id ||
                        (customList.none { it.id == state.themeId } &&
                            normalizeThemeId(state.themeId) == preset.id),
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
        containerColor = if (trailingChevron) androidx.compose.ui.graphics.Color.Transparent else null,
        contentPadding = PaddingValues(horizontal = if (trailingChevron) 4.dp else 8.dp, vertical = 8.dp),
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
