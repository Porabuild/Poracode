package com.poracode.app.ui.home

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

enum class HomeLayoutMode {
    CompactSinglePane,
    SplitTwoColumn,
}

enum class HomeSidebarPresentation {
    None,
    Overlay,
    Docked,
}

/**
 * Physical separating hinge geometry reported by Android WindowManager (`HingeInfo`).
 * Supports both Book posture (vertical hinge) and Tabletop posture (horizontal hinge).
 */
data class FoldingHinge(
    val leftDp: Float,
    val widthDp: Float,
    val topDp: Float = 0f,
    val heightDp: Float = 0f,
    val isVertical: Boolean = true,
    val isSeparating: Boolean = true,
) {
    val isHorizontal: Boolean get() = !isVertical
}

/**
 * Viewport- and posture-driven adaptive layout policy for Android phones, foldables
 * (outer folded display, inner Medium unfolded display, Book & Tabletop postures),
 * and tablets (portrait & landscape).
 *
 * Uses live window geometry + [unobstructedHeightDp] (so opening the IME soft keyboard
 * never falsely triggers compact height or drops split mode) + [FoldingHinge] posture.
 */
data class HomeAdaptiveLayoutPolicy(
    val mode: HomeLayoutMode,
    val sidebarPresentation: HomeSidebarPresentation,
    val widthDp: Float,
    val heightDp: Float,
    val sidebarWidthDp: Float,
    val defaultSidebarWidthDp: Float,
    val resizableSidebarWidthRangeDp: ClosedFloatingPointRange<Float>,
    val isSidebarResizable: Boolean,
    val detailWidthDp: Float,
    val isCompactHeight: Boolean,
    val hingeGapDp: Float = 0f,
    val isBookPosture: Boolean = false,
    val isTabletopPosture: Boolean = false,
    val tabletopTopHeightDp: Float = 0f,
    val tabletopHingeHeightDp: Float = 0f,
) {
    val isSplit: Boolean get() = mode == HomeLayoutMode.SplitTwoColumn
    val usesOverlaySidebar: Boolean get() = sidebarPresentation == HomeSidebarPresentation.Overlay
    val usesDockedSidebar: Boolean get() = sidebarPresentation == HomeSidebarPresentation.Docked
    val isPortrait: Boolean get() = heightDp > widthDp

    companion object {
        const val SPLIT_WIDTH_THRESHOLD_DP = 600f
        const val DOCKED_WIDTH_THRESHOLD_DP = 840f
        const val COMPACT_HEIGHT_THRESHOLD_DP = 480f
        const val RESIZABLE_SIDEBAR_WIDTH_THRESHOLD_DP = 840f
        const val MINIMUM_SIDEBAR_WIDTH_DP = 240f
        const val MAXIMUM_OVERLAY_SIDEBAR_WIDTH_DP = 320f
        const val MAXIMUM_SIDEBAR_WIDTH_DP = 340f
        const val MAXIMUM_RESIZABLE_SIDEBAR_WIDTH_DP = 400f
        const val MINIMUM_DETAIL_WIDTH_DP = 380f
        const val MINIMUM_TABLETOP_TOP_DP = 200f
        const val MINIMUM_TABLETOP_BOTTOM_DP = 160f

        fun defaultDockedSidebarWidthDp(widthDp: Float): Float {
            val ideal = min(MAXIMUM_SIDEBAR_WIDTH_DP, floor(widthDp * 0.28f))
            val maxAllowed = max(MINIMUM_SIDEBAR_WIDTH_DP, widthDp - MINIMUM_DETAIL_WIDTH_DP)
            return max(MINIMUM_SIDEBAR_WIDTH_DP, min(ideal, maxAllowed))
        }

        fun clampedDockedSidebarWidthRangeDp(widthDp: Float): ClosedFloatingPointRange<Float> {
            val maxAllowed = max(
                MINIMUM_SIDEBAR_WIDTH_DP,
                min(MAXIMUM_RESIZABLE_SIDEBAR_WIDTH_DP, floor(widthDp - MINIMUM_DETAIL_WIDTH_DP)),
            )
            return MINIMUM_SIDEBAR_WIDTH_DP..maxAllowed
        }

        fun resolve(
            widthDp: Float,
            heightDp: Float,
            preferredSidebarWidthDp: Float? = null,
            fontScale: Float = 1f,
            hinge: FoldingHinge? = null,
            unobstructedHeightDp: Float = heightDp,
            retainingMode: HomeLayoutMode? = null,
        ): HomeAdaptiveLayoutPolicy {
            val effectiveWidth = max(0f, widthDp)
            val effectiveHeight = max(0f, max(heightDp, unobstructedHeightDp))
            val isCompactHeight = effectiveHeight > 0f && effectiveHeight <= COMPACT_HEIGHT_THRESHOLD_DP
            val largeFont = fontScale >= 1.5f

            val tabletopValid = hinge != null &&
                hinge.isHorizontal &&
                hinge.isSeparating &&
                hinge.topDp >= MINIMUM_TABLETOP_TOP_DP &&
                (effectiveHeight - (hinge.topDp + hinge.heightDp)) >= MINIMUM_TABLETOP_BOTTOM_DP
            val tabletopTop = if (tabletopValid) hinge.topDp else 0f
            val tabletopHinge = if (tabletopValid) max(8f, hinge.heightDp) else 0f

            val bookValid = !tabletopValid &&
                hinge != null &&
                hinge.isVertical &&
                hinge.isSeparating &&
                hinge.leftDp >= MINIMUM_SIDEBAR_WIDTH_DP &&
                (effectiveWidth - (hinge.leftDp + hinge.widthDp)) >= MINIMUM_DETAIL_WIDTH_DP

            val meetsSplitWidth = effectiveWidth >= SPLIT_WIDTH_THRESHOLD_DP
            val keepsRetainedSplit = retainingMode == HomeLayoutMode.SplitTwoColumn &&
                effectiveWidth >= SPLIT_WIDTH_THRESHOLD_DP - 20f

            if (!meetsSplitWidth && !keepsRetainedSplit && !bookValid) {
                return HomeAdaptiveLayoutPolicy(
                    mode = HomeLayoutMode.CompactSinglePane,
                    sidebarPresentation = HomeSidebarPresentation.None,
                    widthDp = effectiveWidth,
                    heightDp = effectiveHeight,
                    sidebarWidthDp = 0f,
                    defaultSidebarWidthDp = 0f,
                    resizableSidebarWidthRangeDp = 0f..0f,
                    isSidebarResizable = false,
                    detailWidthDp = effectiveWidth,
                    isCompactHeight = isCompactHeight,
                    isTabletopPosture = tabletopValid,
                    tabletopTopHeightDp = tabletopTop,
                    tabletopHingeHeightDp = tabletopHinge,
                )
            }

            if (bookValid && !largeFont) {
                val leadingWidth = hinge.leftDp
                val gap = max(0f, hinge.widthDp)
                val trailingWidth = max(MINIMUM_DETAIL_WIDTH_DP, effectiveWidth - leadingWidth - gap)
                return HomeAdaptiveLayoutPolicy(
                    mode = HomeLayoutMode.SplitTwoColumn,
                    sidebarPresentation = HomeSidebarPresentation.Docked,
                    widthDp = effectiveWidth,
                    heightDp = effectiveHeight,
                    sidebarWidthDp = leadingWidth,
                    defaultSidebarWidthDp = leadingWidth,
                    resizableSidebarWidthRangeDp = leadingWidth..leadingWidth,
                    isSidebarResizable = false,
                    detailWidthDp = trailingWidth,
                    isCompactHeight = isCompactHeight,
                    hingeGapDp = gap,
                    isBookPosture = true,
                )
            }

            val isPortrait = effectiveHeight > effectiveWidth
            val canDock = !isPortrait && !largeFont && !tabletopValid && effectiveWidth >= DOCKED_WIDTH_THRESHOLD_DP
            if (canDock) {
                val defaultWidth = defaultDockedSidebarWidthDp(effectiveWidth)
                val range = clampedDockedSidebarWidthRangeDp(effectiveWidth)
                val resizable = effectiveWidth >= RESIZABLE_SIDEBAR_WIDTH_THRESHOLD_DP &&
                    range.endInclusive > range.start
                val chosen = (preferredSidebarWidthDp ?: defaultWidth).coerceIn(range.start, range.endInclusive)
                return HomeAdaptiveLayoutPolicy(
                    mode = HomeLayoutMode.SplitTwoColumn,
                    sidebarPresentation = HomeSidebarPresentation.Docked,
                    widthDp = effectiveWidth,
                    heightDp = effectiveHeight,
                    sidebarWidthDp = chosen,
                    defaultSidebarWidthDp = defaultWidth,
                    resizableSidebarWidthRangeDp = range,
                    isSidebarResizable = resizable,
                    detailWidthDp = max(MINIMUM_DETAIL_WIDTH_DP, effectiveWidth - chosen),
                    isCompactHeight = isCompactHeight,
                )
            }

            val overlayWidth = min(
                MAXIMUM_OVERLAY_SIDEBAR_WIDTH_DP,
                max(MINIMUM_SIDEBAR_WIDTH_DP, floor(effectiveWidth * 0.48f)),
            )
            return HomeAdaptiveLayoutPolicy(
                mode = HomeLayoutMode.SplitTwoColumn,
                sidebarPresentation = HomeSidebarPresentation.Overlay,
                widthDp = effectiveWidth,
                heightDp = effectiveHeight,
                sidebarWidthDp = overlayWidth,
                defaultSidebarWidthDp = overlayWidth,
                resizableSidebarWidthRangeDp = overlayWidth..overlayWidth,
                isSidebarResizable = false,
                detailWidthDp = effectiveWidth,
                isCompactHeight = isCompactHeight,
                isTabletopPosture = tabletopValid,
                tabletopTopHeightDp = tabletopTop,
                tabletopHingeHeightDp = tabletopHinge,
            )
        }
    }
}
