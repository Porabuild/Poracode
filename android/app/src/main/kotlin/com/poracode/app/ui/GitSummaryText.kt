package com.poracode.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import com.poracode.app.R
import com.poracode.app.model.RemoteGitSummary

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
}
