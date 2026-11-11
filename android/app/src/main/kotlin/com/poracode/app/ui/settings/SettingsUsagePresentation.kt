package com.poracode.app.ui.settings

import java.text.NumberFormat
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Severity of a usage meter, mirroring the iOS `SettingsUsageTone`. */
internal enum class SettingsUsageTone { Normal, Warning, Danger, Unknown }

internal data class SettingsUsageProjection(
    val projectedPercent: Double,
    val lastsToReset: Boolean,
    val runsOutAtMillis: Long?,
)

/** Structured pace result; the composable localizes [kind] into the note text. */
internal data class SettingsUsagePace(
    val tone: SettingsUsageTone,
    val kind: Kind,
    val percent: Int = 0,
    val countdown: String = "",
) {
    enum class Kind { ProjectedByReset, OverPace, RanOut, RanOutResetsIn, RunsOutIn, RunsOutEarly }
}

/**
 * Pure usage-meter presentation shared by the settings Usage pane. Ports the iOS
 * `SettingsUsagePresentation` semantics (provider labels, severity tone, reset
 * countdown, pace projection) onto the Android [SettingsUsageMeter] model.
 */
internal object SettingsUsagePresentation {

    fun providerLabel(providerId: String): String {
        return when (providerId.lowercase()) {
            "antigravity" -> "Antigravity"
            "claude" -> "Claude"
            "codex" -> "Codex"
            "commandcode" -> "Command Code"
            "copilot" -> "GitHub Copilot"
            "factory" -> "Droid"
            "gemini" -> "Gemini"
            "grok" -> "Grok"
            "qwen" -> "Qwen"
            "opencode" -> "OpenCode"
            "cursor" -> "Cursor"
            "kimi" -> "Kimi"
            "zai" -> "z.ai"
            else -> providerId.split('-', '_', ':')
                .filter { it.isNotEmpty() }
                .joinToString(" ") { part -> part.replaceFirstChar { it.uppercase() } }
        }
    }

    fun tone(usedPercent: Double?): SettingsUsageTone {
        if (usedPercent == null || !usedPercent.isFinite()) return SettingsUsageTone.Unknown
        return when {
            usedPercent >= 90 -> SettingsUsageTone.Danger
            usedPercent >= 70 -> SettingsUsageTone.Warning
            else -> SettingsUsageTone.Normal
        }
    }

    /** "75%", or "75% · 3 / 5" for request-count windows. */
    fun windowValue(window: SettingsUsageMeter): String {
        val percent = "${window.usedPercent.roundToInt()}%"
        if (window.unit != "requests") return percent
        val used = window.used ?: return percent
        val requests = window.limit?.let { "${wholeNumber(used)} / ${wholeNumber(it)}" }
            ?: wholeNumber(used)
        return "$percent · $requests"
    }

    /** "used / limit" money for USD windows, else null. */
    fun windowSecondaryValue(window: SettingsUsageMeter): String? {
        val used = window.used ?: return null
        if (window.unit != "usd" && window.currency == null) return null
        val value = money(used, window.currency)
        val limit = window.limit ?: return value
        return "$value / ${money(limit, window.currency)}"
    }

    /** Compact "2d 3h" / "5h 20m" / "45m" / "now" countdown to [resetsAt] (epoch ms). */
    fun resetCountdown(resetsAt: Long?, nowMillis: Long): String? {
        if (resetsAt == null) return null
        val delta = resetsAt - nowMillis
        if (delta <= 0) return "now"
        val totalMinutes = delta / 60_000
        val days = totalMinutes / 1_440
        val hours = (totalMinutes % 1_440) / 60
        val minutes = totalMinutes % 60
        return when {
            days > 0 -> "${days}d ${hours}h"
            hours > 0 -> "${hours}h ${minutes}m"
            else -> "${minutes}m"
        }
    }

    fun projection(window: SettingsUsageMeter, nowMillis: Long): SettingsUsageProjection? {
        if (window.unit == "usd") return null
        val resetsAt = window.resetsAt ?: return null
        val duration = windowDuration(window.id, resetsAt) ?: return null
        if (duration <= 0) return null
        val elapsed = (nowMillis - (resetsAt - duration)) / duration
        if (!elapsed.isFinite() || elapsed < 0.05 || elapsed >= 1) return null
        val used = window.usedPercent.coerceIn(0.0, 100.0)
        if (used < 1) return null
        val projected = used / elapsed
        val lastsToReset = projected <= 100
        val runsOutAt = if (lastsToReset) {
            null
        } else {
            (resetsAt - duration + (100.0 / used) * elapsed * duration).toLong()
        }
        return SettingsUsageProjection(projected, lastsToReset, runsOutAt)
    }

    fun pace(window: SettingsUsageMeter, nowMillis: Long): SettingsUsagePace? {
        val projection = projection(window, nowMillis) ?: return null
        val resetsAt = window.resetsAt ?: return null
        val tone = tone(projection.projectedPercent)
        if (projection.lastsToReset) {
            return SettingsUsagePace(
                tone = tone,
                kind = SettingsUsagePace.Kind.ProjectedByReset,
                percent = projection.projectedPercent.roundToInt(),
            )
        }
        val runsOutAt = projection.runsOutAtMillis
            ?: return SettingsUsagePace(tone, SettingsUsagePace.Kind.OverPace)
        if (runsOutAt <= nowMillis) {
            val reset = resetCountdown(resetsAt, nowMillis)
            return if (reset != null) {
                SettingsUsagePace(tone, SettingsUsagePace.Kind.RanOutResetsIn, countdown = reset)
            } else {
                SettingsUsagePace(tone, SettingsUsagePace.Kind.RanOut)
            }
        }
        val runOut = resetCountdown(runsOutAt, nowMillis)
        return if (runOut != null) {
            SettingsUsagePace(tone, SettingsUsagePace.Kind.RunsOutIn, countdown = runOut)
        } else {
            SettingsUsagePace(tone, SettingsUsagePace.Kind.RunsOutEarly)
        }
    }

    /** Window length in milliseconds, or null when the id carries no known cadence. */
    private fun windowDuration(id: String, resetsAtMillis: Long): Double? {
        val hour = 3_600_000.0
        val day = 86_400_000.0
        fun monthBefore(): Double? = runCatching {
            val calendar = java.util.Calendar.getInstance().apply {
                timeInMillis = resetsAtMillis
            }
            calendar.add(java.util.Calendar.MONTH, -1)
            (resetsAtMillis - calendar.timeInMillis).toDouble()
        }.getOrNull()
        return when (id) {
            "daily" -> day
            "session-5h" -> 5 * hour
            "weekly", "weekly-opus", "weekly-sonnet", "weekly-fable" -> 7 * day
            "monthly", "cursor-auto", "cursor-api", "factory:premium" -> monthBefore()
            else -> {
                if (id.startsWith("gemini:")) {
                    day
                } else {
                    when (id.substringAfterLast(':')) {
                        "session-5h" -> 5 * hour
                        "weekly" -> 7 * day
                        "monthly" -> monthBefore()
                        else -> null
                    }
                }
            }
        }
    }

    private fun wholeNumber(value: Double): String =
        NumberFormat.getIntegerInstance().format(value.roundToLong())

    private fun money(value: Double, currency: String?): String {
        val format = NumberFormat.getCurrencyInstance()
        if (!currency.isNullOrBlank() && format is java.text.DecimalFormat) {
            runCatching { format.currency = java.util.Currency.getInstance(currency) }
        }
        return format.format(value)
    }
}
