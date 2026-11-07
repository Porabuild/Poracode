package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.projects.ForgeReviewEntry
import com.poracode.app.ui.components.EmptyStateView
import kotlinx.serialization.json.JsonElement

@Composable
internal fun PullRequestConversationSection(
    conversation: PullRequestConversationRows,
    reviews: List<PullRequestReviewSummaryRow>,
    modifier: Modifier,
    forge: ForgeReviewEntry?,
    canMutate: Boolean,
    editComment: suspend (Map<String, JsonElement>) -> Boolean,
    requestedReviewers: List<PullRequestReviewerRow> = emptyList(),
    timeline: List<PullRequestTimelineRow> = emptyList(),
    metadata: ReviewMetadataActions = ReviewMetadataActions.None,
    openSheet: (ReviewMetadataSheet) -> Unit = {},
) {
    if (conversation.isEmpty && reviews.isEmpty() && requestedReviewers.isEmpty() && timeline.isEmpty() &&
        !metadata.editing.reviewRequests) {
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
                ForgeCommentEditor(conversation.comments[index], null, forge, canMutate, editComment)
            }
        }
        requestedReviewerItems(requestedReviewers, metadata, openSheet)
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
                                if (thread.line != null) "$it:${thread.line}" else it,
                                Modifier.weight(1f),
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (thread.isOldSide) {
                            Text(
                                stringResource(R.string.github_thread_old_side),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                    thread.comments.forEach { ConversationRow(it); ForgeCommentEditor(it, thread.id, forge, canMutate, editComment) }
                }
            }
        }
        pullRequestTimelineItems(timeline)
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

