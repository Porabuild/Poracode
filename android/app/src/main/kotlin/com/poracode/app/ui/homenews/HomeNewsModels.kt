package com.poracode.app.ui.homenews

import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class HomeNewsKind { Announcement, Community, Tip }

sealed interface HomeNewsAction {
    data class OpenUrl(val url: String, val label: String? = null) : HomeNewsAction
    data class OpenFeature(val featureId: String) : HomeNewsAction
    data object OpenWhatsNew : HomeNewsAction
}

data class HomeNewsItem(
    val id: String,
    val kind: HomeNewsKind,
    val text: String,
    val action: HomeNewsAction? = null,
    val platforms: Set<String> = emptySet(),
    val weight: Int = 1,
)

data class HomeNewsFeedDocument(
    val paused: Boolean = false,
    val items: List<HomeNewsItem> = emptyList(),
)

/**
 * Bounded, strictly validated parser for Poracode's public `news.json` feed
 * (mirroring iOS `HomeNewsFeed.swift`: strict ID regex, HTTPS-only URL allowlist,
 * control-character scrubbing, locale fallback to `en`, 64 KiB cap).
 */
object HomeNewsParser {
    const val MAX_FEED_BYTES = 65_536
    private val idPattern = Regex("^[a-z0-9][a-z0-9-]{1,63}$")
    private val allowedPlatforms = setOf("darwin", "win32", "linux", "web", "ios", "android")
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    fun isAllowedUrl(url: String): Boolean = runCatching {
        val uri = URI(url)
        uri.scheme?.lowercase() == "https" && !uri.host.isNullOrBlank()
    }.getOrDefault(false)

    fun parse(
        rawJson: String,
        localeTag: String = "en",
        knownFeatureIds: Set<String> = emptySet(),
    ): HomeNewsFeedDocument {
        if (rawJson.toByteArray(Charsets.UTF_8).size > MAX_FEED_BYTES) {
            throw IllegalArgumentException("Home news feed exceeds 64 KiB cap.")
        }
        val root = json.parseToJsonElement(rawJson).jsonObject
        val paused = root["paused"]?.jsonPrimitive?.booleanOrNull ?: false
        val rawItems = (root["items"] as? JsonArray).orEmpty()
        val parsed = mutableListOf<HomeNewsItem>()
        for (element in rawItems) {
            val obj = element as? JsonObject ?: continue
            val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: continue
            if (!idPattern.matches(id)) continue
            val kind = when (obj["kind"]?.jsonPrimitive?.contentOrNull) {
                "announcement" -> HomeNewsKind.Announcement
                "community" -> HomeNewsKind.Community
                else -> continue
            }
            val platforms = (obj["platforms"] as? JsonArray).orEmpty()
                .mapNotNull { it.jsonPrimitive.contentOrNull }
                .toSet()
            if (platforms.isNotEmpty() && !platforms.all { it in allowedPlatforms }) continue
            if (platforms.isNotEmpty() && "android" !in platforms) continue
            val text = resolveLocalizedText(obj["text"] as? JsonObject, localeTag, maxLength = 140)
                ?: continue
            val action = parseAction(obj["action"] as? JsonObject, localeTag, knownFeatureIds)
            val weight = (obj["weight"]?.jsonPrimitive?.intOrNull ?: 1).coerceIn(1, 5)
            parsed += HomeNewsItem(
                id = id,
                kind = kind,
                text = text,
                action = action,
                platforms = platforms,
                weight = weight,
            )
        }
        return HomeNewsFeedDocument(paused = paused, items = parsed)
    }

    internal fun resolveLocalizedText(
        map: JsonObject?,
        localeTag: String,
        maxLength: Int,
    ): String? {
        if (map == null) return null
        val cleaned = linkedMapOf<String, String>()
        for ((k, v) in map) {
            val raw = v.jsonPrimitive.contentOrNull ?: continue
            val text = raw.replace(Regex("[\\p{Cntrl}\\uFEFF]+"), " ")
                .trim()
                .replace(Regex("\\s+"), " ")
            if (text.isNotEmpty() && text.length <= maxLength) {
                cleaned[k.lowercase().replace('_', '-')] = text
            }
        }
        if ("en" !in cleaned) return null
        val normalized = localeTag.lowercase().replace('_', '-')
        val lang = normalized.substringBefore('-')
        return cleaned[normalized]
            ?: cleaned.entries.firstOrNull { it.key.substringBefore('-') == lang }?.value
            ?: cleaned["en"]
    }

    private fun parseAction(
        obj: JsonObject?,
        localeTag: String,
        knownFeatureIds: Set<String>,
    ): HomeNewsAction? {
        if (obj == null) return null
        return when (obj["type"]?.jsonPrimitive?.contentOrNull) {
            "url" -> {
                val url = obj["url"]?.jsonPrimitive?.contentOrNull ?: return null
                if (!isAllowedUrl(url)) return null
                val label = resolveLocalizedText(obj["label"] as? JsonObject, localeTag, maxLength = 32)
                HomeNewsAction.OpenUrl(url, label)
            }
            "feature" -> {
                val feature = obj["feature"]?.jsonPrimitive?.contentOrNull ?: return null
                if (knownFeatureIds.isNotEmpty() && feature !in knownFeatureIds) return null
                HomeNewsAction.OpenFeature(feature)
            }
            "whats-new" -> HomeNewsAction.OpenWhatsNew
            else -> null
        }
    }
}
