package com.poracode.app.transport.environments

/**
 * Reserved C1 environment wire constants (ADR §5). The parent proxy is the only
 * default data-plane path; the child bearer stays in `Authorization` and the
 * separate parent authority travels in the reserved request header.
 */
object EnvironmentProtocol {
    /** Parent access token on every proxied dispatch; consumed by the parent, never dialed to the child. */
    const val AUTHORIZATION_HEADER = "x-poracode-environment-authorization"

    /**
     * Trusted parent-origin marker on a parent proxy auth rejection. Only the
     * parent sets it, and only for its own authentication-step rejections; the
     * proxy strips the whole reserved namespace from child responses, so the
     * client must never infer authority from status alone (R1).
     */
    const val AUTH_AUTHORITY_HEADER = "x-poracode-environment-auth-authority"
    const val AUTH_AUTHORITY_PARENT = "parent"

    /** One-use parent WS upgrade ticket query parameter, paired with the child `ticket`. */
    const val PARENT_TICKET_PARAM = "parentTicket"

    /** Bounded parent-ticket pairing cache: one entry per minted child ticket. */
    const val PARENT_TICKET_CACHE_MAX_ENTRIES = 32

    const val MANAGEMENT_BASE_PATH = com.poracode.app.model.EnvironmentEndpoints.MANAGEMENT_BASE_PATH

    fun managementPath(environmentId: String, suffix: String = ""): String {
        val base = "$MANAGEMENT_BASE_PATH/${encodePathSegment(environmentId)}"
        return if (suffix.isEmpty()) base else "$base/$suffix"
    }

    /** Parent data-plane prefix; authorized clients receive this path as the environment endpoint. */
    fun proxyPrefix(environmentId: String): String =
        com.poracode.app.model.EnvironmentEndpoints.proxyPrefix(environmentId)

    private fun encodePathSegment(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}
