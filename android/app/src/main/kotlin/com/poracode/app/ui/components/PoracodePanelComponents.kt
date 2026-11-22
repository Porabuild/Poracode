package com.poracode.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTheme
import kotlin.math.abs

/**
 * Floating glass capsule strip shared by the split sidebar footer and the
 * right-hand inspector tab bar (`PoracodePanelControlStrip` in the Poracode design system).
 */
@Composable
fun PoracodePanelControlStrip(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .height(PoracodeMetrics.tapTarget + 4.dp)
            .poracodeFloatingSurface(shape = CircleShape)
            .padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

enum class PanelResizeSide {
    /** Handle sits along the trailing edge of a leading panel (sidebar). */
    TrailingOfLeadingPanel,
    /** Handle sits along the leading edge of a trailing panel (inspector). */
    LeadingOfTrailingPanel,
}

/**
 * Subtle vertical hairline divider with a 16 dp touch/pointer drag target for resizing
 * the docked sidebar or inspector. Double-tapping resets to [defaultWidthDp].
 */
@Composable
fun PoracodePanelResizeHandle(
    side: PanelResizeSide,
    label: String,
    currentWidthDp: Float,
    defaultWidthDp: Float,
    allowedRangeDp: ClosedFloatingPointRange<Float>,
    onLiveResize: (Float) -> Unit,
    onCommit: (Float) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = PoracodeTheme.colors
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    var dragging by remember { mutableStateOf(false) }
    var dragWidthDp by remember { mutableFloatStateOf(currentWidthDp) }
    val latestCurrent by rememberUpdatedState(currentWidthDp)
    val latestRange by rememberUpdatedState(allowedRangeDp)
    val latestDefault by rememberUpdatedState(defaultWidthDp)
    val latestLive by rememberUpdatedState(onLiveResize)
    val latestCommit by rememberUpdatedState(onCommit)
    val latestReset by rememberUpdatedState(onReset)

    Box(
        modifier = modifier
            .width(if (enabled) 12.dp else 8.dp)
            .fillMaxHeight()
            .semantics { contentDescription = label }
            .then(
                if (enabled) {
                    Modifier
                        .pointerInput(side) {
                            detectTapGestures(
                                onDoubleTap = {
                                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    latestReset()
                                },
                            )
                        }
                        .pointerInput(side) {
                            var crossedDefault = false
                            detectHorizontalDragGestures(
                                onDragStart = {
                                    dragging = true
                                    dragWidthDp = latestCurrent
                                    crossedDefault = abs(dragWidthDp - latestDefault) < 6f
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                },
                                onDragCancel = {
                                    dragging = false
                                    latestCommit(dragWidthDp.coerceIn(latestRange.start, latestRange.endInclusive))
                                },
                                onDragEnd = {
                                    dragging = false
                                    latestCommit(dragWidthDp.coerceIn(latestRange.start, latestRange.endInclusive))
                                },
                                onHorizontalDrag = { change, dragAmountPx ->
                                    change.consume()
                                    val deltaDp = with(density) { dragAmountPx.toDp().value }
                                    val signedDelta = when (side) {
                                        PanelResizeSide.TrailingOfLeadingPanel -> deltaDp
                                        PanelResizeSide.LeadingOfTrailingPanel -> -deltaDp
                                    }
                                    val updated = (dragWidthDp + signedDelta)
                                        .coerceIn(latestRange.start, latestRange.endInclusive)
                                    dragWidthDp = updated
                                    val nearDefault = abs(updated - latestDefault) < 6f
                                    if (nearDefault && !crossedDefault) {
                                        crossedDefault = true
                                        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                                    } else if (!nearDefault) {
                                        crossedDefault = false
                                    }
                                    latestLive(updated)
                                },
                            )
                        }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (enabled) {
            Box(
                Modifier
                    .width(if (dragging) 4.dp else 3.dp)
                    .height(if (dragging) 40.dp else 28.dp)
                    .background(
                        if (dragging) colors.foreground.copy(alpha = 0.72f) else colors.muted.copy(alpha = 0.28f),
                        CircleShape,
                    ),
            )
        }
    }
}

/**
 * Full-height rounded Material 3 pane container (`16dp` corners, `colors.background`)
 * sitting inside a `colors.surface` multi-pane shell so panes separate cleanly by
 * tonal contrast and rounded geometry without hard `1dp` divider lines or top cut-offs.
 */
@Composable
fun PoracodePaneContainer(
    modifier: Modifier = Modifier,
    containerColor: Color? = null,
    content: @Composable () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(com.poracode.app.ui.theme.PoracodeRadius.pane)
    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(shape)
            .background(containerColor ?: colors.paneSurface),
    ) {
        content()
    }
}

fun Dp.coerceInRange(range: ClosedFloatingPointRange<Float>): Dp =
    value.coerceIn(range.start, range.endInclusive).dp
