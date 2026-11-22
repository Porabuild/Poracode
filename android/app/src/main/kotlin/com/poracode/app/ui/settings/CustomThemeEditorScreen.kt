package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeSwitch
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.theme.CustomThemeColorMath
import com.poracode.app.ui.theme.CustomThemeDocument
import com.poracode.app.ui.theme.CustomThemePalette
import com.poracode.app.ui.theme.NativeCustomTheme
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.util.Locale

@Composable
internal fun CustomThemeEditorScreen(
    existing: NativeCustomTheme?,
    onSave: (NativeCustomTheme) -> Unit,
    onExport: ((CustomThemeDocument) -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onCancel: () -> Unit,
) {
    val defaultName = stringResource(R.string.custom_theme_default_name)
    var name by rememberSaveable(existing?.id) {
        mutableStateOf(existing?.document?.label ?: defaultName)
    }
    var modeIndex by rememberSaveable(existing?.id) { mutableIntStateOf(1) } // 0 = Light, 1 = Dark
    var lightPalette by remember(existing?.id) {
        mutableStateOf(existing?.document?.light ?: CustomThemePalette.DefaultLight)
    }
    var darkPalette by remember(existing?.id) {
        mutableStateOf(existing?.document?.dark ?: CustomThemePalette.DefaultDark)
    }
    var validationError by remember { mutableStateOf(false) }

    val editingDark = modeIndex == 1
    val activePalette = if (editingDark) darkPalette else lightPalette
    val updatePalette: (CustomThemePalette) -> Unit = { updated ->
        validationError = false
        if (editingDark) darkPalette = updated else lightPalette = updated
    }
    val draftDocument = CustomThemeDocument(
        label = name,
        light = lightPalette,
        dark = darkPalette,
    )
    val previewColors = remember(activePalette, editingDark) {
        CustomThemeColorMath.toPoracodeColors(activePalette, isDark = editingDark)
    }
    val ratios = remember(activePalette, editingDark) {
        CustomThemeColorMath.ratios(activePalette, isDark = editingDark)
    }
    val backModifier = rememberPredictiveBackModifier(onBack = onCancel)

    Scaffold(
        modifier = backModifier,
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        topBar = {
            com.poracode.app.ui.components.PoracodePaneHeader(
                title = stringResource(
                    if (existing == null) R.string.custom_theme_create
                    else R.string.custom_theme_edit,
                ),
                horizontalPadding = 4.dp,
                leading = {
                    IconButton(onClick = onCancel) {
                        Icon(PoracodeIcons.ArrowBack, stringResource(R.string.back))
                    }
                },
                trailing = {
                    if (onExport != null && draftDocument.isValid()) {
                        IconButton(onClick = { onExport(draftDocument) }) {
                            Icon(PoracodeIcons.Download, stringResource(R.string.custom_theme_export))
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                modifier = Modifier.widthIn(max = 720.dp).fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item("name") {
                    SettingsCard {
                        PoracodeTextField(
                            value = name,
                            onValueChange = { name = it; validationError = false },
                            label = { Text(stringResource(R.string.custom_theme_name)) },
                            singleLine = true,
                        )
                        PoracodeSegmentedControl(
                            options = listOf(
                                stringResource(R.string.settings_appearance_light),
                                stringResource(R.string.settings_appearance_dark),
                            ),
                            selectedIndex = modeIndex,
                            onSelect = { modeIndex = it },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                item("preview") {
                    CustomThemePreviewCard(
                        colors = previewColors,
                        themeName = name.ifBlank { defaultName },
                    )
                }

                item("contrast") {
                    CustomThemeContrastCard(ratios)
                }

                item("colors") {
                    SettingsCard {
                        Text(
                            stringResource(R.string.custom_theme_hex_hint),
                            style = PoracodeTextStyles.rowDescription,
                            color = PoracodeTheme.colors.muted,
                        )
                        CustomThemePalette.Field.entries.forEach { field ->
                            CustomThemeHexFieldRow(
                                label = stringResource(field.labelRes()),
                                value = activePalette[field].orEmpty(),
                                placeholder = if (field.required) "#000000" else stringResource(R.string.custom_theme_automatic),
                                onValueChange = { updated ->
                                    updatePalette(activePalette.withField(field, updated))
                                },
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                stringResource(R.string.custom_theme_sidebar_fill),
                                style = MaterialTheme.typography.bodySmall,
                                color = PoracodeTheme.colors.foreground,
                                modifier = Modifier.weight(1f),
                            )
                            PoracodeSwitch(
                                checked = activePalette.sidebarFill == true,
                                onCheckedChange = { checked ->
                                    updatePalette(activePalette.copy(sidebarFill = checked))
                                },
                            )
                        }
                    }
                }

                if (validationError) {
                    item("error") {
                        Text(
                            stringResource(R.string.custom_theme_validation_error),
                            style = MaterialTheme.typography.bodySmall,
                            color = PoracodeTheme.colors.danger,
                        )
                    }
                }

                item("actions") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (onDelete != null) {
                            com.poracode.app.ui.components.PoracodeActionButton(
                                label = stringResource(R.string.custom_theme_delete),
                                variant = com.poracode.app.ui.components.PoracodeButtonVariant.DangerOutlined,
                                onClick = onDelete,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        com.poracode.app.ui.components.PoracodeActionButton(
                            label = stringResource(R.string.custom_theme_save_apply),
                            variant = com.poracode.app.ui.components.PoracodeButtonVariant.PrimaryNeutral,
                            onClick = {
                                if (!draftDocument.isValid()) {
                                    validationError = true
                                } else {
                                    val target = existing?.copy(document = draftDocument)
                                        ?: NativeCustomTheme(document = draftDocument)
                                    onSave(target)
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CustomThemeHexFieldRow(
    label: String,
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
) {
    val parsedColor = remember(value) {
        CustomThemePalette.normalizedHex(value)?.let { CustomThemeColorMath.parseColor(it) }
    }
    val colors = PoracodeTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(parsedColor ?: colors.default)
                .border(1.dp, colors.border, RoundedCornerShape(6.dp)),
        )
        PoracodeTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = { Text(placeholder) },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun CustomThemePreviewCard(
    colors: com.poracode.app.ui.theme.PoracodeColors,
    themeName: String,
) {
    val shape = RoundedCornerShape(PoracodeRadius.contentSurface)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 116.dp)
            .clip(shape)
            .background(colors.background)
            .border(1.dp, colors.border, shape),
    ) {
        Column(
            modifier = Modifier
                .width(110.dp)
                .fillMaxSize()
                .background(colors.sidebarBackground ?: colors.surface)
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    themeName,
                    style = PoracodeTextStyles.rowTitle.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.foreground,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Box(Modifier.size(5.dp).clip(CircleShape).background(colors.accent))
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(22.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.sidebarRowActive ?: colors.rowActive),
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(18.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.listRow),
            )
        }
        Box(Modifier.width(1.dp).fillMaxSize().background(colors.hairline))
        Column(
            modifier = Modifier.weight(1f).fillMaxSize().padding(10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    stringResource(R.string.custom_theme_preview_title),
                    style = PoracodeTextStyles.rowTitle.copy(fontWeight = FontWeight.Medium),
                    color = colors.foreground,
                    maxLines = 1,
                )
                Text(
                    stringResource(R.string.custom_theme_preview_subtitle),
                    style = PoracodeTextStyles.rowMeta,
                    color = colors.muted,
                    maxLines = 1,
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(32.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.composerSurface)
                    .border(1.dp, colors.hairline, RoundedCornerShape(10.dp))
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(colors.accentSoft),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(colors.accent))
                }
            }
        }
    }
}

@Composable
private fun CustomThemeContrastCard(ratios: Map<String, Double>) {
    val colors = PoracodeTheme.colors
    SettingsCard {
        Text(
            stringResource(R.string.custom_theme_contrast_title),
            style = PoracodeTextStyles.sheetTitle,
            color = colors.foreground,
        )
        listOf(
            "content" to R.string.custom_theme_field_content,
            "surface" to R.string.custom_theme_field_surface,
            "muted" to R.string.custom_theme_secondary_text,
            "accent" to R.string.custom_theme_field_accent,
        ).forEach { (key, labelRes) ->
            val ratio = ratios[key]
            val good = ratio != null && ratio >= 4.5
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    stringResource(labelRes),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.foreground,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    ratio?.let { String.format(Locale.US, "%.1f:1", it) } ?: "—",
                    style = PoracodeTextStyles.monoMeta,
                    color = colors.muted,
                )
                if (ratio != null) {
                    Text(
                        stringResource(
                            if (good) R.string.custom_theme_good_contrast
                            else R.string.custom_theme_low_contrast,
                        ),
                        style = PoracodeTextStyles.rowMeta.copy(fontWeight = FontWeight.SemiBold),
                        color = if (good) colors.success else colors.warning,
                    )
                }
            }
        }
    }
}

private fun CustomThemePalette.Field.labelRes(): Int = when (this) {
    CustomThemePalette.Field.Bg -> R.string.custom_theme_field_bg
    CustomThemePalette.Field.Surface -> R.string.custom_theme_field_surface
    CustomThemePalette.Field.Fg -> R.string.custom_theme_field_fg
    CustomThemePalette.Field.Accent -> R.string.custom_theme_field_accent
    CustomThemePalette.Field.AccentFg -> R.string.custom_theme_field_accent_fg
    CustomThemePalette.Field.Border -> R.string.custom_theme_field_border
    CustomThemePalette.Field.Sidebar -> R.string.custom_theme_field_sidebar
    CustomThemePalette.Field.Content -> R.string.custom_theme_field_content
    CustomThemePalette.Field.Composer -> R.string.custom_theme_field_composer
    CustomThemePalette.Field.SidebarRowActive -> R.string.custom_theme_field_sidebar_active
}
