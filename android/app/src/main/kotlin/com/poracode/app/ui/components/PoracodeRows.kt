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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.selectableGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/** Uppercase section label above a group of rows (`text-[11px] uppercase tracking`). */
@Composable
fun PoracodeSectionLabel(text: String, modifier: Modifier = Modifier) {
    val locale = LocalConfiguration.current.locales[0]
    Text(
        text.uppercase(locale),
        modifier = modifier
            .padding(start = 4.dp)
            .semantics { heading() },
        style = PoracodeTextStyles.sectionLabel.copy(letterSpacing = 0.4.sp),
        color = PoracodeTheme.colors.muted,
    )
}

/**
 * Settings/index navigation row (`m-settings-row`): one card per destination with
 * an icon tile, title, optional muted subtitle, and a trailing chevron.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PoracodeNavRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    subtitle: String? = null,
    enabled: Boolean = true,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = if (subtitle == null) PoracodeMetrics.tapTarget else 52.dp)
            .clip(RoundedCornerShape(PoracodeRadius.row))
            .background(
                if (pressed) colors.rowActive.compositeOver(colors.listRow) else colors.listRow,
            )
            .semantics(mergeDescendants = true) {}
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Box(
                Modifier
                    .size(28.dp)
                    .border(1.dp, colors.hairline, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = colors.foreground.copy(alpha = 0.8f),
                )
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.labelLarge,
                color = colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (trailing != null) {
            trailing()
        } else {
            Icon(
                PoracodeIcons.KeyboardArrowRight,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = colors.muted,
            )
        }
    }
}

/**
 * Project name, host icon, and host name line shared by home rows and the thread
 * header. [online] marks a live host with a small success dot on the icon.
 */
@Composable
internal fun PoracodeProjectHostLine(
    project: String,
    host: String,
    modifier: Modifier = Modifier,
    online: Boolean = false,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            project,
            modifier = Modifier.widthIn(max = 180.dp),
            style = PoracodeTextStyles.rowMeta,
            color = colors.muted.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(Modifier.size(10.dp)) {
            Icon(
                PoracodeIcons.Computer,
                contentDescription = null,
                tint = colors.muted.copy(alpha = 0.6f),
                modifier = Modifier.size(10.dp),
            )
            if (online) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 2.dp, y = 2.dp)
                        .size(4.dp)
                        .background(colors.success, CircleShape),
                )
            }
        }
        Text(
            host,
            style = PoracodeTextStyles.rowMeta,
            color = colors.muted.copy(alpha = 0.6f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Equal-weight segmented control (`m-segmented`): raised selected segment on a neutral track. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PoracodeSegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    containerColor: Color? = null,
    segmentTestTags: List<String>? = null,
) {
    val colors = PoracodeTheme.colors
    val haptics = LocalHapticFeedback.current
    Row(
        modifier = modifier
            .height(36.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(containerColor ?: colors.default)
            .padding(2.dp)
            .semantics { selectableGroup() },
    ) {
        options.forEachIndexed { index, option ->
            val selected = index == selectedIndex
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .scale(rememberPressScale(interaction))
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        when {
                            selected -> colors.segment
                            pressed -> colors.rowActive
                            else -> Color.Transparent
                        },
                    )
                    .combinedClickable(
                        interactionSource = interaction,
                        indication = null,
                        enabled = enabled,
                        role = Role.RadioButton,
                        onClick = {
                            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                            onSelect(index)
                        },
                    )
                    .semantics { this.selected = selected }
                    .then(
                        segmentTestTags?.getOrNull(index)
                            ?.let { Modifier.testTag(it) }
                            ?: Modifier,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    option,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) colors.foreground else colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
