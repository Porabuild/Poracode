package com.poracode.app.ui.richchat

import androidx.annotation.PluralsRes
import com.poracode.app.R
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichVisibleTimelineNode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * One counted bucket of a collapsed activity group, already sorted the way the
 * PWA orders `summarizeToolCalls` sections: higher count first, then category
 * priority. [iconKey] reuses the row icon vocabulary; [added]/[removed] carry
 * the aggregated edit diff only for the file-change bucket.
 */
internal data class ActivitySummarySegment(
    val iconKey: String,
    val count: Int,
    val added: Int,
    val removed: Int,
    val hasDiff: Boolean,
)

/**
 * Collapse a tool-call group's members into PWA-worded summary segments. Only
 * the canonical activity types Android already groups on are used; anything
 * that is not a view/search/edit/command falls back to the generic tool word,
 * matching the PWA `other` bucket.
 */
internal fun activitySummarySegments(
    members: List<RichVisibleTimelineNode>,
): List<ActivitySummarySegment> {
    val counts = linkedMapOf<String, Int>()
    var editAdded = 0
    var editRemoved = 0
    var editSeen = false
    var editMissingDiff = false
    for (node in members) {
        val item = node.item
        val key = activityIconKey(item)
        counts[key] = (counts[key] ?: 0) + 1
        if (key != RichItemTypes.FILE_CHANGE) continue
        editSeen = true
        val diff = readEditDiffSummary(item)
        if (diff == null) {
            editMissingDiff = true
        } else {
            editAdded += diff.first
            editRemoved += diff.second
        }
    }
    val showEditDiff = editSeen && !editMissingDiff && (editAdded != 0 || editRemoved != 0)
    return counts.entries
        .map { (key, count) ->
            ActivitySummarySegment(
                iconKey = key,
                count = count,
                added = if (key == RichItemTypes.FILE_CHANGE && showEditDiff) editAdded else 0,
                removed = if (key == RichItemTypes.FILE_CHANGE && showEditDiff) editRemoved else 0,
                hasDiff = key == RichItemTypes.FILE_CHANGE && showEditDiff,
            )
        }
        .sortedWith(
            compareByDescending<ActivitySummarySegment> { it.count }
                .thenBy { activitySummaryPriority(it.iconKey) },
        )
}

/** PWA `CATEGORY_META` priority, restricted to the buckets Android derives. */
private fun activitySummaryPriority(iconKey: String): Int = when (iconKey) {
    RichItemTypes.IMAGE_VIEW -> 0
    RichItemTypes.WEB_SEARCH -> 1
    RichItemTypes.FILE_CHANGE -> 2
    RichItemTypes.COMMAND_EXECUTION -> 3
    RichItemTypes.TOOL_CALL -> 5
    else -> 6
}

@PluralsRes
internal fun activitySummaryPluralRes(iconKey: String): Int = when (iconKey) {
    RichItemTypes.IMAGE_VIEW -> R.plurals.rich_chat_activity_view
    RichItemTypes.WEB_SEARCH -> R.plurals.rich_chat_activity_search
    RichItemTypes.FILE_CHANGE -> R.plurals.rich_chat_activity_edit
    RichItemTypes.COMMAND_EXECUTION -> R.plurals.rich_chat_activity_command
    RichItemTypes.REASONING -> R.plurals.rich_chat_activity_thought
    else -> R.plurals.rich_chat_activity_tool
}

private fun readEditDiffSummary(item: RichRuntimeItem): Pair<Int, Int>? {
    val payload = item.payload as? JsonObject ?: return null
    val diff = payload["diffSummary"] as? JsonObject ?: return null
    val added = (diff["added"] as? JsonPrimitive)?.intOrNull ?: return null
    val removed = (diff["removed"] as? JsonPrimitive)?.intOrNull ?: return null
    return added to removed
}
