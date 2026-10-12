package com.poracode.app.model

import java.net.URLEncoder

/**
 * Pure derivation of an environment's parent-proxy endpoint (C1).
 *
 * The endpoint stored on an environment record is a convenience snapshot, never
 * authority: every resolve derives the endpoint from the CURRENT parent record,
 * so a parent re-pair, base-URL, or port change moves the child endpoint with
 * it. A missing parent (or a parent that is itself an environment) resolves to
 * `null`; callers must fail closed before any fetch instead of falling back to
 * an unauthenticated direct dial.
 *
 * The proxy prefix is the only shape the client ever composes: an absolute or
 * shape-foreign child endpoint can never be dialed.
 */
object EnvironmentEndpoints {
    const val MANAGEMENT_BASE_PATH = "/api/environments"

    /** Parent data-plane prefix; authorized clients receive this path as the environment endpoint. */
    fun proxyPrefix(environmentId: String): String =
        "$MANAGEMENT_BASE_PATH/${encodePathSegment(environmentId)}/proxy/"

    /**
     * Absolute proxy endpoint of [environmentId] behind [parent], or null when
     * the parent has no usable base URL. Trailing slash normalized off, matching
     * the stored environment endpoint shape.
     */
    fun proxyEndpoint(parent: HostRecord, environmentId: String): String? {
        if (parent.httpBaseUrl.isBlank()) return null
        return (parent.httpBaseUrl.trimEnd('/') + proxyPrefix(environmentId)).trimEnd('/')
    }

    /**
     * True when [endpoint] is a parent proxy prefix (`.../api/environments/<id>/proxy`),
     * including a relay/base-path prefix. A client whose endpoint has this shape
     * must resolve a live authority before dialing: with none, it fails closed
     * rather than sending a bare child bearer to the proxy.
     */
    fun isProxyEndpoint(endpoint: String): Boolean {
        val trimmed = endpoint.trim().trimEnd('/')
        if (!trimmed.contains("$MANAGEMENT_BASE_PATH/")) return false
        return trimmed.endsWith("/proxy")
    }

    private fun encodePathSegment(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}
