package com.poracode.app.chat

import java.time.Instant
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

data class RichCompletedTurn(
    val startedAtEpochMs: Long,
    val endedAtEpochMs: Long,
    val anchorItemId: String?,
) {
    val durationMs: Long get() = endedAtEpochMs - startedAtEpochMs
    val isDisplayable: Boolean get() = durationMs >= 1_000L
}

data class RichContextBreakdown(
    val id: String,
    val label: String,
    val tokens: Long,
)

/** Nullable fields are absent patches; an explicit empty breakdown remains meaningful. */
data class RichContextUsage(
    val usedTokens: Long? = null,
    val maxTokens: Long? = null,
    val breakdown: List<RichContextBreakdown>? = null,
)

data class RichCheckpointChangedFile(
    val path: String,
    val oldPath: String? = null,
    val status: String,
)

data class RichCheckpoint(
    val threadId: String,
    val checkpointItemId: String,
    val ref: String,
    val commit: String,
    val capturedAt: String,
    val baseCheckpointItemId: String? = null,
    val baseRef: String? = null,
    val changedFiles: List<RichCheckpointChangedFile>? = null,
) {
    val isTurn: Boolean get() = baseCheckpointItemId != null
}

object RichSnapshotMapping {
    fun decodeCompletedTurn(value: JsonElement): RichCompletedTurn? {
        val objectValue = value.objectOrNull() ?: return null
        val started = objectValue.requiredString("startedAt", allowEmpty = false)
            ?.let(::parseEpochMs)
            ?: return null
        val ended = objectValue.requiredString("endedAt", allowEmpty = false)
            ?.let(::parseEpochMs)
            ?: return null
        if (!objectValue.containsKey("anchorItemId")) return null
        val anchor = when (val raw = objectValue["anchorItemId"]) {
            null, JsonNull -> null
            else -> raw.stringOrNull() ?: return null
        }
        return RichCompletedTurn(started, ended, anchor)
    }

    fun decodeCompletedTurns(value: JsonElement): List<RichCompletedTurn>? {
        val array = value.arrayOrNull() ?: return null
        return array.map { decodeCompletedTurn(it) ?: return null }
    }

    fun decodeContextUsage(value: JsonElement): RichContextUsage? {
        val objectValue = value.objectOrNull() ?: return null
        val usedField = objectValue.optionalLong("usedTokens")
        val maxField = objectValue.optionalLong("maxTokens")
        val breakdownField = objectValue.optionalArray("breakdown")
        if (usedField is RichField.Invalid ||
            maxField is RichField.Invalid ||
            breakdownField is RichField.Invalid
        ) {
            return null
        }
        val used = usedField.longValueOrNull()?.takeIf { it >= 0 } ?: run {
            if (usedField is RichField.Value) return null
            null
        }
        val max = maxField.longValueOrNull()?.takeIf { it > 0 } ?: run {
            if (maxField is RichField.Value) return null
            null
        }
        val breakdown = when (breakdownField) {
            is RichField.Value -> breakdownField.value.map { entry ->
                val objectEntry = entry.objectOrNull() ?: return null
                val id = objectEntry.requiredString("id", allowEmpty = false) ?: return null
                val label = objectEntry.requiredString("label", allowEmpty = false) ?: return null
                val tokens = objectEntry["tokens"]?.longOrStrictNull()
                    ?.takeIf { it >= 0 }
                    ?: return null
                RichContextBreakdown(id, label, tokens)
            }
            else -> null
        }
        return RichContextUsage(used, max, breakdown)
    }

    fun mergeContext(
        previous: RichContextUsage?,
        patch: RichContextUsage,
    ): RichContextUsage = RichContextUsage(
        usedTokens = patch.usedTokens ?: previous?.usedTokens,
        maxTokens = patch.maxTokens ?: previous?.maxTokens,
        breakdown = patch.breakdown ?: previous?.breakdown,
    )

    fun decodeCheckpoint(value: JsonElement): RichCheckpoint? {
        val objectValue = value.objectOrNull() ?: return null
        val threadId = objectValue.requiredString("threadId", allowEmpty = false) ?: return null
        val itemId = objectValue.requiredString("checkpointItemId", allowEmpty = false) ?: return null
        val ref = objectValue.requiredString("ref", allowEmpty = false) ?: return null
        val commit = objectValue.requiredString("commit", allowEmpty = false) ?: return null
        val capturedAt = objectValue.requiredString("capturedAt", allowEmpty = false) ?: return null
        val baseId = objectValue.optionalString("baseCheckpointItemId", allowEmpty = false)
        val baseRef = objectValue.optionalString("baseRef", allowEmpty = false)
        val files = objectValue.optionalArray("changedFiles")
        if (baseId is RichField.Invalid || baseRef is RichField.Invalid || files is RichField.Invalid) {
            return null
        }
        val hasAnyTurnField = baseId is RichField.Value ||
            baseRef is RichField.Value ||
            files is RichField.Value
        val hasEveryTurnField = baseId is RichField.Value &&
            baseRef is RichField.Value &&
            files is RichField.Value
        if (hasAnyTurnField != hasEveryTurnField) return null
        val changed = (files as? RichField.Value)?.value?.map { decodeChangedFile(it) ?: return null }
        return RichCheckpoint(
            threadId,
            itemId,
            ref,
            commit,
            capturedAt,
            baseId.valueOrNull(),
            baseRef.valueOrNull(),
            changed,
        )
    }

    private fun decodeChangedFile(value: JsonElement): RichCheckpointChangedFile? {
        val objectValue = value.objectOrNull() ?: return null
        val path = objectValue.requiredString("path", allowEmpty = false) ?: return null
        val status = objectValue.requiredString("status", allowEmpty = false) ?: return null
        val oldPath = objectValue.optionalString("oldPath", allowEmpty = false)
        if (oldPath is RichField.Invalid) return null
        return RichCheckpointChangedFile(path, oldPath.valueOrNull(), status)
    }

    private fun parseEpochMs(value: String): Long? =
        runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
}
