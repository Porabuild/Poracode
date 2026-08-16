package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichContextUsage
import kotlin.math.roundToInt

enum class RuntimeContextTone { Unknown, Normal, Warning, Danger }

enum class RuntimeTokenUnit { Exact, Thousand, Million }

data class RuntimeTokenCount(
    val value: String,
    val unit: RuntimeTokenUnit,
)

data class RuntimeContextBreakdownRow(
    val id: String,
    /** Null identifies the synthesized, localized "Used" row. */
    val providerLabel: String?,
    val tokens: Long,
)

data class RuntimeContextSummary(
    val usedTokens: Long?,
    val maxTokens: Long,
    val remainingTokens: Long?,
    val percent: Int?,
    val breakdown: List<RuntimeContextBreakdownRow>,
    val indicatorTone: RuntimeContextTone,
    val dockTone: RuntimeContextTone,
)

object RuntimeContextUsageLogic {
    /** Desktop only shows the indicator after usage is reported and a limit is known. */
    fun summarize(usage: RichContextUsage?): RuntimeContextSummary? {
        val value = usage ?: return null
        val max = value.maxTokens ?: return null
        val hasReportedUsage = value.usedTokens != null || !value.breakdown.isNullOrEmpty()
        if (!hasReportedUsage) return null
        val used = value.usedTokens
        val percent = used?.let {
            ((it.toDouble() / max.toDouble()) * 100.0).roundToInt().coerceIn(0, 100)
        }
        val remaining = used?.let { (max - it).coerceAtLeast(0) }
        val breakdown = if (!value.breakdown.isNullOrEmpty()) {
            value.breakdown.map { RuntimeContextBreakdownRow(it.id, it.label, it.tokens) }
        } else {
            used?.let { listOf(RuntimeContextBreakdownRow("used", null, it)) }.orEmpty()
        }
        return RuntimeContextSummary(
            usedTokens = used,
            maxTokens = max,
            remainingTokens = remaining,
            percent = percent,
            breakdown = breakdown,
            indicatorTone = indicatorTone(percent),
            dockTone = dockTone(percent, used),
        )
    }

    fun indicatorTone(percent: Int?): RuntimeContextTone = when {
        percent == null -> RuntimeContextTone.Unknown
        percent >= 90 -> RuntimeContextTone.Danger
        percent >= 70 -> RuntimeContextTone.Warning
        else -> RuntimeContextTone.Normal
    }

    fun dockTone(percent: Int?, usedTokens: Long?): RuntimeContextTone = when {
        percent != null && percent >= 90 -> RuntimeContextTone.Danger
        percent != null && percent >= 60 -> RuntimeContextTone.Warning
        usedTokens != null && usedTokens >= 300_000 -> RuntimeContextTone.Warning
        else -> RuntimeContextTone.Normal
    }

    /** Matches the desktop formatter, including its rounding thresholds. */
    fun compactTokenCount(tokens: Long): RuntimeTokenCount = when {
        tokens >= 1_000_000 -> RuntimeTokenCount(
            roundedUnit(tokens, 1_000_000),
            RuntimeTokenUnit.Million,
        )
        tokens >= 10_000 -> RuntimeTokenCount(
            ((tokens + 500) / 1_000).toString(),
            RuntimeTokenUnit.Thousand,
        )
        tokens >= 1_000 -> RuntimeTokenCount(
            roundedUnit(tokens, 1_000),
            RuntimeTokenUnit.Thousand,
        )
        else -> RuntimeTokenCount(tokens.toString(), RuntimeTokenUnit.Exact)
    }

    private fun roundedUnit(tokens: Long, divisor: Long): String {
        val tenths = (tokens + divisor / 20) / (divisor / 10)
        return if (tenths % 10L == 0L) {
            (tenths / 10L).toString()
        } else {
            "${tenths / 10L}.${tenths % 10L}"
        }
    }
}
