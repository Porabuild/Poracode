package com.poracode.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.blur.hazeBlur

/**
 * The PWA's floating "glass" material (`--m-glass-surface`, hairline border and
 * `--m-floating-control-shadow`) shared by circle buttons, the bottom pill, and
 * floating selectors so the bottom row always reads as one set.
 */
@Composable
fun Modifier.poracodeFloatingSurface(shape: Shape = CircleShape, pressed: Boolean = false): Modifier {
    val colors = PoracodeTheme.colors
    val hazeState = LocalPoracodeHazeState.current
    val fill = if (pressed) colors.foreground.copy(alpha = 0.10f).compositeOver(colors.glass) else colors.glass
    var surface = this
        .shadow(
            elevation = if (colors.isDark) 10.dp else 3.dp,
            shape = shape,
            ambientColor = colors.floatingShadow,
            spotColor = colors.floatingShadow,
        )
        .clip(shape)
    surface = if (hazeState != null) {
        // Backdrop blur replaces the flat translucent fill: the style carries
        // the same neutral glass tint at reduced alpha over the blurred source.
        surface.hazeBlur(
            input = HazeInput.Sources(hazeState),
            style = poracodeGlassStyle(),
        )
    } else {
        surface.background(fill)
    }
    return surface.border(1.dp, colors.hairline.copy(alpha = colors.hairline.alpha * 0.55f), shape)
}

/** Shared 44 dp glass circle used by compact header and bottom-row actions (`MobileCircleButton`). */
@Composable
fun PoracodeCircleButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = Color.Unspecified,
    size: Dp = PoracodeMetrics.tapTarget,
    onLongClick: (() -> Unit)? = null,
    badge: (@Composable () -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .size(size)
            .scale(rememberPressScale(interaction))
            .poracodeFloatingSurface(pressed = pressed)
            .pressable(interaction, enabled, contentDescription, onClick, onLongClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            // 18 dp glyph in the 44 dp circle matches the PWA proportion; the
            // button keeps its full tap target.
            modifier = Modifier.size(18.dp),
            tint = iconTint(enabled, tint),
        )
        badge?.invoke()
    }
}

/** A plain 44 dp icon target without the glass material, for inline header and row actions. */
@Composable
fun PoracodeIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = Color.Unspecified,
    iconSize: Dp = 18.dp,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .size(PoracodeMetrics.tapTarget)
            .scale(rememberPressScale(interaction))
            .clip(RoundedCornerShape(8.dp))
            .background(if (pressed) PoracodeTheme.colors.rowActive else Color.Transparent)
            .pressable(interaction, enabled, contentDescription, onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(iconSize),
            tint = iconTint(enabled, tint),
        )
    }
}

@Composable
private fun iconTint(enabled: Boolean, tint: Color): Color {
    val colors = PoracodeTheme.colors
    return when {
        !enabled -> colors.muted.copy(alpha = 0.5f)
        tint != Color.Unspecified -> tint
        else -> colors.foreground
    }
}

