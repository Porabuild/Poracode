package com.poracode.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.poracode.app.R
import com.poracode.app.storage.DeviceSettingsPreferences
import com.poracode.app.storage.DeviceSettingsState
import com.poracode.app.storage.HomeShortcut
import com.poracode.app.ui.components.PoracodeSwitch
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Home shortcut visibility + order. Reordering is drag-and-drop from the grip
 * handle (long-press, then drag), as in the PWA usage rail; VoiceOver/TalkBack
 * keep move-up/move-down as custom actions on the same handle.
 */
@Composable
internal fun HomeShortcutSettingsSection(
    state: DeviceSettingsState,
    preferences: DeviceSettingsPreferences,
) {
    var dragging by remember { mutableStateOf<HomeShortcut?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    var rowHeightPx by remember { mutableFloatStateOf(0f) }
    val spacingPx = with(LocalDensity.current) { 10.dp.toPx() }
    SettingsSection(stringResource(R.string.settings_home_shortcuts)) {
        Text(
            stringResource(R.string.settings_home_shortcuts_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.homeShortcutOrder.forEachIndexed { index, shortcut ->
            HomeShortcutSettingsRow(
                shortcut = shortcut,
                index = index,
                count = state.homeShortcutOrder.size,
                visible = shortcut !in state.hiddenHomeShortcuts,
                preferences = preferences,
                order = state.homeShortcutOrder,
                isDragging = dragging == shortcut,
                dragOffset = if (dragging == shortcut) dragOffset else 0f,
                rowStepPx = rowHeightPx + spacingPx,
                onRowMeasured = { height ->
                    if (height > 0f) rowHeightPx = height
                },
                onDragStart = {
                    dragging = shortcut
                    dragOffset = 0f
                },
                onDragOffsetChange = { dragOffset = it },
                onDragEnd = {
                    dragging = null
                    dragOffset = 0f
                },
            )
        }
    }
}

@Composable
private fun HomeShortcutSettingsRow(
    shortcut: HomeShortcut,
    index: Int,
    count: Int,
    visible: Boolean,
    preferences: DeviceSettingsPreferences,
    order: List<HomeShortcut>,
    isDragging: Boolean,
    dragOffset: Float,
    rowStepPx: Float,
    onRowMeasured: (Float) -> Unit,
    onDragStart: () -> Unit,
    onDragOffsetChange: (Float) -> Unit,
    onDragEnd: () -> Unit,
) {
    val label = stringResource(shortcut.labelResource())
    val reorderLabel = stringResource(R.string.settings_home_shortcut_reorder, label)
    val moveUpLabel = stringResource(R.string.settings_home_shortcut_move_up, label)
    val moveDownLabel = stringResource(R.string.settings_home_shortcut_move_down, label)
    val haptics = LocalHapticFeedback.current
    val currentOrder by rememberUpdatedState(order)
    val currentOffset by rememberUpdatedState(dragOffset)
    val colors = PoracodeTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .onSizeChanged { onRowMeasured(it.height.toFloat()) }
            .zIndex(if (isDragging) 1f else 0f)
            .graphicsLayer { translationY = if (isDragging) dragOffset else 0f }
            .then(
                if (isDragging) {
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.listRow)
                } else {
                    Modifier
                },
            )
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier
                .size(36.dp)
                .semantics {
                    contentDescription = reorderLabel
                    customActions = listOf(
                        CustomAccessibilityAction(moveUpLabel) {
                            if (index <= 0) {
                                false
                            } else {
                                preferences.moveHomeShortcut(shortcut, -1)
                                true
                            }
                        },
                        CustomAccessibilityAction(moveDownLabel) {
                            if (index >= count - 1) {
                                false
                            } else {
                                preferences.moveHomeShortcut(shortcut, 1)
                                true
                            }
                        },
                    )
                }
                .pointerInput(shortcut) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDragStart()
                        },
                        onDragEnd = onDragEnd,
                        onDragCancel = onDragEnd,
                        onDrag = { change, dragAmount ->
                            change.consume()
                            if (rowStepPx <= 0f) return@detectDragGesturesAfterLongPress
                            var offset = currentOffset + dragAmount.y
                            // Swap with the neighbour once the dragged row
                            // crosses half a row, then re-centre the offset.
                            while (offset > rowStepPx / 2f &&
                                currentOrder.indexOf(shortcut) < currentOrder.lastIndex
                            ) {
                                preferences.moveHomeShortcut(shortcut, 1)
                                offset -= rowStepPx
                            }
                            while (offset < -rowStepPx / 2f &&
                                currentOrder.indexOf(shortcut) > 0
                            ) {
                                preferences.moveHomeShortcut(shortcut, -1)
                                offset += rowStepPx
                            }
                            onDragOffsetChange(offset)
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                PoracodeIcons.GripVertical,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = colors.muted,
            )
        }
        Text(label, Modifier.weight(1f))
        PoracodeSwitch(
            checked = visible,
            onCheckedChange = { preferences.setHomeShortcutVisible(shortcut, it) },
        )
    }
}

private fun HomeShortcut.labelResource(): Int = when (this) {
    HomeShortcut.PullRequests -> R.string.github_pull_requests
    HomeShortcut.GithubActions -> R.string.github_actions
    HomeShortcut.Schedules -> R.string.remote_integrations_schedules
}
