package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeBottomBar
import com.poracode.app.ui.components.PoracodeCircleButton
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.poracodeFloatingSurface
import com.poracode.app.ui.theme.PoracodeIcons

/**
 * Floating workspace chrome: back leading, a Files/Git/GitHub segmented pill in a
 * glass capsule centered, and a per-section refresh trailing. Overlaid on the
 * panes so the segmented control frosts the content scrolling beneath it.
 */
@Composable
internal fun ProjectWorkspaceBottomBar(
    section: ProjectWorkspaceSection,
    refreshEnabled: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onSelectSection: (ProjectWorkspaceSection) -> Unit,
    modifier: Modifier = Modifier,
) {
    PoracodeBottomBar(
        modifier = modifier,
        leading = {
            PoracodeCircleButton(
                icon = PoracodeIcons.ArrowBack,
                contentDescription = stringResource(R.string.back),
                onClick = onBack,
            )
        },
        trailing = {
            PoracodeCircleButton(
                icon = PoracodeIcons.Refresh,
                contentDescription = stringResource(R.string.workspace_refresh),
                onClick = onRefresh,
                enabled = refreshEnabled,
            )
        },
        center = {
            Box(
                Modifier
                    .fillMaxWidth()
                    .poracodeFloatingSurface(shape = RoundedCornerShape(24.dp)),
            ) {
                PoracodeSegmentedControl(
                    options = ProjectWorkspaceSection.entries.map { candidate ->
                        stringResource(
                            when (candidate) {
                                ProjectWorkspaceSection.Files -> R.string.workspace_files
                                ProjectWorkspaceSection.Git -> R.string.workspace_git
                                ProjectWorkspaceSection.Github -> R.string.workspace_github
                            },
                        )
                    },
                    selectedIndex = section.ordinal,
                    onSelect = { index ->
                        onSelectSection(ProjectWorkspaceSection.entries[index])
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("workspace_mode_switch"),
                    containerColor = Color.Transparent,
                    segmentTestTags = listOf(
                        "workspace_files",
                        "workspace_git",
                        "workspace_github",
                    ),
                )
            }
        },
    )
}
