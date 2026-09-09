package com.poracode.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
internal fun HomeQuickComposeContextChips(
    worktreeBranch: String?,
    showControls: Boolean,
    showCommands: Boolean,
    onPickWorktree: () -> Unit,
    onOpenControls: () -> Unit,
    onOpenCommands: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssistChip(
            onClick = onPickWorktree,
            // Measured last so the fixed-label chips keep their intrinsic
            // width; a long branch name ellipsizes instead of starving them.
            modifier = Modifier.weight(1f, fill = false),
            label = {
                Text(
                    worktreeBranch
                        ?: stringResource(R.string.home_quick_compose_current_branch),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            },
            leadingIcon = {
                Icon(Icons.Outlined.AccountTree, contentDescription = null)
            },
        )
        if (showControls) {
            AssistChip(
                onClick = onOpenControls,
                label = {
                    Text(
                        stringResource(R.string.home_quick_compose_controls),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                leadingIcon = {
                    Icon(Icons.Outlined.Tune, contentDescription = null)
                },
            )
        }
        if (showCommands) {
            AssistChip(
                onClick = onOpenCommands,
                label = {
                    Text(
                        stringResource(R.string.home_quick_compose_commands),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }
    }
}
