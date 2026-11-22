package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.storage.HomeWorkspace
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

internal fun workspaceIcon(icon: String): ImageVector = when (icon) {
    "rocket" -> PoracodeIcons.Rocket
    "palette" -> PoracodeIcons.ColorLens
    "code" -> PoracodeIcons.Code
    "building" -> PoracodeIcons.Building2
    "graduation" -> PoracodeIcons.GraduationCap
    "heart" -> PoracodeIcons.Heart
    "sprout" -> PoracodeIcons.Sprout
    "globe" -> PoracodeIcons.Public
    "lightbulb" -> PoracodeIcons.Lightbulb
    "music" -> PoracodeIcons.Music
    "gamepad" -> PoracodeIcons.Gamepad2
    else -> PoracodeIcons.Briefcase
}

/**
 * Compact workspace selector row in the split sidebar footer (and optional phone trigger).
 * Tapping opens a Poracode sheet listing all workspaces plus Manage Workspaces.
 */
@Composable
internal fun HomeWorkspacePicker(
    workspaces: List<HomeWorkspace>,
    activeWorkspaceId: String?,
    onSelectWorkspace: (String) -> Unit,
    onManageWorkspaces: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val active = workspaces.firstOrNull { it.id == activeWorkspaceId } ?: workspaces.firstOrNull()
    if (active == null) return
    val colors = PoracodeTheme.colors
    var sheetOpen by rememberSaveable { mutableStateOf(false) }
    val shape = RoundedCornerShape(PoracodeRadius.control)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = com.poracode.app.ui.theme.PoracodeMetrics.controlHeight)
            .clip(shape)
            .background(colors.fieldBackground)
            .border(1.dp, colors.hairlineSoft, shape)
            .clickable(role = Role.Button, onClick = { sheetOpen = true })
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            workspaceIcon(active.icon),
            contentDescription = null,
            modifier = Modifier.size(15.dp),
            tint = colors.muted,
        )
        Text(
            active.name,
            modifier = Modifier.weight(1f),
            style = PoracodeTextStyles.rowTitle,
            color = colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            PoracodeIcons.ChevronsUpDown,
            contentDescription = stringResource(R.string.home_switch_workspace),
            modifier = Modifier.size(14.dp),
            tint = colors.muted,
        )
    }

    if (sheetOpen) {
        PoracodeSheet(
            onDismissRequest = { sheetOpen = false },
            title = stringResource(R.string.home_workspaces_title),
        ) {
            workspaces.forEach { workspace ->
                val isSelected = workspace.id == active.id
                PoracodeSheetAction(
                    label = workspace.name,
                    icon = workspaceIcon(workspace.icon),
                    onClick = {
                        onSelectWorkspace(workspace.id)
                        sheetOpen = false
                    },
                    trailing = if (isSelected) {
                        {
                            Icon(
                                PoracodeIcons.Check,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = colors.foreground,
                            )
                        }
                    } else {
                        null
                    },
                )
            }
            PoracodeSheetDivider()
            PoracodeSheetAction(
                label = stringResource(R.string.home_manage_workspaces),
                icon = PoracodeIcons.Tune,
                onClick = {
                    sheetOpen = false
                    onManageWorkspaces()
                },
            )
        }
    }
}
