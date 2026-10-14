package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.session.richchat.RichChatHistoryNoticeState

/**
 * B1 durable history-incomplete banner. Renders server-truth notice state —
 * never a fabricated timeline item or provider error — with the explicit
 * acknowledgement action only when an actual descriptor was read.
 *
 * The explainer states the contract plainly: acknowledging permits continuing
 * with incomplete history; it neither restores the missing content nor
 * certifies that the producer stopped. Cumulative counters are presented as
 * lower bounds ("at least"), never as exact loss totals.
 */
@Composable
internal fun RichChatHistoryNoticeBanner(
    noticeState: RichChatHistoryNoticeState,
    canOperate: Boolean,
    onAcknowledge: () -> Unit,
    onRetryCheck: () -> Unit,
) {
    val notice = noticeState.notice
    val descriptor = noticeState.descriptor
    if (notice == null && descriptor == null) {
        if (noticeState.gapReadFailed) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                Text(
                    stringResource(R.string.rich_chat_history_notice_check_failed),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                Button(onClick = onRetryCheck) {
                    Text(stringResource(R.string.rich_chat_retry))
                }
            }
        }
        return
    }
    val source = notice?.source ?: descriptor?.source
    val reason = notice?.reason ?: descriptor?.reason
    val refusedEvents = notice?.refusedEvents ?: descriptor?.refusedEvents ?: 0L
    val refusedBytes = notice?.refusedBytes ?: descriptor?.refusedBytes ?: 0L
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Text(
            stringResource(R.string.rich_chat_history_notice_title),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.error,
        )
        Text(
            stringResource(R.string.rich_chat_history_notice_body),
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            stringResource(
                R.string.rich_chat_history_notice_detail,
                refusedEvents,
                formatLowerBoundBytes(refusedBytes),
                historyNoticeSourceText(source),
                historyNoticeReasonText(reason),
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (descriptor != null) {
            Button(
                onClick = onAcknowledge,
                enabled = canOperate && !noticeState.acknowledging,
                modifier = Modifier.padding(top = 4.dp),
            ) {
                Text(
                    stringResource(
                        if (noticeState.acknowledging) {
                            R.string.rich_chat_history_notice_ack_in_flight
                        } else {
                            R.string.rich_chat_history_notice_ack
                        },
                    ),
                )
            }
        }
    }
}

@Composable
private fun historyNoticeSourceText(source: String?): String = stringResource(
    when (source) {
        "exact" -> R.string.rich_chat_history_notice_source_exact
        "suspect" -> R.string.rich_chat_history_notice_source_suspect
        else -> R.string.rich_chat_history_notice_source_unknown
    },
)

@Composable
private fun historyNoticeReasonText(reason: String?): String = stringResource(
    when (reason) {
        "thread-events" -> R.string.rich_chat_history_notice_reason_thread_events
        "thread-bytes" -> R.string.rich_chat_history_notice_reason_thread_bytes
        "global-events" -> R.string.rich_chat_history_notice_reason_global_events
        "global-bytes" -> R.string.rich_chat_history_notice_reason_global_bytes
        "oversize" -> R.string.rich_chat_history_notice_reason_oversize
        "age" -> R.string.rich_chat_history_notice_reason_age
        "degraded" -> R.string.rich_chat_history_notice_reason_degraded
        "rebase-dropped" -> R.string.rich_chat_history_notice_reason_rebase_dropped
        "shutdown" -> R.string.rich_chat_history_notice_reason_shutdown
        "unclean-epoch" -> R.string.rich_chat_history_notice_reason_unclean_epoch
        else -> R.string.rich_chat_history_notice_reason_unknown
    },
)

/**
 * Locale-neutral lower-bound size label. The exact byte count is deliberately
 * not rendered as a loss total; unit suffixes are plain technical tokens.
 */
internal fun formatLowerBoundBytes(bytes: Long): String {
    if (bytes < 1_000L) return "$bytes B"
    val units = listOf("KB" to 1_000L, "MB" to 1_000_000L, "GB" to 1_000_000_000L)
    var index = 0
    while (index < units.size - 1 && bytes >= units[index + 1].second) index += 1
    val (label, scale) = units[index]
    val scaled = bytes.toDouble() / scale
    val text = if (scaled >= 100) {
        scaled.toLong().toString()
    } else {
        String.format(java.util.Locale.US, "%.1f", scaled)
    }
    return "$text $label"
}
