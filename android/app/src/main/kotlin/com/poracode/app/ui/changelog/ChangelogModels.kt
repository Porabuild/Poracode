package com.poracode.app.ui.changelog

import com.poracode.app.model.RemoteJson
import java.time.LocalDate
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class ChangelogFailure {
    InvalidDocument,
    NetworkError,
}

class ChangelogException(val failure: ChangelogFailure) : IllegalArgumentException(failure.name)

@Serializable
data class ChangelogDocument(
    val releases: List<ChangelogRelease> = emptyList(),
) {
    val newestFirst: List<ChangelogRelease>
        get() = releases.withIndex()
            .sortedWith { a, b ->
                val cmp = ChangelogVersion.compare(b.value.version, a.value.version)
                if (cmp != 0) cmp else a.index.compareTo(b.index)
            }
            .map { it.value }

    companion object {
        const val MAXIMUM_BYTES = 8 * 1024 * 1024
        private val TAGLINE_REGEX = Regex("""^\S+ \S+$""")

        fun parse(raw: String): ChangelogDocument {
            if (raw.toByteArray(Charsets.UTF_8).size > MAXIMUM_BYTES) {
                throw ChangelogException(ChangelogFailure.InvalidDocument)
            }
            val root = runCatching { RemoteJson.parseToJsonElement(raw).jsonObject }.getOrElse {
                throw ChangelogException(ChangelogFailure.InvalidDocument)
            }
            val array = root["releases"] as? JsonArray
                ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
            val releases = array.map { elem ->
                val obj = elem as? JsonObject
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
                parseRelease(obj)
            }
            return ChangelogDocument(releases = releases)
        }

        private fun parseRelease(obj: JsonObject): ChangelogRelease {
            fun requiredString(key: String): String {
                val elem = obj[key]
                if (elem == null || elem is JsonNull) {
                    throw ChangelogException(ChangelogFailure.InvalidDocument)
                }
                val prim = runCatching { elem.jsonPrimitive }.getOrNull()
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
                if (!prim.isString) throw ChangelogException(ChangelogFailure.InvalidDocument)
                return prim.contentOrNull
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
            }

            fun optionalString(key: String): String? {
                if (!obj.containsKey(key)) return null
                return requiredString(key)
            }

            val tagline = optionalString("tagline")
            if (tagline != null && !TAGLINE_REGEX.matches(tagline)) {
                throw ChangelogException(ChangelogFailure.InvalidDocument)
            }
            val changesArray = obj["changes"] as? JsonArray
                ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
            val changes = changesArray.map { entry ->
                val changeObj = entry as? JsonObject
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
                parseChange(changeObj)
            }
            return ChangelogRelease(
                version = requiredString("version"),
                date = requiredString("date"),
                title = requiredString("title"),
                tagline = tagline,
                summary = requiredString("summary"),
                changes = changes,
            )
        }

        private fun parseChange(obj: JsonObject): ChangelogChange {
            fun requiredString(key: String): String {
                val elem = obj[key]
                if (elem == null || elem is JsonNull) {
                    throw ChangelogException(ChangelogFailure.InvalidDocument)
                }
                val prim = runCatching { elem.jsonPrimitive }.getOrNull()
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
                if (!prim.isString) throw ChangelogException(ChangelogFailure.InvalidDocument)
                return prim.contentOrNull
                    ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
            }

            fun optionalString(key: String): String? {
                if (!obj.containsKey(key)) return null
                return requiredString(key)
            }

            val kind = ChangelogChange.Kind.fromWire(requiredString("kind"))
                ?: throw ChangelogException(ChangelogFailure.InvalidDocument)
            return ChangelogChange(
                kind = kind,
                label = optionalString("label"),
                text = requiredString("text"),
                headline = optionalString("headline"),
                feature = optionalString("feature"),
            )
        }
    }
}

@Serializable
data class ChangelogRelease(
    val version: String,
    val date: String,
    val title: String,
    val tagline: String? = null,
    val summary: String,
    val changes: List<ChangelogChange> = emptyList(),
) {
    fun parsedLocalDate(): LocalDate? {
        val parts = date.split('-')
        if (parts.size != 3 || parts[0].length != 4 || parts[1].length != 2 || parts[2].length != 2) {
            return null
        }
        val year = parts[0].toIntOrNull() ?: return null
        val month = parts[1].toIntOrNull() ?: return null
        val day = parts[2].toIntOrNull() ?: return null
        return runCatching { LocalDate.of(year, month, day) }.getOrNull()
    }
}

@Serializable
data class ChangelogChange(
    val kind: Kind,
    val label: String? = null,
    val text: String,
    val headline: String? = null,
    val feature: String? = null,
) {
    @Serializable
    enum class Kind(val wire: String) {
        Added("added"),
        Improved("improved"),
        Fixed("fixed"),
        ;

        companion object {
            fun fromWire(value: String): Kind? = entries.firstOrNull { it.wire == value }
        }
    }
}

object ChangelogVersion {
    fun compare(first: String, second: String): Int {
        val a = segments(first)
        val b = segments(second)
        val count = maxOf(a.size, b.size)
        for (i in 0 until count) {
            val left = a.getOrElse(i) { 0L }
            val right = b.getOrElse(i) { 0L }
            if (left != right) return left.compareTo(right)
        }
        return 0
    }

    private fun segments(value: String): List<Long> {
        var core = value.trim()
        if (core.startsWith("v", ignoreCase = true)) core = core.drop(1)
        core = core.takeWhile { it != '-' && it != '+' }
        return core.split('.').map { seg ->
            seg.trim().takeWhile { it in '0'..'9' }.toLongOrNull() ?: 0L
        }
    }
}
