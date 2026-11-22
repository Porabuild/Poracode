package com.poracode.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Single unified Soft Hairline card for Android Poracode surfaces (Settings,
 * Inspector, Home Overview, and runtime cards): 10dp corners, flat `listRow`
 * fill, 1dp `hairlineSoft` edge, and 12dp inner padding on the 4dp/8dp grid.
 */
@Composable
fun PoracodeCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    icon: ImageVector? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    containerColor: Color? = null,
    borderColor: Color? = null,
    contentPadding: PaddingValues = PaddingValues(12.dp),
    verticalSpacing: Dp = 8.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(PoracodeRadius.contentSurface)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(containerColor ?: colors.paneCard)
            .border(1.dp, borderColor ?: colors.hairlineSoft, shape)
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(verticalSpacing),
    ) {
        if (title != null || icon != null || trailing != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        icon,
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                        tint = colors.muted,
                    )
                }
                if (title != null) {
                    Text(
                        title,
                        style = PoracodeTextStyles.sheetTitle,
                        color = colors.foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).semantics { heading() },
                    )
                }
                trailing?.invoke(this)
            }
        }
        content()
    }
}

enum class PoracodeButtonVariant {
    /** Neutral tonal container (`colors.default`), standard Material 3 secondary/default action. */
    Tonal,
    /** Hairline-bordered transparent container for quiet secondary actions. */
    Outlined,
    /** High-contrast neutral primary (`colors.foreground` fill, `colors.background` label). */
    PrimaryNeutral,
    /** Quiet destructive outlined button with danger text. */
    DangerOutlined,
}

/**
 * Compact Android-proportioned Material 3 button (`38dp` visual height, `12dp` radius)
 * that stays balanced beside 12-14sp Poracode typography instead of towering stadium pills.
 */
@Composable
fun PoracodeActionButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    variant: PoracodeButtonVariant = PoracodeButtonVariant.Tonal,
    enabled: Boolean = true,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(PoracodeRadius.control)
    val baseFill = when (variant) {
        PoracodeButtonVariant.Tonal -> colors.paneControl
        PoracodeButtonVariant.Outlined, PoracodeButtonVariant.DangerOutlined -> Color.Transparent
        PoracodeButtonVariant.PrimaryNeutral -> colors.foreground
    }
    val fill = when {
        pressed && enabled -> when (variant) {
            PoracodeButtonVariant.PrimaryNeutral -> colors.foreground.copy(alpha = 0.88f)
            else -> colors.rowActive.compositeOver(baseFill)
        }
        hovered && enabled -> when (variant) {
            PoracodeButtonVariant.PrimaryNeutral -> colors.foreground.copy(alpha = 0.94f)
            else -> colors.rowActive.copy(alpha = 0.55f).compositeOver(baseFill)
        }
        else -> baseFill
    }
    val border = when {
        focused && enabled -> colors.foreground.copy(alpha = 0.65f)
        variant == PoracodeButtonVariant.Outlined -> colors.hairlineStrong
        variant == PoracodeButtonVariant.DangerOutlined -> colors.danger.copy(alpha = 0.35f)
        else -> Color.Transparent
    }
    val contentColor = when (variant) {
        PoracodeButtonVariant.PrimaryNeutral -> colors.background
        PoracodeButtonVariant.DangerOutlined -> colors.danger
        else -> colors.foreground
    }
    Row(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = PoracodeMetrics.controlHeight)
            .scale(rememberPressScale(interaction))
            .alpha(if (enabled) 1f else 0.38f)
            .clip(shape)
            .background(fill)
            .then(
                if (border != Color.Transparent) {
                    Modifier.border(if (focused) 1.5.dp else 1.dp, border, shape)
                } else {
                    Modifier
                },
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        if (icon != null) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = contentColor,
            )
        }
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
            color = contentColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Compact square-rounded (`12dp` radius) Android Material 3 tonal icon button
 * matching `PoracodeInlineSearchField` height (`38dp`) inside sidebars and headers.
 */
@Composable
fun PoracodeTonalIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(PoracodeRadius.control)
    val base = if (selected) colors.rowActive else colors.paneControl.copy(alpha = 0.72f)
    val fill = when {
        pressed && enabled -> colors.rowActive.compositeOver(base)
        hovered && enabled -> colors.rowActive.copy(alpha = 0.5f).compositeOver(base)
        else -> base
    }
    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .size(PoracodeMetrics.controlHeight)
            .scale(rememberPressScale(interaction))
            .alpha(if (enabled) 1f else 0.38f)
            .clip(shape)
            .background(fill)
            .border(
                if (focused) 1.5.dp else 1.dp,
                if (focused) colors.foreground.copy(alpha = 0.65f) else colors.hairline,
                shape,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClickLabel = contentDescription,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(18.dp),
            tint = if (selected) colors.foreground else colors.foreground.copy(alpha = 0.85f),
        )
    }
}

/**
 * Flat Android Material 3 inline search field (`38dp`, `12dp` radius, `fieldBackground`)
 * for docked/modal sidebars and panes — replacing iOS floating glass capsule search bars.
 */
@Composable
fun PoracodeInlineSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(PoracodeRadius.control)
    Row(
        modifier = modifier
            .height(PoracodeMetrics.controlHeight)
            .clip(shape)
            .background(colors.fieldBackground)
            .border(1.dp, colors.hairline, shape)
            .padding(start = 12.dp, end = 4.dp)
            .semantics { contentDescription = placeholder },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            PoracodeIcons.Search,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = colors.muted,
        )
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) {
                Text(
                    placeholder,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.fieldPlaceholder,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall.copy(color = colors.foreground),
                cursorBrush = SolidColor(colors.foreground),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (value.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = { onValueChange("") }),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    PoracodeIcons.Close,
                    contentDescription = stringResource(R.string.clear_search),
                    modifier = Modifier.size(16.dp),
                    tint = colors.muted,
                )
            }
        }
    }
}

/**
 * Clean Android Material 3 docked action/tab strip anchored cleanly inside a
 * sidebar or inspector pane without unnecessary divider rules.
 */
@Composable
fun PoracodeDockedBar(
    modifier: Modifier = Modifier,
    containerColor: Color? = null,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (containerColor != null) Modifier.background(containerColor) else Modifier)
            .height(48.dp)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * Flat Material 3 navigation item for split-view sidebars (Settings, Projects, etc.):
 * transparent at rest so items never stack as heavy dark rectangles, with a quiet
 * `12dp` rounded tonal pill when selected or pressed.
 */
@Composable
fun PoracodeDrawerNavItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(PoracodeRadius.control)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .minimumInteractiveComponentSize()
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(
                when {
                    selected -> colors.rowActive
                    pressed -> colors.rowActive.copy(alpha = 0.7f)
                    hovered -> colors.rowActive.copy(alpha = 0.45f)
                    else -> Color.Transparent
                },
            )
            .then(
                if (focused) Modifier.border(1.5.dp, colors.foreground.copy(alpha = 0.65f), shape) else Modifier,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = if (selected) colors.foreground else colors.muted,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            ),
            color = if (selected) colors.foreground else colors.foreground.copy(alpha = 0.85f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}
