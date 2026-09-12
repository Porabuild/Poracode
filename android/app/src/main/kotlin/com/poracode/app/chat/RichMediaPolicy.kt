package com.poracode.app.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

enum class RichInlineImageKind {
    DATA_URL,
    RAW_SVG,
    BASE64,
}

data class RichInlineImageClassification(
    val kind: RichInlineImageKind,
    val mimeType: String,
)

sealed interface RichImagePathPart {
    data class Key(val value: String) : RichImagePathPart
    data class Index(val value: Long) : RichImagePathPart
}

data class RichRemoteImageRef(
    val threadId: String,
    val itemId: String,
    val path: List<RichImagePathPart>,
    val mimeType: String,
    val bytes: Long,
    val width: Long? = null,
    val height: Long? = null,
    val preview: String? = null,
)

data class RichOmittedPayload(val bytes: Long)

object RichImagePolicy {
    private val signatures = listOf(
        "iVBORw0KGgo" to "image/png",
        "/9j/" to "image/jpeg",
        "R0lGOD" to "image/gif",
        "UklGR" to "image/webp",
        "PHN2Zw" to "image/svg+xml",
        "PD94bWwg" to "image/svg+xml",
    )
    private val resultStringKeys = listOf(
        "dataUrl",
        "data_url",
        "image",
        "b64_json",
        "base64",
        "png",
        "data",
        "src",
        "content",
        "text",
    )
    private val resultArrayKeys = listOf("images", "data", "content", "output")

    /** Only self-contained image bytes are displayable; URLs and local schemes are rejected. */
    fun classify(source: String): RichInlineImageClassification? {
        val head = source.take(16).trimStart()
        if (Regex("^data:image/", RegexOption.IGNORE_CASE).containsMatchIn(head)) {
            return RichInlineImageClassification(RichInlineImageKind.DATA_URL, dataUrlMime(source))
        }
        if (Regex("^<svg(?:\\s|>)", RegexOption.IGNORE_CASE).containsMatchIn(head) ||
            Regex("^<\\?xml", RegexOption.IGNORE_CASE).containsMatchIn(head)
        ) {
            return RichInlineImageClassification(RichInlineImageKind.RAW_SVG, "image/svg+xml")
        }
        for ((prefix, mime) in signatures) {
            if (source.startsWith(prefix)) {
                return RichInlineImageClassification(RichInlineImageKind.BASE64, mime)
            }
        }
        return null
    }

    fun decodeRemoteRef(value: JsonElement?): RichRemoteImageRef? {
        val marker = value?.objectOrNull()?.get("__poracodeImageRef")?.objectOrNull() ?: return null
        val threadId = marker.requiredString("threadId", allowEmpty = false) ?: return null
        val itemId = marker.requiredString("itemId", allowEmpty = false) ?: return null
        val mime = marker.requiredString("mime")?.takeIf { it.startsWith("image/") } ?: return null
        val bytes = marker["bytes"]?.longOrStrictNull()?.takeIf { it >= 0 } ?: return null
        val pathRaw = marker["path"]?.arrayOrNull()?.takeIf { it.isNotEmpty() } ?: return null
        val path = pathRaw.map { part ->
            part.stringOrNull()?.let(RichImagePathPart::Key)
                ?: part.longOrStrictNull()?.let(RichImagePathPart::Index)
                ?: return null
        }
        val width = optionalNonNegativeLong(marker, "width") ?: return null
        val height = optionalNonNegativeLong(marker, "height") ?: return null
        val preview = marker.optionalString("preview")
        if (preview is RichField.Invalid) return null
        val previewValue = preview.valueOrNull()
        if (previewValue != null &&
            !Regex("^data:image/", RegexOption.IGNORE_CASE).containsMatchIn(previewValue)
        ) {
            return null
        }
        return RichRemoteImageRef(
            threadId,
            itemId,
            path,
            mime,
            bytes,
            width.value,
            height.value,
            previewValue,
        )
    }

    fun decodeOmitted(value: JsonElement?): RichOmittedPayload? {
        val marker = value?.objectOrNull()?.get("__poracodeOmitted")?.objectOrNull() ?: return null
        val bytes = marker["bytes"]?.longOrStrictNull()?.takeIf { it >= 0 } ?: return null
        return RichOmittedPayload(bytes)
    }

    fun contentBlockIsSafe(block: RichContentBlock.Image): Boolean =
        classify(block.dataUrl) != null

    fun hasDisplayableImage(payload: JsonObject?): Boolean {
        if (payload == null || payload["status"]?.stringOrNull() == "error") return false
        val images = payload["images"] as? JsonArray
        if (images?.any(::isSafeCandidate) == true) return true
        val result = payload["result"] ?: return false
        if (isSafeCandidate(result)) return true
        val resultObject = result as? JsonObject ?: return false
        for (key in resultStringKeys) {
            if (resultObject[key]?.let(::isSafeCandidate) == true) return true
        }
        for (key in resultArrayKeys) {
            val values = resultObject[key] as? JsonArray ?: continue
            for (entry in values) {
                if (isSafeCandidate(entry)) return true
                val nested = entry as? JsonObject ?: continue
                if (resultStringKeys.any { nested[it]?.let(::isSafeCandidate) == true }) return true
            }
        }
        return false
    }

    private data class OptionalLongValue(val value: Long?)

    private fun optionalNonNegativeLong(value: JsonObject, key: String): OptionalLongValue? {
        return when (val field = value.optionalLong(key)) {
            RichField.Missing -> OptionalLongValue(null)
            RichField.Invalid -> null
            is RichField.Value -> field.value.takeIf { it >= 0 }?.let(::OptionalLongValue)
        }
    }

    private fun isSafeCandidate(value: JsonElement): Boolean =
        value.stringOrNull()?.let(::classify) != null || decodeRemoteRef(value) != null

    private fun dataUrlMime(source: String): String {
        val match = Regex("^\\s*data:([^;,]+)[;,]", RegexOption.IGNORE_CASE).find(source)
        val mime = match?.groupValues?.getOrNull(1)?.lowercase()
        return mime?.takeIf { it.startsWith("image/") } ?: "image/png"
    }
}

enum class RichAttachmentError(val wireCode: String) {
    EMPTY("empty_attachment"),
    TOO_LARGE("attachment_too_large"),
    INVALID("invalid_attachment"),
}

data class RichAttachmentDecision(
    val queryValid: Boolean,
    val bodyWithinLimit: Boolean,
    val accepted: Boolean,
    val error: RichAttachmentError?,
)

object RichAttachmentPolicy {
    const val MAX_BODY_BYTES: Long = 20L * 1024L * 1024L
    const val MAX_NAME_UTF16_UNITS: Int = 255

    fun evaluate(name: String, byteCount: Long): RichAttachmentDecision {
        val queryValid = name.isNotEmpty() && name.length <= MAX_NAME_UTF16_UNITS
        val bodyWithinLimit = byteCount in 0..MAX_BODY_BYTES
        val accepted = queryValid && bodyWithinLimit && byteCount > 0
        val error = when {
            accepted -> null
            !queryValid || byteCount < 0 -> RichAttachmentError.INVALID
            !bodyWithinLimit -> RichAttachmentError.TOO_LARGE
            else -> RichAttachmentError.EMPTY
        }
        return RichAttachmentDecision(queryValid, bodyWithinLimit, accepted, error)
    }
}
