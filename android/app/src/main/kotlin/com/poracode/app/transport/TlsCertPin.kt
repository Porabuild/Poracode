package com.poracode.app.transport

import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient

/**
 * V6 A.2: SHA-256 of the TLS leaf DER (the desktop QR `#fp=` digest).
 * Not an OkHttp SPKI [okhttp3.CertificatePinner] pin.
 */
object TlsCertPin {
    const val MISMATCH_CODE = "certificate_fingerprint_mismatch"
    const val MISMATCH_MESSAGE =
        "The server's TLS certificate does not match the fingerprint from the pairing code. Re-pair from the desktop Remote Access panel."

    fun mismatchMessage(): String {
        return try {
            val app =
                Class.forName("android.app.AppGlobals")
                    .getMethod("getInitialApplication")
                    .invoke(null) as? android.content.Context
            app?.getString(com.poracode.app.R.string.tls_pin_mismatch) ?: MISMATCH_MESSAGE
        } catch (_: Throwable) {
            MISMATCH_MESSAGE
        }
    }

    private val HEX = Regex("^[0-9a-f]{64}$")

    fun normalize(hex: String?): String? {
        if (hex.isNullOrBlank()) return null
        val trimmed = hex.trim().lowercase()
        val bare = if (trimmed.startsWith("sha256:")) trimmed.substring(7) else trimmed
        return bare.takeIf { HEX.matches(it) }
    }

    fun sha256Hex(der: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(der)
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }

    fun matches(der: ByteArray, expectedHex: String): Boolean {
        val expected = normalize(expectedHex) ?: return false
        return sha256Hex(der) == expected
    }

    fun isMismatch(error: Throwable): Boolean {
        var current: Throwable? = error
        while (current != null) {
            if (current.message?.contains(MISMATCH_CODE) == true) return true
            current = current.cause
        }
        return false
    }

    fun pin(builder: OkHttpClient.Builder, fingerprint: String): OkHttpClient.Builder {
        val expected = normalize(fingerprint) ?: return builder
        val trustManager = LeafSha256TrustManager(expected)
        val ssl = SSLContext.getInstance("TLS")
        ssl.init(null, arrayOf(trustManager), SecureRandom())
        return builder
            .sslSocketFactory(ssl.socketFactory, trustManager)
            .hostnameVerifier { _, _ -> true }
    }

    /**
     * The one pin-aware client factory: derives from [base] a client that enforces the
     * leaf fingerprint published in [TlsCertPinStore] for [endpoint]; with no stored
     * pin, [base] is returned unchanged (default trust). Resolve at use time — per
     * request or per socket open — so a pin published after construction still binds
     * and an unpair that drops the pin is honored on the next call.
     *
     * The built client is cached per (base, host, port, fingerprint), so pooled
     * connections survive across calls; the pin itself is still looked up per call,
     * and [TlsCertPinStore] evicts cached clients when the fingerprint changes or on
     * unpair, so a new pin simply rebuilds.
     */
    fun clientForEndpoint(endpoint: String?, base: OkHttpClient): OkHttpClient {
        if (endpoint == null) return base
        val pin = TlsCertPinStore.fingerprintForEndpoint(endpoint) ?: return base
        val hostPort = TlsCertPinStore.keyForEndpoint(endpoint) ?: return base
        val key = PinnedClientKey(base, hostPort, pin)
        synchronized(pinnedClientCache) {
            pinnedClientCache[key]?.let { return it }
        }
        val client = pin(base.newBuilder(), pin).build()
        synchronized(pinnedClientCache) {
            while (pinnedClientCache.size >= PINNED_CLIENT_CACHE_LIMIT) {
                pinnedClientCache.remove(pinnedClientCache.keys.iterator().next())
            }
            pinnedClientCache[key] = client
        }
        return client
    }

    /** Drops cached clients for [hostPort]; with [keepFingerprint], only other fingerprints. */
    internal fun evictPinnedClients(hostPort: String, keepFingerprint: String? = null) {
        synchronized(pinnedClientCache) {
            for (key in pinnedClientCache.keys.toList()) {
                if (key.hostPort == hostPort && key.fingerprint != keepFingerprint) {
                    pinnedClientCache.remove(key)
                }
            }
        }
    }

    internal fun evictAllPinnedClients() {
        synchronized(pinnedClientCache) { pinnedClientCache.clear() }
    }

    private const val PINNED_CLIENT_CACHE_LIMIT = 8

    private val pinnedClientCache = LinkedHashMap<PinnedClientKey, OkHttpClient>()

    /** Cache identity: base client plus the normalized `host:port` and enforced fingerprint. */
    private data class PinnedClientKey(
        val base: OkHttpClient,
        val hostPort: String,
        val fingerprint: String,
    )
}

/** Process-lifetime pin table keyed by `host:port`. */
object TlsCertPinStore {
    private val pins = LinkedHashMap<String, String>()

    @Synchronized
    fun register(endpoint: String, fingerprint: String?) {
        val hex = TlsCertPin.normalize(fingerprint) ?: return
        val key = keyForEndpoint(endpoint) ?: return
        pins[key] = hex
        // A changed fingerprint invalidates cached clients for this host:port.
        TlsCertPin.evictPinnedClients(key, keepFingerprint = hex)
    }

    @Synchronized
    fun fingerprintForEndpoint(endpoint: String): String? {
        val key = keyForEndpoint(endpoint) ?: return null
        return pins[key]
    }

    @Synchronized
    fun remove(endpoint: String) {
        keyForEndpoint(endpoint)?.let {
            pins.remove(it)
            TlsCertPin.evictPinnedClients(it)
        }
    }

    @Synchronized
    fun clear() {
        pins.clear()
        TlsCertPin.evictAllPinnedClients()
    }

    /** Test seam: pairing tests must not leak pins across cases. */
    @Synchronized
    fun resetForTests() {
        clear()
    }

    internal fun keyForEndpoint(endpoint: String): String? {
        val uri = runCatching { URI(endpoint) }.getOrNull() ?: return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        val port = when {
            uri.port > 0 -> uri.port
            uri.scheme.equals("https", ignoreCase = true) -> 443
            else -> 80
        }
        return "$host:$port"
    }
}

internal class LeafSha256TrustManager(
    private val expectedHex: String,
) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) = Unit

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        val leaf = chain.firstOrNull()
            ?: throw CertificateException(TlsCertPin.MISMATCH_CODE)
        if (!TlsCertPin.matches(leaf.encoded, expectedHex)) {
            throw CertificateException(TlsCertPin.MISMATCH_CODE)
        }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}
