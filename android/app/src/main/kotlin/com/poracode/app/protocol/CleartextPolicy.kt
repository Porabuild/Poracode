package com.poracode.app.protocol

import java.net.URI

/**
 * Application-level cleartext gate.
 *
 * Android's network-security-config cannot express private IP ranges as CIDR, so
 * cleartext is permitted at the OS layer for intentional LAN pairing, and this
 * policy rejects `http://` to non-private / non-loopback hosts before any
 * request is issued. Arbitrary Internet HTTP is never allowed.
 *
 * See `res/xml/network_security_config.xml`.
 */
object CleartextPolicy {
    fun enforce(url: String) {
        val uri = runCatching { URI(url) }.getOrElse {
            throw CleartextNotAllowedException(url, "Invalid URL")
        }
        enforce(uri)
    }

    fun enforce(uri: URI) {
        val scheme = uri.scheme?.lowercase() ?: return
        if (scheme != "http" && scheme != "ws") return
        val host = uri.host
            ?: throw CleartextNotAllowedException(uri.toString(), "Missing host")
        if (!PairingUrl.isPrivateOrLoopbackHostname(host)) {
            throw CleartextNotAllowedException(
                uri.toString(),
                "Cleartext HTTP/WS is only allowed for loopback and private LAN hosts. Use HTTPS.",
            )
        }
    }
}

class CleartextNotAllowedException(
    val url: String,
    message: String,
) : Exception("$message ($url)")
