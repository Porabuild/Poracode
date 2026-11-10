package com.poracode.app.ui.richchat

import com.poracode.app.ui.settings.SettingsProviderUsageRow
import com.poracode.app.ui.settings.SettingsUsageMeter
import com.poracode.app.ui.settings.SettingsUsageRingLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RichChatProviderUsagePresentationTest {
    private fun meter(id: String, percent: Double) =
        SettingsUsageMeter(id, id, percent, null, null, null, null, null)

    private fun row(id: String, vararg windows: SettingsUsageMeter, status: String = "ok", layout: SettingsUsageRingLayout? = null) =
        SettingsProviderUsageRow(id, id, status, null, windows.toList(), layout)

    @Test
    fun exactProfileWinsOverAnotherAccountOfTheSameAgent() {
        val other = row("agent:personal")
        val selected = row("agent:work")
        val base = row("agent")
        assertEquals(selected, RichChatProviderUsagePresentation.resolve("agent", "work", listOf(base, other, selected)))
        assertNull(RichChatProviderUsagePresentation.resolve("untracked", null, listOf(other, selected)))
        assertNull(RichChatProviderUsagePresentation.resolve("agent:missing", null, listOf(other)))
        assertNull(RichChatProviderUsagePresentation.resolve("agent", "missing", listOf(base, other)))
    }

    @Test
    fun sessionAndLongPeriodAreDistinctConcentricRings() {
        val rings = RichChatProviderUsagePresentation.rings(row("agent", meter("weekly", 68.0), meter("session-5h", 21.0), layout = SettingsUsageRingLayout("session-5h", "weekly")))
        assertEquals(RichChatUsageRings(21.0, 68.0), rings)
    }

    @Test
    fun dailyQuotasUseWeeklyAsTheSlowerRing() {
        assertEquals(
            RichChatUsageRings(85.0, 25.0),
            RichChatProviderUsagePresentation.rings(row("agent", meter("daily", 85.0), meter("weekly", 25.0), layout = SettingsUsageRingLayout("daily", "weekly"))),
        )
    }

    @Test
    fun explicitHostSelectionWorksForAnyPeriodVocabulary() {
        assertEquals(
            RichChatUsageRings(77.0, null),
            RichChatProviderUsagePresentation.rings(row("custom", meter("budget-a", 34.0), meter("budget-b", 77.0), layout = SettingsUsageRingLayout("budget-b", null))),
        )
    }

    @Test
    fun unavailableAndInvalidUsageStayUnknownInsteadOfInventingZero() {
        assertEquals(RichChatUsageRings(null, null), RichChatProviderUsagePresentation.rings(null))
        assertEquals(RichChatUsageRings(null, null), RichChatProviderUsagePresentation.rings(row("old-host", meter("daily", 90.0))))
        assertEquals(RichChatUsageRings(90.0, null), RichChatProviderUsagePresentation.rings(row("agent", meter("daily", 90.0), status = "error", layout = SettingsUsageRingLayout("daily", null))))
        assertEquals(RichChatUsageRings(null, null), RichChatProviderUsagePresentation.rings(row("agent", meter("daily", Double.NaN))))
    }
}
