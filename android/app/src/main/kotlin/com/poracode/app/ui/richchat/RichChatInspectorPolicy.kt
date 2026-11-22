package com.poracode.app.ui.richchat

import androidx.compose.ui.graphics.vector.ImageVector
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeIcons
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Pure geometry and capability policy for the adaptive conversation workspace & right
 * inspector panel, matching iOS `RichChatInspectorGeometry` + `RichChatInspectorCapability`.
 */
object RichChatInspectorGeometry {
    const val MINIMUM_OVERLAY_WIDTH_DP = 600f
    const val MINIMUM_DOCKED_WIDTH_DP = 820f
    const val MINIMUM_PANEL_WIDTH_DP = 320f
    const val MAXIMUM_PANEL_WIDTH_DP = 400f
    const val MINIMUM_CHAT_WIDTH_DP = 440f
    const val MINIMUM_HEIGHT_DP = 480f
    const val MAX_READING_MEASURE_DP = 860f

    fun defaultWidthDp(availableWidthDp: Float): Float =
        max(MINIMUM_PANEL_WIDTH_DP, min(380f, floor(availableWidthDp * 0.36f)))

    fun widthRangeDp(availableWidthDp: Float, docked: Boolean): ClosedFloatingPointRange<Float> {
        val remaining = if (docked) availableWidthDp - MINIMUM_CHAT_WIDTH_DP else availableWidthDp - 24f
        val upper = max(MINIMUM_PANEL_WIDTH_DP, min(MAXIMUM_PANEL_WIDTH_DP, floor(remaining)))
        return MINIMUM_PANEL_WIDTH_DP..upper
    }
}

data class RichChatInspectorCapability(
    val supportsInspector: Boolean = false,
    val docksInspector: Boolean = false,
) {
    companion object {
        fun resolve(
            widthDp: Float,
            heightDp: Float,
            fontScale: Float = 1f,
        ): RichChatInspectorCapability {
            val supports = fontScale < 1.5f &&
                widthDp >= RichChatInspectorGeometry.MINIMUM_OVERLAY_WIDTH_DP &&
                heightDp >= RichChatInspectorGeometry.MINIMUM_HEIGHT_DP
            val docks = supports && widthDp >= RichChatInspectorGeometry.MINIMUM_DOCKED_WIDTH_DP
            return RichChatInspectorCapability(
                supportsInspector = supports,
                docksInspector = docks,
            )
        }
    }
}

enum class RichChatRightPanelTab(
    val labelRes: Int,
) {
    Info(R.string.inspector_tab_info),
    Files(R.string.workspace_files),
    Git(R.string.workspace_git),
    Terminal(R.string.terminal_title),
    Notes(R.string.projects_notes),
    Browser(R.string.browser_mirror_title),
    Ports(R.string.ports_title),
    SideChat(R.string.side_chat_title),
    ;

    fun icon(): ImageVector = when (this) {
        Info -> PoracodeIcons.Info
        Files -> PoracodeIcons.Folder
        Git -> PoracodeIcons.AccountTree
        Terminal -> PoracodeIcons.Terminal
        Notes -> PoracodeIcons.NoteAlt
        Browser -> PoracodeIcons.Public
        Ports -> PoracodeIcons.Lan
        SideChat -> PoracodeIcons.MarkChatUnread
    }
}

data class RichChatPanelTabSplit(
    val inline: List<RichChatRightPanelTab>,
    val overflow: List<RichChatRightPanelTab>,
)

object RichChatPanelTabLayout {
    fun split(
        tabs: List<RichChatRightPanelTab>,
        widthDp: Float,
        reservesExpand: Boolean,
    ): RichChatPanelTabSplit {
        val reservedExpand = if (reservesExpand) 52f else 0f
        val usableWidth = max(100f, widthDp - 24f - 12f - reservedExpand)
        val slotWidth = 44f
        val slotSpacing = 2f
        val capacity = max(2, floor((usableWidth + slotSpacing) / (slotWidth + slotSpacing)).toInt())
        if (tabs.size <= capacity) {
            return RichChatPanelTabSplit(inline = tabs, overflow = emptyList())
        }
        val inlineCapacity = max(2, floor((usableWidth - slotWidth) / (slotWidth + slotSpacing)).toInt())
        return RichChatPanelTabSplit(
            inline = tabs.take(inlineCapacity),
            overflow = tabs.drop(inlineCapacity),
        )
    }
}
