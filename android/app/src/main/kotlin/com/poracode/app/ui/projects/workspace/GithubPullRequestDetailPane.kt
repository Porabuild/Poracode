package com.poracode.app.ui.projects.workspace

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.GithubOperationsEntry
import com.poracode.app.ui.components.EmptyStateView

internal enum class PullRequestReviewTab { Overview, Files, Checks, Conversation }

/**
 * Structured pull-request review surface: the Android counterpart of the iOS
 * `PullRequestReviewPageView` sections, rendered with Material 3 lists instead of raw JSON.
 */
@Composable
internal fun GithubPullRequestDetailPane(
    entry: GithubOperationsEntry,
    number: Long,
    branch: String,
    modifier: Modifier = Modifier,
) {
    if (number <= 0) {
        EmptyStateView(
            stringResource(R.string.github_pull_requests),
            stringResource(R.string.github_select_pr),
            modifier,
        )
        return
    }
    val details = remember(entry.prDetails) { entry.prDetails.pullRequestDetails() }
    val files = remember(entry.prFiles) { entry.prFiles.pullRequestFiles() }
    val diff = remember(entry.prDiff) { entry.prDiff.pullRequestDiff() }
    val conversation = remember(entry.prReviews) { entry.prReviews.pullRequestConversation() }
    val checks = remember(entry.prChecks, details) {
        entry.prChecks.pullRequestChecks().ifEmpty { details?.checks.orEmpty() }
    }

    var tabName by rememberSaveable(number) { mutableStateOf(PullRequestReviewTab.Overview.name) }
    var openFile by rememberSaveable(number) { mutableStateOf("") }
    val tab = PullRequestReviewTab.entries.firstOrNull { it.name == tabName }
        ?: PullRequestReviewTab.Overview

    Column(modifier.fillMaxSize()) {
        PullRequestHeader(details, number, branch)
        SecondaryTabRow(tab.ordinal) {
            PullRequestReviewTab.entries.forEach { candidate ->
                Tab(
                    selected = tab == candidate,
                    onClick = {
                        tabName = candidate.name
                        openFile = ""
                    },
                    text = { Text(stringResource(reviewTabLabel(candidate))) },
                )
            }
        }
        AnimatedContent(
            targetState = tab to openFile,
            transitionSpec = { androidx.compose.animation.fadeIn() togetherWith androidx.compose.animation.fadeOut() },
            label = "pull-request-review-section",
        ) { (section, path) ->
            when {
                section == PullRequestReviewTab.Files && path.isNotEmpty() -> Column(Modifier.fillMaxSize()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton({ openFile = "" }) {
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowBack,
                                stringResource(R.string.github_back_to_files),
                            )
                        }
                        Text(
                            stringResource(R.string.github_files),
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                    UnifiedDiffView(
                        title = path,
                        diff = remember(path, diff) { unifiedDiffChunk(path, diff) },
                        emptyMessage = stringResource(R.string.github_no_diff),
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                section == PullRequestReviewTab.Overview ->
                    PullRequestOverviewSection(details, Modifier.fillMaxSize())

                section == PullRequestReviewTab.Files ->
                    PullRequestFilesSection(files, Modifier.fillMaxSize()) { openFile = it }

                section == PullRequestReviewTab.Checks ->
                    PullRequestChecksSection(checks, Modifier.fillMaxSize())

                else -> PullRequestConversationSection(
                    conversation,
                    details?.reviews.orEmpty(),
                    Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun PullRequestHeader(
    details: PullRequestDetailsRow?,
    number: Long,
    branch: String,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            details?.title.orEmpty().ifEmpty { stringResource(R.string.github_pr_number, number) },
            style = MaterialTheme.typography.titleMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            stringResource(
                R.string.github_pr_branches,
                number,
                details?.headBranch.orEmpty().ifEmpty { branch },
                details?.baseBranch.orEmpty(),
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (details != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                details.author?.login?.takeIf(String::isNotBlank)?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
                DiffCounts(details.additions, details.deletions)
                Text(
                    stringResource(R.string.github_changed_files, details.changedFiles),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun DiffCounts(additions: Long, deletions: Long) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            stringResource(R.string.github_additions, additions),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.tertiary,
        )
        Text(
            stringResource(R.string.github_deletions, deletions),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun PullRequestOverviewSection(details: PullRequestDetailsRow?, modifier: Modifier) {
    if (details == null) {
        EmptyStateView(
            stringResource(R.string.github_details),
            stringResource(R.string.github_loading_details),
            modifier,
        )
        return
    }
    LazyColumn(modifier, contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        if (details.body.isNotBlank()) {
            item("description") {
                SectionHeader(stringResource(R.string.github_description))
                Text(details.body.take(MAX_GITHUB_TEXT), style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (details.commits.isNotEmpty()) {
            item("commits-header") { SectionHeader(stringResource(R.string.github_commits)) }
            items(details.commits.size, key = { details.commits[it].oid }) { index ->
                val commit = details.commits[index]
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text(
                        commit.headline,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        commit.abbreviatedOid,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun PullRequestFilesSection(
    files: List<PullRequestFileRow>,
    modifier: Modifier,
    onOpen: (String) -> Unit,
) {
    if (files.isEmpty()) {
        EmptyStateView(
            stringResource(R.string.github_files),
            stringResource(R.string.github_no_files),
            modifier,
        )
        return
    }
    LazyColumn(modifier) {
        items(files.size, key = { files[it].path }) { index ->
            val file = files[index]
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(file.path) }
                    .semantics { role = Role.Button }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    file.path,
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                DiffCounts(file.additions, file.deletions)
            }
            HorizontalDivider()
        }
    }
}

@Composable
private fun PullRequestChecksSection(checks: List<PullRequestCheckRow>, modifier: Modifier) {
    if (checks.isEmpty()) {
        EmptyStateView(
            stringResource(R.string.github_checks),
            stringResource(R.string.github_no_checks),
            modifier,
        )
        return
    }
    val uriHandler = LocalUriHandler.current
    LazyColumn(modifier) {
        items(checks.size, key = { checks[it].key }) { index ->
            val check = checks[index]
            val url = check.url
            Row(
                Modifier
                    .fillMaxWidth()
                    .then(
                        if (url == null) Modifier
                        else Modifier
                            .clickable { uriHandler.openUri(url) }
                            .semantics { role = Role.Button },
                    )
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val tone = githubStatusTone(check.state, check.conclusion)
                Icon(statusIcon(tone), null, tint = statusTint(tone))
                Column(Modifier.weight(1f)) {
                    Text(check.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                    check.workflowName?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    check.conclusion.ifBlank { check.state },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (url != null) {
                    Icon(
                        Icons.Outlined.NorthEast,
                        stringResource(R.string.github_open_externally),
                        Modifier.padding(start = 2.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable
private fun PullRequestConversationSection(
    conversation: PullRequestConversationRows,
    reviews: List<PullRequestReviewSummaryRow>,
    modifier: Modifier,
) {
    if (conversation.isEmpty && reviews.isEmpty()) {
        EmptyStateView(
            stringResource(R.string.github_conversation),
            stringResource(R.string.github_no_conversation),
            modifier,
        )
        return
    }
    LazyColumn(modifier, contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        if (conversation.comments.isNotEmpty()) {
            item("comments-header") { SectionHeader(stringResource(R.string.github_comments)) }
            items(conversation.comments.size, key = { "c${conversation.comments[it].id}" }) { index ->
                ConversationRow(conversation.comments[index])
            }
        }
        if (reviews.isNotEmpty()) {
            item("reviews-header") { SectionHeader(stringResource(R.string.github_reviews)) }
            items(reviews.size, key = { "r${reviews[it].id}" }) { index ->
                val review = reviews[index]
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(review.author, style = MaterialTheme.typography.titleSmall)
                        AssistChip({}, { Text(review.state) }, enabled = false)
                    }
                    if (review.body.isNotBlank()) {
                        Text(review.body, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
        if (conversation.threads.isNotEmpty()) {
            item("threads-header") { SectionHeader(stringResource(R.string.github_review_threads)) }
            items(conversation.threads.size, key = { "t${conversation.threads[it].id}" }) { index ->
                val thread = conversation.threads[index]
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        thread.path?.let {
                            Text(
                                it,
                                Modifier.weight(1f),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Icon(
                            if (thread.isResolved) Icons.Outlined.CheckCircle else Icons.Outlined.Error,
                            stringResource(
                                if (thread.isResolved) {
                                    R.string.github_thread_resolved
                                } else {
                                    R.string.github_thread_unresolved
                                },
                            ),
                            tint = if (thread.isResolved) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.tertiary
                            },
                        )
                    }
                    thread.comments.forEach { ConversationRow(it) }
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(comment: PullRequestCommentRow) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(comment.author, style = MaterialTheme.typography.titleSmall)
        if (comment.body.isNotBlank()) {
            Text(comment.body.take(MAX_GITHUB_TEXT), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        Modifier.padding(top = 12.dp, bottom = 4.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
    )
}

private fun statusIcon(tone: GithubStatusTone): ImageVector = when (tone) {
    GithubStatusTone.Success -> Icons.Outlined.CheckCircle
    GithubStatusTone.Failure -> Icons.Outlined.Error
    GithubStatusTone.Pending -> Icons.Outlined.Schedule
    GithubStatusTone.Neutral -> Icons.Outlined.RadioButtonUnchecked
}

@Composable
internal fun statusTint(tone: GithubStatusTone): Color = when (tone) {
    GithubStatusTone.Success -> MaterialTheme.colorScheme.tertiary
    GithubStatusTone.Failure -> MaterialTheme.colorScheme.error
    GithubStatusTone.Pending -> MaterialTheme.colorScheme.secondary
    GithubStatusTone.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
}

@Composable
internal fun GithubStatusIcon(status: String, conclusion: String, description: String?) {
    val tone = githubStatusTone(status, conclusion)
    Icon(statusIcon(tone), description, tint = statusTint(tone))
}

private fun reviewTabLabel(tab: PullRequestReviewTab) = when (tab) {
    PullRequestReviewTab.Overview -> R.string.github_overview
    PullRequestReviewTab.Files -> R.string.github_files
    PullRequestReviewTab.Checks -> R.string.github_checks
    PullRequestReviewTab.Conversation -> R.string.github_conversation
}
