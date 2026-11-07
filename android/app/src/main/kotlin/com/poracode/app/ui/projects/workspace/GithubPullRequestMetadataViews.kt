package com.poracode.app.ui.projects.workspace

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import java.time.Instant
import java.time.OffsetDateTime

/** A label chip: the host color when present, a neutral surface otherwise. */
@Composable
internal fun PullRequestLabelChip(label: PullRequestLabelRow, modifier: Modifier = Modifier) {
    val background = label.color?.let(::labelColor) ?: MaterialTheme.colorScheme.surfaceVariant
    val foreground = if (label.color == null) MaterialTheme.colorScheme.onSurfaceVariant
    else if (background.luminance() > LABEL_LIGHT_LUMINANCE) Color.Black else Color.White
    Surface(modifier, shape = RoundedCornerShape(50), color = background, contentColor = foreground) {
        Text(
            label.name,
            Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PullRequestLabelChips(labels: List<PullRequestLabelRow>, modifier: Modifier = Modifier) {
    if (labels.isEmpty()) return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        labels.forEach { PullRequestLabelChip(it) }
    }
}

/** Labels block of the overview, with the editor entry point when the host allows it. */
internal fun LazyListScope.pullRequestLabelItems(
    labels: List<PullRequestLabelRow>,
    metadata: ReviewMetadataActions,
    open: (ReviewMetadataSheet) -> Unit,
) {
    if (labels.isEmpty() && !metadata.editing.labels) return
    item("labels") {
        SectionHeader(stringResource(R.string.forge_review_labels))
        if (labels.isEmpty()) {
            Text(
                stringResource(R.string.forge_review_labels_none),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else PullRequestLabelChips(labels)
        if (metadata.editing.labels) {
            OutlinedButton(
                { open(ReviewMetadataSheet.Labels) },
                Modifier.padding(top = 8.dp),
                enabled = metadata.enabled,
            ) { Text(stringResource(R.string.forge_review_edit_labels)) }
        }
    }
}

/** Requested reviewers next to the review verdicts; a team request is marked as such. */
internal fun LazyListScope.requestedReviewerItems(
    reviewers: List<PullRequestReviewerRow>,
    metadata: ReviewMetadataActions,
    open: (ReviewMetadataSheet) -> Unit,
) {
    if (reviewers.isEmpty() && !metadata.editing.reviewRequests) return
    item("requested-reviewers-header") { SectionHeader(stringResource(R.string.forge_review_requested_reviewers)) }
    if (reviewers.isEmpty()) item("requested-reviewers-none") {
        Text(
            stringResource(R.string.forge_review_no_requested_reviewers),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    items(reviewers.size, key = { "q${reviewers[it].id}" }) { index ->
        ReviewerLine(reviewers[index], Modifier.padding(vertical = 4.dp))
    }
    if (metadata.editing.reviewRequests) item("requested-reviewers-edit") {
        OutlinedButton(
            { open(ReviewMetadataSheet.Reviewers) },
            Modifier.padding(top = 8.dp),
            enabled = metadata.enabled,
        ) { Text(stringResource(R.string.forge_review_request_review)) }
    }
}

@Composable
internal fun ReviewerLine(reviewer: PullRequestReviewerRow, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(reviewer.displayName, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (reviewer.displayName != reviewer.login) Text(
                reviewer.login,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (reviewer.team) Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.secondaryContainer) {
            Text(
                stringResource(R.string.forge_review_reviewer_team),
                Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}

internal fun LazyListScope.pullRequestTimelineItems(timeline: List<PullRequestTimelineRow>) {
    if (timeline.isEmpty()) return
    item("timeline-header") { SectionHeader(stringResource(R.string.forge_review_timeline)) }
    items(timeline.size, key = { "e${timeline[it].id}" }) { index ->
        val event = timeline[index]
        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Text(timelineTitle(event), style = MaterialTheme.typography.bodyMedium)
            val meta = listOfNotNull(event.actor, relativeTime(event.createdAt))
            if (meta.isNotEmpty()) Text(
                meta.joinToString(stringResource(R.string.forge_review_timeline_separator)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun timelineTitle(event: PullRequestTimelineRow): String {
    val none = ""
    return when (event.kind) {
        "opened" -> stringResource(R.string.forge_review_timeline_opened)
        "closed" -> stringResource(R.string.forge_review_timeline_closed)
        "reopened" -> stringResource(R.string.forge_review_timeline_reopened)
        "merged" -> stringResource(R.string.forge_review_timeline_merged)
        "ready" -> stringResource(R.string.forge_review_timeline_ready)
        "draft" -> stringResource(R.string.forge_review_timeline_draft)
        "labeled" -> stringResource(R.string.forge_review_timeline_labeled, event.labelName ?: none)
        "unlabeled" -> stringResource(R.string.forge_review_timeline_unlabeled, event.labelName ?: none)
        "review-requested" -> stringResource(R.string.forge_review_timeline_review_requested, event.reviewer ?: none)
        "review-request-removed" -> stringResource(R.string.forge_review_timeline_review_request_removed, event.reviewer ?: none)
        "force-pushed" -> stringResource(R.string.forge_review_timeline_force_pushed)
        "base-changed" -> stringResource(R.string.forge_review_timeline_base_changed, event.fromRef ?: none, event.toRef ?: none)
        "renamed" -> stringResource(R.string.forge_review_timeline_renamed, event.fromRef ?: none, event.toRef ?: none)
        else -> event.text ?: stringResource(R.string.forge_review_timeline_system)
    }
}

internal fun labelColor(hex: String): Color = Color(LABEL_OPAQUE or hex.toLong(16))

internal fun timelineInstantMillis(value: String): Long? =
    runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }.getOrNull()

private fun relativeTime(value: String): String? = timelineInstantMillis(value)?.let {
    DateUtils.getRelativeTimeSpanString(
        it,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
        DateUtils.FORMAT_ABBREV_RELATIVE,
    ).toString()
}

private const val LABEL_OPAQUE = 0xFF000000L
private const val LABEL_LIGHT_LUMINANCE = 0.5f
