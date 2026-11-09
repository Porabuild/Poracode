package com.poracode.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.RemoteGitPrSummary
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Compose bindings for [GitSummaryFormatter]. Resolves the localized templates
 * from [R.string.git_summary_*] (pure-logic formatter stays resource-free) and
 * renders a compact one-line Git summary with an accessible state description.
 *
 * Rendering is deliberate about absence: the line is emitted only when the
 * summary carries signal ([RemoteGitSummary.hasSignal]). A clean repo, a not-yet-
 * loaded thread, and a cleared (host-switched/unpaired) cache all render nothing,
 * so a stale summary can never linger after the exact-host cache is cleared.
 */
object GitSummaryText {

    /** Resolves the current locale's format templates; stable across recomposition. */
    @Composable
    fun rememberTemplates(): GitSummaryFormatter.GitSummaryTemplates {
        val aheadBehind = stringResource(R.string.git_summary_ahead_behind)
        val additionsDeletions = stringResource(R.string.git_summary_additions_deletions)
        val notRepo = stringResource(R.string.git_summary_not_repo)
        val pullRequest = stringResource(R.string.git_summary_pull_request)
        val stateDescription = stringResource(R.string.git_summary_state_description)
        return remember(aheadBehind, additionsDeletions, notRepo, pullRequest, stateDescription) {
            GitSummaryFormatter.GitSummaryTemplates(
                aheadBehind = aheadBehind,
                additionsDeletions = additionsDeletions,
                notRepo = notRepo,
                pullRequest = pullRequest,
                stateDescription = stateDescription,
            )
        }
    }

    /**
     * Compact single-line Git summary for a thread row or header. Emits nothing
     * (returns without rendering) when [summary] is null or carries no signal.
     */
    @Composable
    fun CompactLine(
        summary: RemoteGitSummary?,
        modifier: Modifier = Modifier,
        maxLines: Int = 1,
    ) {
        if (summary?.hasSignal != true) return
        val templates = rememberTemplates()
        val compact = GitSummaryFormatter.compact(summary, templates)
        if (compact.isEmpty()) return
        val description = GitSummaryFormatter.stateDescription(summary, templates)
        Text(
            text = compact,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            modifier = modifier.semantics {
                if (description.isNotEmpty()) contentDescription = description
            },
        )
    }

    /**
     * Compact per-part Git badge for a thread row, mirroring the iOS
     * `ThreadGitSummaryBadge`: branch, then `+N`/`−M` diff counts in success /
     * danger with monospaced digits, then divergence and the pull-request label.
     * Emits nothing when [summary] is null or carries no signal.
     */
    @Composable
    fun ThreadBadge(
        summary: RemoteGitSummary?,
        modifier: Modifier = Modifier,
        showsBranch: Boolean = true,
    ) {
        if (summary?.hasSignal != true) return
        val colors = PoracodeTheme.colors
        val templates = rememberTemplates()
        val description = GitSummaryFormatter.stateDescription(summary, templates)
        Row(
            modifier = modifier.semantics {
                if (description.isNotEmpty()) contentDescription = description
            },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (showsBranch && summary.branch.isNotEmpty()) {
                Icon(
                    PoracodeIcons.AccountTree,
                    contentDescription = null,
                    tint = colors.gitBranchTone,
                    modifier = Modifier.size(10.dp),
                )
                Text(
                    summary.branch,
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (summary.totalInsertions > 0) {
                Text(
                    "+${summary.totalInsertions}",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = colors.success,
                )
            }
            if (summary.totalDeletions > 0) {
                Text(
                    "−${summary.totalDeletions}",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = colors.danger,
                )
            }
            if (summary.ahead != 0 || summary.behind != 0) {
                Text(
                    templates.aheadBehind.format(summary.ahead, summary.behind),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.muted,
                    maxLines = 1,
                )
            }
            summary.pr?.let { pr ->
                Text(
                    templates.pullRequest.format(pr.number),
                    style = MaterialTheme.typography.labelSmall,
                    color = pullRequestTone(pr, colors),
                    maxLines = 1,
                )
            }
        }
    }

    @Composable
    private fun pullRequestTone(pr: RemoteGitPrSummary, colors: com.poracode.app.ui.theme.PoracodeColors): Color {
        val state = pr.state.lowercase()
        return when {
            pr.isDraft || state == "draft" -> colors.muted
            state.contains("merge") -> colors.accentSoftForeground
            state == "open" -> colors.success
            state == "closed" -> colors.danger
            else -> colors.muted
        }
    }
}
