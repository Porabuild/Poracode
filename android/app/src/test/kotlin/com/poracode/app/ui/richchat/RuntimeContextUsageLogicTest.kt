package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichContextBreakdown
import com.poracode.app.chat.RichContextUsage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeContextUsageLogicTest {
    @Test
    fun displayRequiresReportedUsageAndKnownLimit() {
        assertNull(RuntimeContextUsageLogic.summarize(null))
        assertNull(RuntimeContextUsageLogic.summarize(RichContextUsage(maxTokens = 200_000)))
        assertNull(RuntimeContextUsageLogic.summarize(RichContextUsage(usedTokens = 1)))
        assertTrue(
            RuntimeContextUsageLogic.summarize(
                RichContextUsage(usedTokens = 0, maxTokens = 200_000),
            ) != null,
        )
    }

    @Test
    fun summaryClampsPercentAndBuildsUsedFallbackBreakdown() {
        val summary = RuntimeContextUsageLogic.summarize(
            RichContextUsage(usedTokens = 250, maxTokens = 200),
        )!!
        assertEquals(100, summary.percent)
        assertEquals(0L, summary.remainingTokens)
        assertEquals(listOf("used"), summary.breakdown.map { it.id })
        assertNull(summary.breakdown.single().providerLabel)
        assertEquals(RuntimeContextTone.Danger, summary.indicatorTone)
        assertEquals(RuntimeContextTone.Danger, summary.dockTone)
    }

    @Test
    fun providerBreakdownLabelsAndTokensArePreserved() {
        val summary = RuntimeContextUsageLogic.summarize(
            RichContextUsage(
                maxTokens = 1_000,
                breakdown = listOf(RichContextBreakdown("system", "System prompts", 240)),
            ),
        )!!
        assertNull(summary.percent)
        assertEquals(RuntimeContextTone.Unknown, summary.indicatorTone)
        assertEquals("System prompts", summary.breakdown.single().providerLabel)
        assertEquals(240L, summary.breakdown.single().tokens)
    }

    @Test
    fun indicatorAndDockThresholdsMatchDesktop() {
        assertEquals(RuntimeContextTone.Normal, RuntimeContextUsageLogic.indicatorTone(69))
        assertEquals(RuntimeContextTone.Warning, RuntimeContextUsageLogic.indicatorTone(70))
        assertEquals(RuntimeContextTone.Danger, RuntimeContextUsageLogic.indicatorTone(90))
        assertEquals(RuntimeContextTone.Normal, RuntimeContextUsageLogic.dockTone(59, 299_999))
        assertEquals(RuntimeContextTone.Warning, RuntimeContextUsageLogic.dockTone(60, 1))
        assertEquals(RuntimeContextTone.Warning, RuntimeContextUsageLogic.dockTone(null, 300_000))
        assertEquals(RuntimeContextTone.Danger, RuntimeContextUsageLogic.dockTone(90, 1))
    }

    @Test
    fun compactLabelsMatchDesktopRounding() {
        assertEquals(RuntimeTokenCount("595", RuntimeTokenUnit.Exact), count(595))
        assertEquals(RuntimeTokenCount("8.4", RuntimeTokenUnit.Thousand), count(8_400))
        assertEquals(RuntimeTokenCount("200", RuntimeTokenUnit.Thousand), count(200_000))
        assertEquals(RuntimeTokenCount("1", RuntimeTokenUnit.Million), count(1_000_000))
        assertEquals(RuntimeTokenCount("24.8", RuntimeTokenUnit.Million), count(24_767_000))
    }

    private fun count(value: Long) = RuntimeContextUsageLogic.compactTokenCount(value)
}
