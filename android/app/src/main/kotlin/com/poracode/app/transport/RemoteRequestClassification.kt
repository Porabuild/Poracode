package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.net.URI
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

enum class RemoteRequestPriority {
    Control,
    Interactive,
    Background,
}

internal const val DEFAULT_REMOTE_OVERLOAD_MAX_RETRIES = 3
internal const val MIN_OVERLOAD_DELAY_MS = 150L
internal const val MAX_BACKGROUND_PAUSE_MS = 2_000L
private const val MAX_OVERLOAD_DELAY_MS = 5_000L
private val DEFAULT_OVERLOAD_BACKOFF_MS = longArrayOf(200L, 500L, 1_200L)

private val CONTROL_THREAD_SUFFIXES = setOf(
    "/interrupt",
    "/close",
    "/terminal/close",
    "/requests/resolve",
)

private val BACKGROUND_REMOTE_PROCEDURES = setOf(
    "getGitStatus",
    "gitListBranches",
    "gitListWorktrees",
    "gitProjectSnapshot",
    "gitWorktreeStatusBatch",
    "gitWorktreeSourceBranchBatch",
    "gitGetWorktreeSourceBranch",
    "gitGetWorktreeOwner",
    "ghCheckAvailable",
    "ghGetPrForBranch",
    "ghListPrs",
    "gitFetch",
    "workflowGetRun",
)

private val RETRYABLE_429_ADMISSION_CODES = setOf(
    "overloaded",
    "principal_busy",
    "settings_overloaded",
)

private val ENVIRONMENT_PROXY_PREFIX = Regex("^/api/environments/[^/]+/proxy(/.*)?$")

private fun normalizePathname(rawPath: String): String {
    val noQuery = rawPath.substringBefore('?')
    val unwrapped = ENVIRONMENT_PROXY_PREFIX.matchEntire(noQuery)?.groupValues?.getOrNull(1)
        ?.takeIf { it.isNotEmpty() }
        ?: noQuery
    return if (unwrapped.startsWith("/")) unwrapped else "/$unwrapped"
}

private fun isControlThreadPath(pathname: String): Boolean {
    if (!pathname.startsWith("/api/threads/")) return false
    for (suffix in CONTROL_THREAD_SUFFIXES) {
        if (!pathname.endsWith(suffix)) continue
        val rawId = pathname.substring("/api/threads/".length, pathname.length - suffix.length)
        if (rawId.isNotEmpty() && '/' !in rawId) return true
    }
    return false
}

private fun extractProcedureName(jsonBody: String?): String? {
    if (jsonBody.isNullOrBlank()) return null
    val parsed = runCatching { Json.parseToJsonElement(jsonBody) as? JsonObject }.getOrNull()
        ?: return null
    return (parsed["procedure"] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
}

fun classifyRemoteRequestPriority(
    method: String,
    path: String,
    jsonBody: String? = null,
): RemoteRequestPriority {
    val normalizedMethod = method.uppercase()
    val pathname = normalizePathname(path)

    if (normalizedMethod == "POST") {
        if (
            isControlThreadPath(pathname) ||
            pathname == "/oauth/token" ||
            pathname == "/api/auth/refresh" ||
            pathname == "/api/auth/websocket-ticket"
        ) {
            return RemoteRequestPriority.Control
        }
        if (pathname == "/api/git/call") {
            val procedure = extractProcedureName(jsonBody)
            if (procedure != null && procedure in BACKGROUND_REMOTE_PROCEDURES) {
                return RemoteRequestPriority.Background
            }
            return RemoteRequestPriority.Interactive
        }
        if (
            pathname == "/api/files/image-ticket" ||
            pathname == "/api/profile/core-stats" ||
            pathname == "/api/profile/token-stats"
        ) {
            return RemoteRequestPriority.Background
        }
        return RemoteRequestPriority.Interactive
    }

    if (
        pathname == "/api/files/image" ||
        pathname == "/api/files/media" ||
        pathname == "/api/host/update" ||
        (pathname.startsWith("/api/agents/") && pathname.endsWith("/slash-commands"))
    ) {
        return RemoteRequestPriority.Background
    }

    return RemoteRequestPriority.Interactive
}

fun originKeyForEndpoint(endpoint: String): String = runCatching {
    val uri = URI(endpoint)
    val scheme = uri.scheme?.lowercase() ?: return@runCatching endpoint
    val host = uri.host?.lowercase() ?: return@runCatching endpoint
    val port = uri.port
    if (port == -1 || (scheme == "http" && port == 80) || (scheme == "https" && port == 443)) {
        "$scheme://$host"
    } else {
        "$scheme://$host:$port"
    }
}.getOrDefault(endpoint)

/**
 * Only definite uncommitted host admission rejections (429 admission codes and
 * 503 `host_busy`) are safe to retry after scheduling backoff. Ambiguous or
 * domain failures never retry here.
 */
fun isRetryableRemoteAdmissionError(error: Throwable): Boolean {
    val remote = error as? RemoteClientException ?: return false
    if (remote.status == 429 && remote.code in RETRYABLE_429_ADMISSION_CODES) return true
    return remote.status == 503 && remote.code == "host_busy"
}

fun parseRetryAfterMs(
    headerValue: String?,
    nowMs: Long = System.currentTimeMillis(),
): Long? {
    val trimmed = headerValue?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    trimmed.toLongOrNull()?.let { seconds ->
        return maxOf(0L, seconds * 1_000L)
    }
    return runCatching {
        val epochMs = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME)
            .toInstant()
            .toEpochMilli()
        maxOf(0L, epochMs - nowMs)
    }.getOrNull()
}

fun computeOverloadRetryDelayMs(attempt: Int, retryAfterMs: Long? = null): Long {
    if (retryAfterMs != null && retryAfterMs >= 0L) {
        return retryAfterMs.coerceIn(MIN_OVERLOAD_DELAY_MS, MAX_OVERLOAD_DELAY_MS)
    }
    val idx = attempt.coerceIn(0, DEFAULT_OVERLOAD_BACKOFF_MS.lastIndex)
    return DEFAULT_OVERLOAD_BACKOFF_MS[idx]
}
