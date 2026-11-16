package com.poracode.app.ui.richchat

import com.poracode.app.ui.settings.SettingsProviderUsageRow
import com.poracode.app.ui.settings.SettingsUsageMeter

/** Reported quota periods, independent of provider names and collector payloads. */
internal data class RichChatUsageRings(val outerPercent: Double?, val innerPercent: Double?)

internal object RichChatProviderUsagePresentation {
    fun resolve(
        agentKind: String,
        instanceId: String?,
        rows: List<SettingsProviderUsageRow>,
    ): SettingsProviderUsageRow? {
        val base = agentKind.substringBefore(':')
        val providerId = instanceId?.let { "$base:$it" } ?: agentKind
        return rows.firstOrNull { it.providerId == providerId }
    }

    fun rings(row: SettingsProviderUsageRow?): RichChatUsageRings {
        val layout = row?.ringLayout ?: return RichChatUsageRings(null, null)
        val windows = row.meters.filter { it.usedPercent.isFinite() }
        val outer = windows.firstOrNull { it.id == layout.outerWindowId }
        val inner = windows.firstOrNull { it.id == layout.innerWindowId }
        return RichChatUsageRings(
            (outer ?: inner)?.usedPercent?.coerceIn(0.0, 100.0),
            if (outer == null) null else inner?.usedPercent?.coerceIn(0.0, 100.0),
        )
    }
}
