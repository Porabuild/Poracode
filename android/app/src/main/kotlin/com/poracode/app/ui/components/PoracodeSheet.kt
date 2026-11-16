package com.poracode.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Compact drawer (`m-sheet`): the PWA's surface-colored bottom sheet with a
 * hairline edge, a slim grabber, and a small semibold heading.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PoracodeSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    skipPartiallyExpanded: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = skipPartiallyExpanded)
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(topStart = PoracodeRadius.sheet, topEnd = PoracodeRadius.sheet)
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier.border(1.dp, colors.hairline, shape),
        sheetState = sheetState,
        shape = shape,
        containerColor = colors.surface,
        contentColor = colors.foreground,
        tonalElevation = 0.dp,
        scrimColor = colors.scrim,
        dragHandle = { PoracodeSheetGrabber() },
    ) {
        if (title != null) {
            Text(
                title,
                modifier = Modifier
                    .padding(start = 16.dp, end = 14.dp, bottom = 8.dp)
                    .semantics { heading() },
                style = PoracodeTextStyles.sheetTitle,
                color = colors.foreground,
            )
        }
        androidx.compose.foundation.layout.Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp)
                .navigationBarsPadding(),
        ) {
            content()
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** Separator-colored hairline with breathing room, used between sheet action groups. */
@Composable
fun PoracodeSheetDivider(modifier: Modifier = Modifier) {
    androidx.compose.material3.HorizontalDivider(
        modifier = modifier.padding(vertical = 6.dp),
        color = PoracodeTheme.colors.separator,
    )
}

@Composable
fun PoracodeSheetGrabber(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(top = 6.dp, bottom = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .width(36.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(PoracodeTheme.colors.foreground.copy(alpha = 0.24f)),
        )
    }
}

/** Emphasis for a sheet action: neutral, warning, or destructive. */
enum class PoracodeTone { Neutral, Warning, Danger }

/** One drawer action (`m-sheet-action`): 16 dp line icon and a 14 sp muted label. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PoracodeSheetAction(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    description: String? = null,
    tone: PoracodeTone = PoracodeTone.Neutral,
    selected: Boolean = false,
    enabled: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val toneColor = when (tone) {
        PoracodeTone.Warning -> colors.warning
        PoracodeTone.Danger -> colors.danger
        PoracodeTone.Neutral -> null
    }
    val contentColor = when {
        !enabled -> colors.muted.copy(alpha = 0.5f)
        toneColor != null -> toneColor
        else -> colors.foreground
    }
    val iconTint = when {
        !enabled -> colors.muted.copy(alpha = 0.5f)
        toneColor != null -> toneColor
        else -> colors.foreground.copy(alpha = 0.8f)
    }
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(PoracodeRadius.small))
            .background(if (pressed) colors.rowActive else Color.Transparent)
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { this.selected = selected }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = iconTint)
        }
        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
            Text(
                label,
                style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                color = contentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!description.isNullOrBlank()) {
                Text(
                    description,
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        when {
            trailing != null -> trailing()
            selected -> Icon(
                PoracodeIcons.Check,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = colors.foreground,
            )
        }
    }
}