/** Glass capsule matching the circle buttons beside it, e.g. the home "Plan, ask, build…" prompt. */
@Composable
fun PoracodeFloatingPill(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    contentDescription: String? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = modifier
            .height(PoracodeMetrics.tapTarget)
            .scale(rememberPressScale(interaction))
            .poracodeFloatingSurface(pressed = pressed)
            .pressable(interaction, enabled, contentDescription, onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/**
 * Thumb-reachable bottom control row (`MobilePageBottomBar`): a leading action,
 * page-owned center content, and a trailing primary action, floating above the
 * navigation bar.
 */
@Composable
fun PoracodeBottomBar(
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    center: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(
                start = PoracodeMetrics.pageInline,
                end = PoracodeMetrics.pageInline,
                bottom = PoracodeMetrics.floatingBottom,
                top = 8.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(PoracodeMetrics.floatingGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.invoke()
        Row(
            Modifier.weight(1f),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            content = center,
        )
        trailing?.invoke()
    }
}

/** Resting list row surface shared by threads, connections, projects, and ports (`m-thread-row`). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PoracodeListRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    onLongClickLabel: String? = null,
    onClickLabel: String? = null,
    selected: Boolean = false,
    enabled: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
    content: @Composable RowScope.() -> Unit,
) {
    val colors = PoracodeTheme.colors
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shape = RoundedCornerShape(PoracodeRadius.row)
    val clickable = if (onClick != null || onLongClick != null) {
        Modifier.combinedClickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            role = Role.Button,
            onLongClickLabel = onLongClickLabel,
            onClickLabel = onClickLabel,
            onClick = onClick ?: {},
            onLongClick = onLongClick?.let { action ->
                {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    action()
                }
            },
        )
    } else {
        Modifier
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = PoracodeMetrics.tapTarget)
            .clip(shape)
            .background(
                if (pressed || selected) colors.rowActive.compositeOver(colors.listRow) else colors.listRow,
            )
            .then(clickable)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** Title and optional muted description stacked inside a [PoracodeListRow]. */
@Composable
fun RowScope.PoracodeRowText(
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    titleColor: Color = PoracodeTheme.colors.foreground,
    maxDescriptionLines: Int = 1,
) {
    Column(modifier.weight(1f)) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            color = titleColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!description.isNullOrBlank()) {
            Text(
                description,
                style = PoracodeTextStyles.rowDescription,
                color = PoracodeTheme.colors.muted,
                maxLines = maxDescriptionLines,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** 28 dp icon tile with a hairline border, as in the PWA settings and more lists. */
@Composable
fun PoracodeIconTile(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    tint: Color = PoracodeTheme.colors.muted,
) {
    Box(
        modifier
            .size(28.dp)
            .border(1.dp, PoracodeTheme.colors.hairline, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = tint)
    }
}

/** Small neutral chip for compact metadata (`m-chip`). */
@Composable
fun PoracodeChip(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    onClick: (() -> Unit)? = null,
    selected: Boolean = false,
    contentDescription: String? = null,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val tint = if (selected) colors.accentSoftForeground else colors.foreground
    Row(
        modifier = modifier
            .height(28.dp)
            .scale(rememberPressScale(interaction))
            .clip(CircleShape)
            .background(if (selected) colors.accentSoft else colors.default.copy(alpha = 0.7f))
            .then(
                if (onClick != null) {
                    Modifier.pressable(interaction, true, contentDescription, onClick)
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = tint)
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = tint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
private fun Modifier.pressable(
    interaction: MutableInteractionSource,
    enabled: Boolean,
    label: String?,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
): Modifier = combinedClickable(
    interactionSource = interaction,
    indication = null,
    enabled = enabled,
    role = Role.Button,
    onClickLabel = label,
    onClick = onClick,
    onLongClick = onLongClick,
)

/** Theme-accent switch matching the PWA: accent track/thumb when checked. */
@Composable
fun PoracodeSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = PoracodeTheme.colors
    val haptics = LocalHapticFeedback.current
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange?.let { change ->
            { value: Boolean ->
                haptics.performHapticFeedback(
                    if (value) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff,
                )
                change(value)
            }
        },
        modifier = modifier,
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedThumbColor = colors.accentForeground,
            checkedTrackColor = colors.accent,
            checkedBorderColor = Color.Transparent,
            uncheckedThumbColor = colors.muted,
            uncheckedTrackColor = colors.default,
            uncheckedBorderColor = colors.border,
        ),
    )
}

/** Accent-filled button reserved for the primary pairing/QR actions. */
@Composable
fun PoracodeAccentButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = ButtonDefaults.shape,
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    content: @Composable RowScope.() -> Unit,
) {
    val colors = PoracodeTheme.colors
    Button(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = shape,
        contentPadding = contentPadding,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.accent,
            contentColor = colors.accentForeground,
        ),
        content = content,
    )
}
