package com.poracode.app.protocol

import java.net.URI
import java.net.URLDecoder

/**
 * Pairing URL helpers matching `src/shared/remote/pairingUrl.ts`, plus Android deep-link
 * routing for `https://poracode.com` (root / `/pair` / `/app`) and `poracode://pair`.
 */
object PairingUrl {
    private const val VITE_DEV_SERVER_PORT = 3100
    private const val DEFAULT_REMOTE_ACCESS_PORT = 49152

    const val HOSTED_PAIRING_HOST = "poracode.com"
    const val CUSTOM_SCHEME = "poracode"
    const val CUSTOM_PAIR_HOST = "pair"

    data class Parts(
        val token: String,
        val host: String?,
        val uri: URI,
    )

    data class DeepLinkRoute(
        val endpoint: String,
        val token: String,
    )

    /**
     * Returns null when the URL has no usable token credential in fragment or query.
     */
    fun parseParts(value: String): Parts? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        if (uri.scheme.isNullOrBlank()) return null

        val token = extractToken(uri) ?: return null
        val host = parseQuery(uri.rawQuery ?: uri.query)["host"]
        return Parts(token = token, host = host, uri = uri)
    }

    /**
     * Resolve a cold/warm deep-link intent into a pairing route.
     *
     * - `https://poracode.com`, `/pair`, `/app`: endpoint from `?host=` (required for custom
     *   endpoints); token from fragment/query.
     * - `poracode://pair`: endpoint **only** from decoded `host=` http(s) parameter;
     *   token from fragment or query. Host is never derived from the custom scheme itself.
     */
    fun parseDeepLink(value: String): DeepLinkRoute? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null

        return when (scheme) {
            "https", "http" -> parseHttpsDeepLink(uri, trimmed)
            CUSTOM_SCHEME -> parseCustomSchemeDeepLink(uri)
            else -> null
        }
    }

    private fun parseHttpsDeepLink(uri: URI, raw: String): DeepLinkRoute? {
        val host = uri.host?.lowercase()
        if (host != HOSTED_PAIRING_HOST && host != "www.$HOSTED_PAIRING_HOST") {
            // Direct desktop pairing links still work when they carry a token.
            val parts = parseParts(raw) ?: return null
            val endpoint = runCatching { normalizeEndpoint(raw) }.getOrNull() ?: return null
            return DeepLinkRoute(endpoint = endpoint, token = parts.token)
        }
        val path = uri.path.orEmpty().trimEnd('/')
        val allowedPath = path.isEmpty() ||
            path == "/" ||
            path == "/pair" ||
            path == "/app" ||
            path.startsWith("/pair/") ||
            path.startsWith("/app/")
        if (!allowedPath) return null

        val token = extractToken(uri) ?: return null
        val hostParam = parseQuery(uri.rawQuery ?: uri.query)["host"]
            ?: return null // hosted root links must carry ?host=
        val endpoint = runCatching { normalizeEndpoint(hostParam) }.getOrNull() ?: return null
        return DeepLinkRoute(endpoint = endpoint, token = token)
    }

    private fun parseCustomSchemeDeepLink(uri: URI): DeepLinkRoute? {
        // poracode://pair?... or poracode:pair?...
        val authority = uri.host?.lowercase() ?: uri.path?.trimStart('/')?.substringBefore('/')
        if (authority != null && authority != CUSTOM_PAIR_HOST && authority.isNotEmpty()) {
            // Only //pair is supported for dev/simulator fallback.
            if (uri.path?.contains("pair") != true && authority != CUSTOM_PAIR_HOST) {
                return null
            }
        }

        val query = parseQuery(uri.rawQuery ?: uri.query)
        val hostParam = query["host"]?.trim().orEmpty()
        if (hostParam.isEmpty()) return null
        // Endpoint only from decoded host= http(s) parameter — never invent from scheme.
        val hostUri = runCatching { URI(hostParam) }.getOrNull() ?: return null
        val hostScheme = hostUri.scheme?.lowercase()
        if (hostScheme != "http" && hostScheme != "https") return null

        val token = extractToken(uri) ?: return null
        val endpoint = runCatching { normalizeEndpoint(hostParam) }.getOrNull() ?: return null
        return DeepLinkRoute(endpoint = endpoint, token = token)
    }

    private fun extractToken(uri: URI): String? {
        val fragment = uri.rawFragment ?: uri.fragment
        val fromFragment = parseQuery(fragment)["token"]?.trim().orEmpty()
        if (fromFragment.isNotEmpty()) return fromFragment
        val fromQuery = parseQuery(uri.rawQuery ?: uri.query)["token"]?.trim().orEmpty()
        return fromQuery.takeIf { it.isNotEmpty() }
    }

    /**
     * Normalize an endpoint or pairing URL to the desktop HTTP API base.
     * - Hosted links use `?host=` as the real endpoint
     * - Vite dev port 3100 rewrites to remote-access port 49152
     * - Strips pair/app/desktop/mobile.html/index.html suffixes
     * - Preserves relay base paths (e.g. `/s/server-1`)
     */
    fun normalizeEndpoint(value: String): String {
        val trimmed = value.trim()
        require(trimmed.isNotEmpty()) { "Enter a valid Poracode server URL or pairing link." }

        var uri = runCatching { URI(trimmed) }.getOrElse {
            throw PairingException.InvalidUrl
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            throw PairingException.InvalidUrl
        }
        if (uri.host.isNullOrBlank()) {
            throw PairingException.InvalidUrl
        }

        val hostParam = parseQuery(uri.rawQuery ?: uri.query)["host"]
        if (!hostParam.isNullOrBlank()) {
            return normalizeEndpoint(hostParam)
        }

        if (uri.port == VITE_DEV_SERVER_PORT) {
            uri = URI(
                uri.scheme,
                uri.userInfo,
                uri.host,
                DEFAULT_REMOTE_ACCESS_PORT,
                uri.path,
                null,
                null,
            )
        } else {
            uri = URI(
                uri.scheme,
                uri.userInfo,
                uri.host,
                uri.port,
                uri.path,
                null,
                null,
            )
        }

        val parts = uri.path
            .orEmpty()
            .split('/')
            .filter { it.isNotEmpty() }
            .toMutableList()
        val dropLast = setOf("pair", "app", "desktop", "mobile.html", "index.html")
        if (parts.isNotEmpty() && parts.last() in dropLast) {
            parts.removeAt(parts.lastIndex)
        }
        val path = if (parts.isEmpty()) "" else "/" + parts.joinToString("/")
        val rebuilt = URI(
            uri.scheme,
            uri.userInfo,
            uri.host,
            uri.port,
            path.ifEmpty { null },
            null,
            null,
        )
        return rebuilt.toString().trimEnd('/')
    }

    fun toWebSocketBaseUrl(httpBase: String): String {
        val uri = URI(httpBase)
        val scheme = when (uri.scheme?.lowercase()) {
            "https" -> "wss"
            "http" -> "ws"
            else -> throw PairingException.InvalidUrl
        }
        return URI(
            scheme,
            uri.userInfo,
            uri.host,
            uri.port,
            uri.path,
            null,
            null,
        ).toString().trimEnd('/')
    }

    /**
     * An `http:` endpoint on a non-loopback host (LAN cleartext).
     * Loopback is excluded because secure contexts treat it specially.
     */
    fun isCleartextLanUrl(value: String): Boolean {
        val uri = runCatching { URI(value) }.getOrNull() ?: return false
        if (uri.scheme?.lowercase() != "http") return false
        val host = uri.host ?: return false
        return !isLoopbackHostname(host)
    }

    fun isLoopbackHostname(hostname: String): Boolean {
        val host = hostname.lowercase().removePrefix("[").removeSuffix("]")
        if (host == "localhost" ||
            host == "127.0.0.1" ||
            host == "::1" ||
            host == "0:0:0:0:0:0:0:1" ||
            host.endsWith(".localhost")
        ) {
            return true
        }
        // IPv4 loopback 127.0.0.0/8 via literal parsing only.
        val ipv4 = parseIpv4(host) ?: return false
        return ipv4[0] == 127
    }

    /**
     * RFC1918 / link-local / loopback / unique-local. Used by the cleartext security gate
     * so arbitrary internet HTTP is rejected while LAN/dev pairing remains possible.
     *
     * Uses **literal IP parsing only** — never hostname-prefix heuristics that false-positive
     * on names like `fc-prod.example.com` or `10.example.com`.
     */
    fun isPrivateOrLoopbackHostname(hostname: String): Boolean {
        val host = hostname.lowercase().removePrefix("[").removeSuffix("]")
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
            return true
        }
        if (host == "10.0.2.2") return true // Android emulator → host machine

        parseIpv4(host)?.let { octets ->
            val (a, b) = octets
            if (a == 10) return true
            if (a == 127) return true
            if (a == 172 && b in 16..31) return true
            if (a == 192 && b == 168) return true
            if (a == 169 && b == 254) return true
            return false
        }

        parseIpv6(host)?.let { groups ->
            // ::1 loopback
            if (groups.dropLast(1).all { it == 0 } && groups.last() == 1) return true
            // fc00::/7 unique local (fc.. or fd..)
            val first = groups[0]
            if ((first and 0xfe00) == 0xfc00) return true
            // fe80::/10 link-local
            if ((first and 0xffc0) == 0xfe80) return true
            return false
        }

        return false
    }

    /**
     * Strict IPv4 literal: four decimal octets 0–255, no leading junk, no hostname prefixes.
     */
    fun parseIpv4(host: String): IntArray? {
        val parts = host.split('.')
        if (parts.size != 4) return null
        val octets = IntArray(4)
        for (i in 0 until 4) {
            val part = parts[i]
            if (part.isEmpty() || part.length > 3) return null
            if (part.any { !it.isDigit() }) return null
            // Reject leading zeros like 01 except bare "0".
            if (part.length > 1 && part.startsWith('0')) return null
            val value = part.toIntOrNull() ?: return null
            if (value !in 0..255) return null
            octets[i] = value
        }
        return octets
    }

    /**
     * Minimal IPv6 literal parser for cleartext policy (supports compressed `::` form).
     * Returns eight 16-bit groups, or null if not a valid IPv6 literal.
     */
    fun parseIpv6(host: String): IntArray? {
        if (host.isEmpty() || host.contains('.')) {
            // Skip IPv4-mapped forms for this gate; treat as non-private hostname.
            return null
        }
        if (host.count { it == ':' } < 2) return null

        val lower = host.lowercase()
        if (!lower.all { it.isDigit() || it in 'a'..'f' || it == ':' }) return null

        val sides = lower.split("::", limit = 2)
        if (sides.size > 2) return null

        fun parseSide(side: String): List<Int>? {
            if (side.isEmpty()) return emptyList()
            return side.split(':').map { part ->
                if (part.isEmpty() || part.length > 4) return null
                part.toIntOrNull(16) ?: return null
            }
        }

        return if (sides.size == 1) {
            val groups = parseSide(sides[0]) ?: return null
            if (groups.size != 8) return null
            groups.toIntArray()
        } else {
            val left = parseSide(sides[0]) ?: return null
            val right = parseSide(sides[1]) ?: return null
            val missing = 8 - left.size - right.size
            if (missing < 1) return null
            (left + List(missing) { 0 } + right).toIntArray()
        }
    }

    private fun parseQuery(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) return emptyMap()
        return raw.split('&')
            .mapNotNull { pair ->
                if (pair.isEmpty()) return@mapNotNull null
                val idx = pair.indexOf('=')
                val key = if (idx >= 0) pair.substring(0, idx) else pair
                val value = if (idx >= 0) pair.substring(idx + 1) else ""
                decode(key) to decode(value)
            }
            .toMap()
    }

    private fun decode(value: String): String =
        // String charset name is API-safe (Charset overload requires API 33).
        URLDecoder.decode(value, "UTF-8")
}

sealed class PairingException(message: String) : Exception(message) {
    data object InvalidUrl : PairingException(
        "Enter a valid Poracode server URL or pairing link.",
    )

    data object MissingToken : PairingException(
        "That pairing link is missing a token. Paste the full link from the desktop.",
    )

    data class ProtocolVersionMismatch(val found: Int?) : PairingException(
        "This app version is incompatible with that server. Update both to the same version.",
    )

    data object EmptyCredential : PairingException("Pairing token cannot be empty.")
}
