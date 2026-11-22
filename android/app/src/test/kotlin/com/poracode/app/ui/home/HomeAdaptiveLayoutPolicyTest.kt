package com.poracode.app.ui.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeAdaptiveLayoutPolicyTest {
    @Test
    fun narrowPortraitPhoneStaysCompactSinglePane() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(widthDp = 412f, heightDp = 915f)
        assertEquals(HomeLayoutMode.CompactSinglePane, policy.mode)
        assertEquals(HomeSidebarPresentation.None, policy.sidebarPresentation)
        assertFalse(policy.isSplit)
        assertFalse(policy.isCompactHeight)
    }

    @Test
    fun unfoldedFoldableInnerPortraitUsesOverlaySidebar() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(widthDp = 680f, heightDp = 840f)
        assertEquals(HomeLayoutMode.SplitTwoColumn, policy.mode)
        assertEquals(HomeSidebarPresentation.Overlay, policy.sidebarPresentation)
        assertTrue(policy.usesOverlaySidebar)
        assertFalse(policy.isSidebarResizable)
    }

    @Test
    fun tabletLandscapeUsesDockedResizableSidebar() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(
            widthDp = 1280f,
            heightDp = 800f,
            preferredSidebarWidthDp = 310f,
        )
        assertEquals(HomeLayoutMode.SplitTwoColumn, policy.mode)
        assertEquals(HomeSidebarPresentation.Docked, policy.sidebarPresentation)
        assertTrue(policy.isSidebarResizable)
        assertEquals(310f, policy.sidebarWidthDp, 0.1f)
    }

    @Test
    fun largeFontFallsBackToOverlaySidebarForReadability() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(
            widthDp = 1024f,
            heightDp = 768f,
            fontScale = 1.6f,
        )
        assertEquals(HomeSidebarPresentation.Overlay, policy.sidebarPresentation)
    }

    @Test
    fun bookPostureVerticalSeparatingHingeDocksAlongHinge() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(
            widthDp = 840f,
            heightDp = 880f,
            hinge = FoldingHinge(leftDp = 360f, widthDp = 24f, isVertical = true, isSeparating = true),
        )
        assertTrue(policy.isBookPosture)
        assertEquals(HomeSidebarPresentation.Docked, policy.sidebarPresentation)
        assertEquals(360f, policy.sidebarWidthDp, 0.1f)
        assertEquals(24f, policy.hingeGapDp, 0.1f)
        assertFalse(policy.isSidebarResizable)
    }

    @Test
    fun tabletopPostureHorizontalSeparatingHingeReportsTopAndCreaseHeights() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(
            widthDp = 720f,
            heightDp = 840f,
            hinge = FoldingHinge(
                leftDp = 0f,
                widthDp = 720f,
                topDp = 410f,
                heightDp = 20f,
                isVertical = false,
                isSeparating = true,
            ),
        )
        assertTrue(policy.isTabletopPosture)
        assertEquals(410f, policy.tabletopTopHeightDp, 0.1f)
        assertEquals(20f, policy.tabletopHingeHeightDp, 0.1f)
        assertEquals(HomeSidebarPresentation.Overlay, policy.sidebarPresentation)
    }

    @Test
    fun imeKeyboardPreservesUnobstructedHeightAndSplitMode() {
        val policy = HomeAdaptiveLayoutPolicy.resolve(
            widthDp = 700f,
            heightDp = 420f,
            unobstructedHeightDp = 840f,
            retainingMode = HomeLayoutMode.SplitTwoColumn,
        )
        assertEquals(HomeLayoutMode.SplitTwoColumn, policy.mode)
        assertFalse(policy.isCompactHeight)
    }
}
