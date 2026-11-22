package com.poracode.app.ui.theme

import com.poracode.app.model.RemoteJson
import java.util.Locale
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class CustomThemeFailure {
    InvalidDocument,
    UnsupportedVersion,
    UnavailableStorage,
    LimitReached,
}

class CustomThemeException(val failure: CustomThemeFailure) : IllegalArgumentException(failure.name)

@Serializable
data class CustomThemePalette(
    val bg: String,
    val surface: String,
    val fg: String,
    val accent: String,
    val accentFg: String,
    val border: String,
    val sidebar: String? = null,
    val content: String? = null,
    val composer: String? = null,
    val sidebarFill: Boolean? = null,
    val sidebarRowActive: String? = null,
) {
    enum class Field(val required: Boolean) {
        Bg(true),
        Surface(true),
        Fg(true),
        Accent(true),
        AccentFg(true),
        Border(true),
        Sidebar(false),
        Content(false),
        Composer(false),
        SidebarRowActive(false),
    }

    operator fun get(field: Field): String? = when (field) {
        Field.Bg -> bg
        Field.Surface -> surface
        Field.Fg -> fg
        Field.Accent -> accent
        Field.AccentFg -> accentFg
        Field.Border -> border
        Field.Sidebar -> sidebar
        Field.Content -> content
        Field.Composer -> composer
        Field.SidebarRowActive -> sidebarRowActive
    }

    fun withField(field: Field, value: String?): CustomThemePalette = when (field) {
        Field.Bg -> copy(bg = value.orEmpty())
        Field.Surface -> copy(surface = value.orEmpty())
        Field.Fg -> copy(fg = value.orEmpty())
        Field.Accent -> copy(accent = value.orEmpty())
        Field.AccentFg -> copy(accentFg = value.orEmpty())
        Field.Border -> copy(border = value.orEmpty())
        Field.Sidebar -> copy(sidebar = value?.ifBlank { null })
        Field.Content -> copy(content = value?.ifBlank { null })
        Field.Composer -> copy(composer = value?.ifBlank { null })
        Field.SidebarRowActive -> copy(sidebarRowActive = value?.ifBlank { null })
    }

    fun validate() {
        for (field in Field.entries) {
            val value = get(field)
            if (value == null) {
                if (field.required) throw CustomThemeException(CustomThemeFailure.InvalidDocument)
                continue
            }
            if (normalizedHex(value) == null) {
                throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }
        }
    }

    fun isValid(): Boolean = runCatching { validate() }.isSuccess

    companion object {
        fun normalizedHex(color: String): String? {
            val trimmed = color.trim()
            if (!trimmed.startsWith("#")) return null
            val body = trimmed.drop(1)
            if (body.length != 3 && body.length != 6) return null
            if (!body.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
            val lower = body.lowercase(Locale.ROOT)
            return "#" + if (lower.length == 3) {
                buildString(6) { lower.forEach { append(it); append(it) } }
            } else {
                lower
            }
        }

        val DefaultLight = CustomThemePalette(
            bg = "#f1f1f4",
            surface = "#fafafb",
            fg = "#18181b",
            accent = "#5f6cd9",
            accentFg = "#fcfcfc",
            border = "#cacace",
        )

        val DefaultDark = CustomThemePalette(
            bg = "#000000",
            surface = "#0e0e14",
            fg = "#fafafa",
            accent = "#8892ef",
            accentFg = "#0a0a12",
            border = "#303033",
        )
    }
}

/**
 * Portable version-1 custom theme authoring format shared with PWA and iOS.
 * Unknown additive fields are ignored; explicit JSON null on optional fields is rejected.
 */
@Serializable
data class CustomThemeDocument(
    val version: Int = VERSION,
    val label: String,
    val light: CustomThemePalette,
    val dark: CustomThemePalette,
) {
    fun validate() {
        if (version != VERSION) throw CustomThemeException(CustomThemeFailure.UnsupportedVersion)
        val trimmed = label.trim()
        val codePoints = trimmed.codePointCount(0, trimmed.length)
        if (trimmed.isEmpty() || codePoints > MAX_LABEL_CODE_POINTS) {
            throw CustomThemeException(CustomThemeFailure.InvalidDocument)
        }
        light.validate()
        dark.validate()
    }

    fun isValid(): Boolean = runCatching { validate() }.isSuccess

    fun exportJson(): String {
        validate()
        val normalized = copy(version = VERSION, label = label.trim())
        val text = PrettyJson.encodeToString(normalized)
        if (text.toByteArray(Charsets.UTF_8).size > MAXIMUM_BYTES) {
            throw CustomThemeException(CustomThemeFailure.InvalidDocument)
        }
        return text
    }

    companion object {
        const val VERSION = 1
        const val MAXIMUM_BYTES = 32_768
        const val MAX_LABEL_CODE_POINTS = 80

        private val PrettyJson = Json {
            prettyPrint = true
            encodeDefaults = true
            explicitNulls = false
        }

        fun parse(raw: String): CustomThemeDocument {
            if (raw.toByteArray(Charsets.UTF_8).size > MAXIMUM_BYTES) {
                throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }
            val root = runCatching { RemoteJson.parseToJsonElement(raw).jsonObject }.getOrElse {
                throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }
            val version = root["version"]?.jsonPrimitive?.intOrNull
                ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            if (version != VERSION) {
                throw CustomThemeException(CustomThemeFailure.UnsupportedVersion)
            }
            val label = root["label"]?.strictString()
                ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            val lightObj = root["light"] as? JsonObject
                ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            val darkObj = root["dark"] as? JsonObject
                ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            val document = CustomThemeDocument(
                version = version,
                label = label.trim(),
                light = parsePalette(lightObj),
                dark = parsePalette(darkObj),
            )
            document.validate()
            return document
        }

        private fun parsePalette(obj: JsonObject): CustomThemePalette {
            fun required(key: String): String =
                obj[key]?.strictString() ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)

            fun optionalString(key: String): String? {
                if (!obj.containsKey(key)) return null
                return obj[key]?.strictString()
                    ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }

            fun optionalBool(key: String): Boolean? {
                if (!obj.containsKey(key)) return null
                val element = obj[key]
                if (element == null || element is JsonNull) {
                    throw CustomThemeException(CustomThemeFailure.InvalidDocument)
                }
                return element.jsonPrimitive.booleanOrNull
                    ?: throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }

            return CustomThemePalette(
                bg = required("bg"),
                surface = required("surface"),
                fg = required("fg"),
                accent = required("accent"),
                accentFg = required("accentFg"),
                border = required("border"),
                sidebar = optionalString("sidebar"),
                content = optionalString("content"),
                composer = optionalString("composer"),
                sidebarFill = optionalBool("sidebarFill"),
                sidebarRowActive = optionalString("sidebarRowActive"),
            )
        }

        private fun JsonElement.strictString(): String? {
            if (this is JsonNull) return null
            val primitive = runCatching { jsonPrimitive }.getOrNull() ?: return null
            if (!primitive.isString) return null
            return primitive.contentOrNull
        }
    }
}

@Serializable
data class NativeCustomTheme(
    val id: String = newId(),
    val document: CustomThemeDocument,
) {
    companion object {
        fun newId(): String = "custom:${UUID.randomUUID().toString().lowercase(Locale.ROOT)}"

        fun isValidId(id: String): Boolean {
            if (!id.startsWith("custom:")) return false
            val suffix = id.removePrefix("custom:")
            return suffix.length in 1..80 && suffix.all {
                it in 'a'..'z' || it in '0'..'9' || it == '-'
            }
        }
    }
}
