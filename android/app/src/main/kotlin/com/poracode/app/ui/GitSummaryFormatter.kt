package com.poracode.app.ui

import com.poracode.app.model.RemoteGitSummary

/**
 * Formats a compact, truthful, accessible Git summary for the thread list and
 * the rich-chat header. Pure logic over injected [GitSummaryTemplates] so the
 * shape is unit-testable without Android resources; production supplies the
 * templates resolved from `git_summary.xml` for the current locale.
 */
object GitSummaryFormatter {

    /** Resolved format strings for the current locale. */
    data class GitSummaryTemplates(
        val aheadBehind: String,
        val additionsDeletions: String,
        val notRepo: String,
        val pullRequest: String,
        val stateDescription: String,
    )

    /** Compact one-line summary; empty when there is nothing to show. */
    fun compact(summary: RemoteGitSummary?, templates: GitSummaryTemplates): String {
        if (summary == null) return ""
        if (!summary.isRepo) return templates.notRepo
        val parts = ArrayList<String>()
        if (summary.branch.isNotEmpty()) parts += summary.branch
        if (summary.ahead != 0 || summary.behind != 0) {
            parts += templates.aheadBehind.format(summary.ahead, summary.behind)
        }
        if (summary.totalInsertions != 0 || summary.totalDeletions != 0) {
            parts += templates.additionsDeletions.format(summary.totalInsertions, summary.totalDeletions)
        }
        summary.pr?.let { parts += templates.pullRequest.format(it.number) }
        return parts.joinToString(" · ")
    }

    /** Visible PR label, or empty. */
    fun pullRequestLabel(summary: RemoteGitSummary?, templates: GitSummaryTemplates): String =
        summary?.pr?.let { templates.pullRequest.format(it.number) }.orEmpty()

    /**
     * Accessibility state description for the summary surface. Empty when there
     * is no repo; otherwise narrates branch + ahead/behind so a screen reader
     * conveys the same signal as the compact text.
     */
    fun stateDescription(summary: RemoteGitSummary?, templates: GitSummaryTemplates): String {
        if (summary == null || !summary.isRepo) return if (summary != null && !summary.isRepo) templates.notRepo else ""
        val prSuffix = summary.pr?.let { " " + templates.pullRequest.format(it.number) }.orEmpty()
        @Suppress("UnnecessaryVariable")
        val suffix = prSuffix
        return templates.stateDescription.format(summary.branch, summary.ahead, summary.behind) + suffix
    }
}
