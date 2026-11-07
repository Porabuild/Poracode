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
import androidx.compose.material3.SecondaryScrollableTabRow
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Checkbox
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
import com.poracode.app.session.projects.ForgeReviewEntry
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.protocol.forge.ForgeReviewOperation
import kotlinx.serialization.json.*
import com.poracode.app.ui.components.EmptyStateView

internal enum class PullRequestReviewTab { Overview, Files, Checks, Conversation, Guide }

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
    forge: ForgeReviewEntry? = null,
    canMutate: Boolean = false,
    guideWriters: List<AgentStatusEntry> = emptyList(),
    mutate: (ForgeReviewOperation, Map<String, JsonElement>) -> Unit = { _, _ -> },
    refreshGuide: suspend () -> Unit = {},
    finishReview: () -> Unit = {},
    editComment: suspend (Map<String, JsonElement>) -> Boolean = { false },
    metadata: ReviewMetadataActions = ReviewMetadataActions.None,
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
    val conversation = remember(entry.prReviews, details) {
        val value = entry.prReviews.pullRequestConversation()
        val inlineIds = value.threads.flatMap { it.comments }.map { it.id }.toSet()
        value.copy(comments = (details?.comments.orEmpty() + value.comments).filterNot { it.id in inlineIds }.distinctBy { it.id })
    }
    val checks = remember(entry.prChecks, details) {
        entry.prChecks.pullRequestChecks().ifEmpty { details?.checks.orEmpty() }
    }

    var tabName by rememberSaveable(number) { mutableStateOf(PullRequestReviewTab.Overview.name) }
    var openFile by rememberSaveable(number) { mutableStateOf("") }
    var metadataSheet by rememberSaveable(number) { mutableStateOf("") }
    val openMetadataSheet: (ReviewMetadataSheet) -> Unit = { metadataSheet = it.name }
    val tabs = PullRequestReviewTab.entries.filter { it != PullRequestReviewTab.Guide || forge?.capabilities?.boolean("reviewGuides") == true }
    val tab = tabs.firstOrNull { it.name == tabName }
        ?: PullRequestReviewTab.Overview

    Column(modifier.fillMaxSize()) {
        PullRequestHeader(details, number, branch)
        SecondaryScrollableTabRow(tabs.indexOf(tab), edgePadding = 0.dp) {
            tabs.forEach { candidate ->
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
                    PullRequestOverviewSection(details, Modifier.fillMaxSize(), metadata, openMetadataSheet)

                section == PullRequestReviewTab.Files ->
                    PullRequestFilesSection(files, Modifier.fillMaxSize(), forge, canMutate, mutate) { openFile = it }

                section == PullRequestReviewTab.Checks ->
                    PullRequestChecksSection(checks, Modifier.fillMaxSize())

                section == PullRequestReviewTab.Guide && forge != null ->
                    ForgeReviewGuidePane(forge, guideWriters, canMutate, mutate, refreshGuide, { openFile = it; tabName = PullRequestReviewTab.Files.name }, finishReview)

                else -> PullRequestConversationSection(
                    conversation,
                    details?.reviews.orEmpty(),
                    Modifier.fillMaxSize(),
                    forge, canMutate, editComment,
                    details?.requestedReviewers.orEmpty(), details?.timeline.orEmpty(), metadata, openMetadataSheet,
                )
            }
        }
    }
    when (metadataSheet) {
        ReviewMetadataSheet.Labels.name -> if (metadata.editing.labels) {
            LabelEditorSheet(details?.labels.orEmpty(), metadata) { metadataSheet = "" }
        }
        ReviewMetadataSheet.Reviewers.name -> if (metadata.editing.reviewRequests) {
            ReviewerEditorSheet(details?.requestedReviewers.orEmpty(), metadata) { metadataSheet = "" }
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
internal fun DiffCounts(additions: Long, deletions: Long) {
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
private fun PullRequestOverviewSection(
    details: PullRequestDetailsRow?,
    modifier: Modifier,
    metadata: ReviewMetadataActions,
    openSheet: (ReviewMetadataSheet) -> Unit,
) {
    if (details == null) {
        EmptyStateView(
            stringResource(R.string.github_details),
            stringResource(R.string.github_loading_details),
            modifier,
        )
        return
    }
    LazyColumn(modifier, contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        pullRequestLabelItems(details.labels, metadata, openSheet)
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
    forge: ForgeReviewEntry?,
    canMutate: Boolean,
    mutate: (ForgeReviewOperation, Map<String, JsonElement>) -> Unit,
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
                if (forge?.capabilities?.get("viewedFiles") is JsonPrimitive) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Checkbox(checked = forge.viewedState(file.path) == "viewed", onCheckedChange = {
                            forge.fingerprint(file.path)?.let { fingerprint ->
                                mutate(ForgeReviewOperation.SetPrFileViewed, mapOf("path" to JsonPrimitive(file.path),
                                    "fingerprint" to if (it) JsonPrimitive(fingerprint) else JsonNull))
                            }
                        }, enabled = canMutate && forge.fingerprint(file.path) != null)
                        Text(stringResource(if (forge.viewedState(file.path) == "changed") R.string.forge_review_changed
                            else if (forge.capabilities["viewedFiles"] == JsonPrimitive("forge")) R.string.forge_review_viewed_source else R.string.forge_review_viewed_host),
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
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
internal fun SectionHeader(title: String) {
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
    PullRequestReviewTab.Guide -> R.string.forge_review_guide
}
